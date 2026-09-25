package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

func dmRunReply(user, channel, root, ts, text string) socketmode.Event {
	evt := ownerDM(user, channel, ts, text)
	msg := evt.Data.(slackevents.EventsAPIEvent).InnerEvent.Data.(*slackevents.MessageEvent)
	msg.ThreadTimeStamp = root
	return evt
}

func startDMRun(t *testing.T, runID string) coordinator.SlackRunRef {
	t.Helper()
	out, code := runCLI(t, "run", "start", "--dm", "--run-id", runID, "--work", runID)
	if code != ExitOK {
		t.Fatalf("DM run start %s: code %d, output %q", runID, code, out)
	}
	var ref coordinator.SlackRunRef
	if err := json.Unmarshal([]byte(out), &ref); err != nil {
		t.Fatal(err)
	}
	return ref
}

func TestOwnerDMRoutesRepliesAcrossIndependentRuns(t *testing.T) {
	_, apiURL := newFakeSlack(t)
	inbound := make(chan socketmode.Event, 4)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemonWith(t, cfg, daemon.Options{SocketModeHealth: func() string { return slackapi.SocketConnected }, Inbound: inbound})

	first := startDMRun(t, "RUN-A")
	second := startDMRun(t, "RUN-B")
	if first.ChannelID != second.ChannelID || first.ChannelID != "D0000000001" {
		t.Fatalf("owner runs opened different DM channels: %q and %q", first.ChannelID, second.ChannelID)
	}
	if first.ThreadTS == "" || second.ThreadTS == "" || first.ThreadTS == second.ThreadTS {
		t.Fatalf("owner runs did not get independent root threads: %q and %q", first.ThreadTS, second.ThreadTS)
	}
	inbound <- dmRunReply("U1", first.ChannelID, first.ThreadTS, "1700000000.001100", "answer for A")
	inbound <- dmRunReply("U1", second.ChannelID, second.ThreadTS, "1700000000.001200", "answer for B")

	for _, tc := range []struct{ id, text string }{{"RUN-B", "answer for B"}, {"RUN-A", "answer for A"}} {
		out, code := runCLI(t, "run", "wait", "--run-id", tc.id)
		var gate coordinator.WriteGate
		if err := json.Unmarshal([]byte(out), &gate); err != nil {
			t.Fatalf("run wait %s stdout %q: %v", tc.id, out, err)
		}
		if code != ExitOwnerInput || gate.Kind != coordinator.GateOwnerInput || gate.Input == nil || gate.Input.Text != tc.text {
			t.Fatalf("run wait %s: code %d gate %+v; want owner input %q", tc.id, code, gate, tc.text)
		}
	}
}

func TestRunWaitReportsUnavailableWhenDaemonIsDown(t *testing.T) {
	newTestHome(t)
	out, code := runCLI(t, "run", "wait", "--run-id", "RUN1")
	var gate coordinator.WriteGate
	if err := json.Unmarshal([]byte(out), &gate); err != nil {
		t.Fatalf("run wait stdout %q: %v", out, err)
	}
	if code != ExitUnavailable || gate.Kind != coordinator.GateUnavailable || !strings.Contains(gate.Reason, "daemon unreachable") {
		t.Fatalf("run wait: code %d gate %+v; want unavailable gate", code, gate)
	}
}

func TestReplyToFinishedDMRunDoesNotBecomeAssistantWork(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	inbound := make(chan socketmode.Event, 4)
	startTestDaemonWith(t, cfg, daemon.Options{SocketModeHealth: func() string { return slackapi.SocketConnected }, Inbound: inbound})

	ref := startDMRun(t, "DONE")
	if _, code := runCLI(t, "run", "finish", "--run-id", ref.RunID, "--outcome", "completed"); code != ExitOK {
		t.Fatalf("finish DM run: exit %d", code)
	}
	if _, code := runCLI(t, "run", "check", "--run-id", ref.RunID); code != ExitUsage {
		t.Fatalf("finished run check: exit %d, want usage", code)
	}
	late := dmRunReply("U1", ref.ChannelID, ref.ThreadTS, "1700000000.001200", "one more thing")
	inbound <- late
	inbound <- late
	deadline := time.Now().Add(3 * time.Second)
	for fake.count() < 2 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if fake.count() != 2 ||
		fake.post(1).Get("thread_ts") != ref.ThreadTS ||
		!strings.Contains(fake.post(1).Get("text"), "This run has already finished; this message was not applied.") {
		t.Fatalf("finished-run guidance missing or duplicated: posts %d, second post %+v", fake.count(), fake.post(1))
	}
	inbound <- dmRunReply("U1", ref.ChannelID, ref.ThreadTS, "1700000000.001300", "different question")
	deadline = time.Now().Add(3 * time.Second)
	for fake.count() < 3 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if fake.count() != 3 || fake.post(2).Get("thread_ts") != ref.ThreadTS ||
		!strings.Contains(fake.post(2).Get("text"), "This run has already finished; this message was not applied.") {
		t.Fatalf("second owner message did not get finished-run guidance: posts %d", fake.count())
	}
}
