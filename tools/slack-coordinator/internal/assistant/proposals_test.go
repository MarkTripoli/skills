package assistant

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/agent"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// makeProposal builds a minimal valid Proposal for tests.
func makeProposal(watch []string) *agent.Proposal {
	return &agent.Proposal{
		Watch: watch,
		Trigger: agent.Trigger{
			Kind:  agent.TriggerSchedule,
			Daily: "09:00",
		},
		Instruction: "summarize open PRs",
		DeliverTo:   agent.DeliverTo{DM: true},
		Summary:     "Daily PR summary",
	}
}

func TestProposalValidChannelRendersAndStores(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	slack.channels = map[string]string{"C0GENERAL1": "general"}
	slack.ownerTZ = "Europe/Berlin"

	proposal := makeProposal([]string{"#general"})
	out := agent.RunOutcome{ExitCode: 0, Proposal: proposal, ResultSource: "result.md"}

	id := deliverOne(t, s, clock, runner, out)
	s.inflight.Wait()

	const root = "1700000000.001000"
	const ackTS = "1700000000.900001"

	// The ack must have been edited to the rendered proposal.
	if len(slack.updates) != 1 {
		t.Fatalf("updates = %d; want 1 edit to the ack", len(slack.updates))
	}
	update := slack.updates[0]
	if update.channel != "D1" || update.ts != ackTS {
		t.Fatalf("update = %+v; want D1/%s", update, ackTS)
	}
	text := update.text
	if !strings.HasPrefix(text, "*Proposed task*") {
		t.Fatalf("rendered text does not start with *Proposed task*:\n%s", text)
	}
	if !strings.Contains(text, "Daily PR summary") {
		t.Fatalf("rendered text missing summary:\n%s", text)
	}
	if !strings.Contains(text, "#general") {
		t.Fatalf("rendered text missing #general:\n%s", text)
	}
	if !strings.Contains(text, "daily 09:00 Europe/Berlin") {
		t.Fatalf("rendered text missing trigger with tz:\n%s", text)
	}
	if !strings.Contains(text, "this DM") {
		t.Fatalf("rendered text missing deliver to:\n%s", text)
	}
	if !strings.HasSuffix(text, "Reply yes to record this task, no to drop it, or tell me what to change.") {
		t.Fatalf("rendered text missing confirm sentence:\n%s", text)
	}

	// pending_proposal must have the channel id, tz filled, confirmable true.
	req, ok, err := s.DB.GetDMRequest(context.Background(), root)
	if err != nil || !ok {
		t.Fatalf("GetDMRequest: %v %v", ok, err)
	}
	if !req.PendingProposal.Valid || req.PendingProposal.String == "" {
		t.Fatalf("pending_proposal not stored")
	}
	var stored pendingProposal
	if err := json.Unmarshal([]byte(req.PendingProposal.String), &stored); err != nil {
		t.Fatalf("unmarshal pending_proposal: %v", err)
	}
	if !stored.Confirmable {
		t.Fatalf("confirmable = false; want true")
	}
	if len(stored.Proposal.Watch) != 1 || stored.Proposal.Watch[0] != "C0GENERAL1" {
		t.Fatalf("stored Watch = %v; want [C0GENERAL1]", stored.Proposal.Watch)
	}
	if stored.Proposal.Trigger.TZ != "Europe/Berlin" {
		t.Fatalf("stored TZ = %q; want Europe/Berlin", stored.Proposal.Trigger.TZ)
	}
	if stored.RunID != id {
		t.Fatalf("stored RunID = %q; want %q", stored.RunID, id)
	}

	// Run must be done.
	run := getRun(t, s, id)
	if run.State != db.RunDone {
		t.Fatalf("run state = %s; want done", run.State)
	}
}

