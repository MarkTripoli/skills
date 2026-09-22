package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validProposal(kind string) Proposal {
	p := Proposal{
		Watch:       []string{"C123"},
		Instruction: "summarize the day",
		DeliverTo:   DeliverTo{DM: true},
		Summary:     "daily summary",
	}
	switch kind {
	case TriggerSchedule:
		p.Trigger = Trigger{Kind: kind, Daily: "09:00", TZ: "America/New_York"}
	case TriggerWindowEnd:
		p.Trigger = Trigger{Kind: kind, At: "2026-10-01T17:00:00Z"}
	case TriggerEachMessage:
		p.Trigger = Trigger{Kind: kind}
	}
	return p
}

func TestProposalValidate(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Proposal)
		wantErr string // "" for valid; otherwise the field prefix the error must carry
	}{
		{name: "valid schedule daily", mutate: func(*Proposal) {}},
		{name: "valid schedule every_hours", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerSchedule, EveryHours: 4}
		}},
		{name: "valid window_end", mutate: func(p *Proposal) { *p = validProposal(TriggerWindowEnd) }},
		{name: "valid each_message to channel thread", mutate: func(p *Proposal) {
			*p = validProposal(TriggerEachMessage)
			p.Trigger.DebounceSeconds = 60
			p.DeliverTo = DeliverTo{ChannelID: "C999", ThreadTS: "1700000000.000100"}
		}},

		{name: "empty watch", mutate: func(p *Proposal) { p.Watch = nil }, wantErr: "watch:"},
		{name: "empty instruction", mutate: func(p *Proposal) { p.Instruction = "" }, wantErr: "instruction:"},
		{name: "unknown kind", mutate: func(p *Proposal) { p.Trigger.Kind = "cron" }, wantErr: "trigger.kind:"},
		{name: "schedule with neither form", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerSchedule}
		}, wantErr: "trigger: schedule needs exactly one of daily or every_hours"},
		{name: "schedule with both forms", mutate: func(p *Proposal) {
			p.Trigger.EveryHours = 2
		}, wantErr: "trigger: schedule needs exactly one of daily or every_hours"},
		{name: "schedule negative every_hours", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerSchedule, EveryHours: -1}
		}, wantErr: "trigger.every_hours:"},
		{name: "schedule daily not HH:MM", mutate: func(p *Proposal) { p.Trigger.Daily = "9am" }, wantErr: "trigger.daily:"},
		{name: "schedule unknown tz", mutate: func(p *Proposal) { p.Trigger.TZ = "Mars/Olympus" }, wantErr: "trigger.tz:"},
		{name: "window_end without at", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerWindowEnd}
		}, wantErr: "trigger.at:"},
		{name: "window_end at not RFC 3339", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerWindowEnd, At: "tomorrow 5pm"}
		}, wantErr: "trigger.at:"},
		{name: "each_message negative debounce", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerEachMessage, DebounceSeconds: -5}
		}, wantErr: "trigger.debounce_seconds:"},
		{name: "each_message with schedule fields", mutate: func(p *Proposal) {
			p.Trigger = Trigger{Kind: TriggerEachMessage, Daily: "09:00"}
		}, wantErr: "trigger: each_message takes no daily, every_hours, or at"},
		{name: "deliver_to neither", mutate: func(p *Proposal) { p.DeliverTo = DeliverTo{} }, wantErr: "deliver_to:"},
		{name: "deliver_to both", mutate: func(p *Proposal) {
			p.DeliverTo = DeliverTo{DM: true, ChannelID: "C999"}
		}, wantErr: "deliver_to:"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := validProposal(TriggerSchedule)
			tc.mutate(&p)
			err := p.Validate()
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.HasPrefix(err.Error(), tc.wantErr) {
				t.Fatalf("Validate() = %v, want error starting %q", err, tc.wantErr)
			}
		})
	}
}

func writeProposalFile(t *testing.T, dir, text string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, "proposal.json"), []byte(text), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestReadProposalAbsentFileIsNilNil(t *testing.T) {
	p, err := ReadProposal(t.TempDir())
	if p != nil || err != nil {
		t.Fatalf("ReadProposal() = %+v, %v; want nil, nil", p, err)
	}
}

func TestReadProposalParsesAndValidates(t *testing.T) {
	dir := t.TempDir()
	writeProposalFile(t, dir, `{
  "watch": ["#eng", "C123"],
  "trigger": {"kind": "each_message"},
  "instruction": "flag incidents",
  "deliver_to": {"channel_id": "C123", "thread_ts": "1700000000.000100"},
  "summary": "incident flagger"
}`)
	p, err := ReadProposal(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(p.Watch) != 2 || p.Watch[0] != "#eng" || p.Trigger.Kind != TriggerEachMessage || p.DeliverTo.ChannelID != "C123" || p.Summary != "incident flagger" {
		t.Errorf("Proposal = %+v", *p)
	}
}

func TestReadProposalRejectsMalformedJSON(t *testing.T) {
	dir := t.TempDir()
	writeProposalFile(t, dir, `{"watch": ["C1"],`)
	p, err := ReadProposal(dir)
	if p != nil || err == nil || !strings.HasPrefix(err.Error(), "proposal.json:") {
		t.Fatalf("ReadProposal() = %+v, %v; want nil and a proposal.json syntax error", p, err)
	}
}

func TestReadProposalRejectsInvalidProposal(t *testing.T) {
	dir := t.TempDir()
	writeProposalFile(t, dir, `{"watch": [], "trigger": {"kind": "each_message"}, "instruction": "x", "deliver_to": {"dm": true}}`)
	p, err := ReadProposal(dir)
	if p != nil || err == nil || !strings.Contains(err.Error(), "watch:") {
		t.Fatalf("ReadProposal() = %+v, %v; want nil and an error naming watch", p, err)
	}
}
