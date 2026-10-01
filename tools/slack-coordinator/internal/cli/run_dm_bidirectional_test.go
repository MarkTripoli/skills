package cli

import (
	"context"
	"encoding/json"
	"sync/atomic"
	"testing"
	"time"

	"github.com/slack-go/slack/slackevents"
	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
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

// waitForEyes polls until the fake Slack saw an eyes reaction on ts in channel.
func waitForEyes(t *testing.T, fake *fakeSlack, channel, ts string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		fake.mu.Lock()
		for _, r := range fake.reactions {
			if r.Get("name") == "eyes" && r.Get("channel") == channel && r.Get("timestamp") == ts {
				fake.mu.Unlock()
				return
			}
		}
		fake.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("no eyes reaction on %s/%s", channel, ts)
}

func TestOwnerDMRoutesRepliesAcrossIndependentRuns(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	inbound := make(chan socketmode.Event, 12)
	startTestDaemonWith(t, cfg, daemon.Options{SocketModeHealth: func() string { return slackapi.SocketConnected }, Inbound: inbound})

	if _, code := runCLI(t, "run", "start", "--dm", "--channel", "C0000000001", "--work", "x"); code != ExitUsage {
		t.Fatalf("DM and channel together: exit %d, want usage", code)
	}
	first, second := startDMRun(t, "RUN1"), startDMRun(t, "RUN2")
	if first.ChannelID != "D0000000001" || second.ChannelID != first.ChannelID || first.ThreadTS == second.ThreadTS {
		t.Fatalf("DM run addresses: first %+v, second %+v", first, second)
	}
	if fake.count() != 4 {
		t.Fatalf("DM runs posted %d messages, want two roots and two status cards", fake.count())
	}

	inbound <- dmRunReply("U1", first.ChannelID, first.ThreadTS, "1700000000.000800", "stop first")
	inbound <- dmRunReply("U1", second.ChannelID, second.ThreadTS, "1700000000.000900", "question for second")
	one, code := waitForGate(t, first.RunID, ExitOwnerInput)
	if code != ExitOwnerInput || one.Input == nil || one.Input.Text != "stop first" || one.Input.ThreadTS != first.ThreadTS {
		t.Fatalf("first inbox: code %d, gate %+v", code, one)
	}
	waitForEyes(t, fake, first.ChannelID, "1700000000.000800")
	two, code := waitForGate(t, second.RunID, ExitOwnerInput)
	if code != ExitOwnerInput || two.Input == nil || two.Input.Text != "question for second" || two.Input.ThreadTS != second.ThreadTS {
		t.Fatalf("second inbox: code %d, gate %+v", code, two)
	}
	if _, code := runCLI(t, "run", "resolve", "--run-id", first.RunID, "--message-ts", one.Input.MessageTS, "--outcome", "applied", "--reply", "Stopped first."); code != ExitOK {
		t.Fatalf("first resolve: exit %d", code)
	}
	answer := fake.post(4)
	if answer.Get("channel") != first.ChannelID || answer.Get("thread_ts") != first.ThreadTS || answer.Get("text") != "Stopped first." {
		t.Fatalf("first answer went to wrong thread: %v", answer)
	}
	if gate, code := checkGate(t, second.RunID); code != ExitOwnerInput || gate.Input == nil || gate.Input.Text != "question for second" {
		t.Fatalf("resolving first changed second inbox: code %d, gate %+v", code, gate)
	}

	inbound <- ownerDM("U1", first.ChannelID, "1700000000.001000", "!to RUN1 follow up")
	inbound <- ownerDM("U1", first.ChannelID, "1700000000.001000", "!to RUN1 follow up")
	one, code = waitForGate(t, first.RunID, ExitOwnerInput)
	if code != ExitOwnerInput || one.Input == nil || one.Input.Text != "follow up" {
		t.Fatalf("directed input: code %d, gate %+v", code, one)
	}
	waitForEyes(t, fake, first.ChannelID, "1700000000.001000")
	if _, code := runCLI(t, "run", "resolve", "--run-id", first.RunID, "--message-ts", one.Input.MessageTS, "--outcome", "answered", "--reply", "Follow-up answered."); code != ExitOK {
		t.Fatalf("directed input resolve: exit %d", code)
	}
	if gate, code := checkGate(t, first.RunID); code != ExitOK || gate.Kind != coordinator.GateReady {
		t.Fatalf("duplicate directed input reopened inbox: code %d, gate %+v", code, gate)
	}

	result := make(chan struct {
		out  string
		code int
	}, 1)
	go func() {
		out, code := runCLI(t, "run", "wait", "--run-id", first.RunID)
		result <- struct {
			out  string
			code int
		}{out, code}
	}()
	time.Sleep(100 * time.Millisecond)
	inbound <- ownerDM("U1", first.ChannelID, "1700000000.001100", "!to\tRUN1\tnew steering")
	select {
	case reply := <-result:
		var gate coordinator.WriteGate
		if err := json.Unmarshal([]byte(reply.out), &gate); err != nil || reply.code != ExitOwnerInput || gate.Input == nil || gate.Input.Text != "new steering" {
			t.Fatalf("wait returned %d, %+v, %v", reply.code, gate, err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("run wait did not return after the owner replied")
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
	for fake.count() < 3 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if fake.count() != 3 || fake.post(2).Get("thread_ts") != ref.ThreadTS {
		t.Fatalf("finished-run guidance missing or duplicated: posts %d", fake.count())
	}
	inbound <- dmRunReply("U1", ref.ChannelID, ref.ThreadTS, "1700000000.001300", "different question")
	deadline = time.Now().Add(3 * time.Second)
	for fake.count() < 4 && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if fake.count() != 4 {
		t.Fatalf("second owner message did not get guidance: posts %d", fake.count())
	}
}

func TestRunWaitReportsUnavailableWhenDaemonIsDown(t *testing.T) {
	newTestHome(t)
	out, code := runCLI(t, "run", "wait", "--run-id", "RUN1")
	var gate coordinator.WriteGate
	if err := json.Unmarshal([]byte(out), &gate); err != nil || code != ExitUnavailable || gate.Kind != coordinator.GateUnavailable {
		t.Fatalf("wait without daemon: code %d, gate %+v, decode %v", code, gate, err)
	}
}

func TestRunWaitForRepeatsReadyWaitsUntilInput(t *testing.T) {
	home := newTestHome(t)
	var calls atomic.Int32
	server := ipc.NewServer()
	server.Handle(ipc.MethodRunWait, func(context.Context, json.RawMessage) (interface{}, error) {
		if calls.Add(1) < 3 {
			return coordinator.WriteGate{Kind: coordinator.GateReady}, nil
		}
		return coordinator.WriteGate{Kind: coordinator.GateOwnerInput, Input: &coordinator.OwnerInput{MessageTS: "1.2", Text: "steer"}}, nil
	})
	if err := server.Listen(paths.WithRoot(home).Socket()); err != nil {
		t.Fatal(err)
	}
	go server.ServeReady()
	t.Cleanup(server.Close)

	if _, code := runCLI(t, "run", "wait", "--run-id", "RUN1"); code != ExitOK || calls.Load() != 1 {
		t.Fatalf("plain wait: exit %d after %d daemon waits, want ready after 1", code, calls.Load())
	}
	calls.Store(0)
	out, code := runCLI(t, "run", "wait", "--run-id", "RUN1", "--for", "1m")
	var gate coordinator.WriteGate
	if err := json.Unmarshal([]byte(out), &gate); err != nil || code != ExitOwnerInput || gate.Input == nil || gate.Input.Text != "steer" || calls.Load() != 3 {
		t.Fatalf("wait --for: exit %d after %d daemon waits, gate %+v, decode %v", code, calls.Load(), gate, err)
	}
}