func TestProposalUnresolvableChannelIsNotConfirmable(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	slack.channels = map[string]string{} // #nowhere not found
	slack.ownerTZ = "Europe/Berlin"

	proposal := makeProposal([]string{"#nowhere"})
	out := agent.RunOutcome{ExitCode: 0, Proposal: proposal, ResultSource: "result.md"}

	id := deliverOne(t, s, clock, runner, out)
	s.inflight.Wait()

	const ackTS = "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0].ts != ackTS {
		t.Fatalf("updates = %+v; want 1 ack edit", slack.updates)
	}
	text := slack.updates[0].text
	if !strings.Contains(text, "Not confirmable yet: invite the bot to #nowhere first.") {
		t.Fatalf("rendered text missing warning line:\n%s", text)
	}
	if !strings.HasSuffix(text, "Reply yes to record this task, no to drop it, or tell me what to change.") {
		t.Fatalf("rendered text missing confirm sentence:\n%s", text)
	}

	const root = "1700000000.001000"
	req, ok, err := s.DB.GetDMRequest(context.Background(), root)
	if err != nil || !ok {
		t.Fatalf("GetDMRequest: %v %v", ok, err)
	}
	var stored pendingProposal
	if err := json.Unmarshal([]byte(req.PendingProposal.String), &stored); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if stored.Confirmable {
		t.Fatalf("confirmable = true; want false for unresolved channel")
	}

	run := getRun(t, s, id)
	if run.State != db.RunDone {
		t.Fatalf("run state = %s; want done", run.State)
	}
}

func TestProposalErrDeliversFailure(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)

	schemaErr := &schemaError{"trigger.tz is required for schedule triggers"}
	out := agent.RunOutcome{ExitCode: 0, ProposalErr: schemaErr, ResultSource: "result.md"}

	id := deliverOne(t, s, clock, runner, out)
	s.inflight.Wait()

	const ackTS = "1700000000.900001"
	if len(slack.updates) != 1 || slack.updates[0].text != failedAck {
		t.Fatalf("updates = %+v; want ack edited to Failed", slack.updates)
	}
	if len(slack.updates[0].ts) == 0 || slack.updates[0].ts != ackTS {
		t.Fatalf("update ts = %q; want %s", slack.updates[0].ts, ackTS)
	}
	// A reply with the schema error must be posted.
	if len(slack.posts) < 2 {
		t.Fatalf("posts = %d; want ack then error reply", len(slack.posts))
	}
	reply := slack.posts[len(slack.posts)-1]
	if !strings.HasPrefix(reply.text, schemaErr.msg) {
		t.Fatalf("reply = %q; want prefix %q", reply.text, schemaErr.msg)
	}

	run := getRun(t, s, id)
	if run.State != db.RunFailed {
		t.Fatalf("run state = %s; want failed", run.State)
	}
}

func TestProposalWithResultMdIncludesProseUnderSummary(t *testing.T) {
	s, slack, clock, runner := newDispatchService(t)
	slack.channels = map[string]string{"C0GENERAL1": "general"}
	slack.ownerTZ = "Europe/Berlin"

	proposal := makeProposal([]string{"#general"})
	const prose = "Here are the open pull requests: #12 and #14."
	out := agent.RunOutcome{ExitCode: 0, Proposal: proposal, Result: prose, ResultSource: "result.md"}

	deliverOne(t, s, clock, runner, out)
	s.inflight.Wait()

	if len(slack.updates) != 1 {
		t.Fatalf("updates = %d; want 1", len(slack.updates))
	}
	text := slack.updates[0].text
	if !strings.Contains(text, prose) {
		t.Fatalf("rendered text missing result.md prose:\n%s", text)
	}
	// Prose must appear after summary and before Watch line.
	summaryIdx := strings.Index(text, "Daily PR summary")
	proseIdx := strings.Index(text, prose)
	watchIdx := strings.Index(text, "Watch:")
	if summaryIdx < 0 || proseIdx < 0 || watchIdx < 0 {
		t.Fatalf("missing expected sections in:\n%s", text)
	}
	if !(summaryIdx < proseIdx && proseIdx < watchIdx) {
		t.Fatalf("section order wrong: summary=%d prose=%d watch=%d", summaryIdx, proseIdx, watchIdx)
	}
}

// schemaError is a minimal error implementation for testing ProposalErr.
type schemaError struct{ msg string }

func (e *schemaError) Error() string { return e.msg }
