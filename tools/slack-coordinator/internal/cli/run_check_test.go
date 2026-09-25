package cli

import (
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// checkGate runs `run check` and decodes the one JSON object it prints.
func checkGate(t *testing.T, runID string) (coordinator.WriteGate, int) {
	t.Helper()
	out, code := runCLI(t, "run", "check", "--run-id", runID)
	var gate coordinator.WriteGate
	if err := json.Unmarshal([]byte(out), &gate); err != nil {
		t.Fatalf("run check stdout %q is not one JSON object: %v", out, err)
	}
	return gate, code
}

func TestRunCheckFailsClosedUntilDeliveryRecovers(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	var health atomic.Value
	health.Store(slackapi.SocketConnected)
	stop := startTestDaemonWith(t, cfg, daemon.Options{
		SchedulerPeriod:  20 * time.Millisecond,
		SocketModeHealth: func() string { return health.Load().(string) },
	})

	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}
	gate, code := checkGate(t, "RUN1")
	if code != ExitOK || gate.Kind != "ready" || gate.Reason != "" {
		t.Fatalf("fresh run: exit %d, gate %+v; want 0 and ready", code, gate)
	}
	if gate.Run == nil || *gate.Run != (coordinator.RunSummary{RunID: "RUN1", ChannelID: "C0000000001", Permalink: "https://t.slack.com/archives/C0000000001/p1700000000000100"}) {
		t.Fatalf("ready gate run summary %+v; want the run's id, channel, and permalink", gate.Run)
	}

	if _, code := runCLI(t, "run", "cadence", "--run-id", "RUN1", "--every", "1s"); code != ExitOK {
		t.Fatalf("set short test cadence: exit %d", code)
	}
	time.Sleep(time.Second)
	updatesBeforeFailure := fake.updateCount()
	fake.failUpdates.Store(true)
	fake.failPosts.Store(true)
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "x"); code != ExitUnavailable {
		t.Fatalf("run event with root edit failing exit %d, want %d", code, ExitUnavailable)
	}
	gate, code = checkGate(t, "RUN1")
	if code != ExitUnavailable || gate.Kind != "unavailable" || !strings.Contains(gate.Reason, "500") {
		t.Fatalf("after a failed root edit: exit %d, gate %+v; want 11, unavailable, and the Slack error", code, gate)
	}
	if fake.updateCount() <= updatesBeforeFailure || fake.update(fake.updateCount()-1).Get("ts") != "1700000000.000100" {
		t.Fatalf("failing Slack did not receive a failed root edit: %d edits before, %d after", updatesBeforeFailure, fake.updateCount())
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitUnavailable {
		t.Fatalf("run finish with Slack failing exit %d, want %d", code, ExitUnavailable)
	}
	if _, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN2"); code != ExitUnavailable {
		t.Fatalf("run start with Slack failing exit %d, want %d", code, ExitUnavailable)
	}
	if fake.count() != 1 {
		t.Fatalf("failing Slack recorded %d posts, want only the root", fake.count())
	}

	fake.failUpdates.Store(false)
	fake.failPosts.Store(false)
	deadline := time.Now().Add(5 * time.Second)
	for {
		gate, code = checkGate(t, "RUN1")
		if code == ExitOK || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if code != ExitOK || gate.Kind != "ready" {
		t.Fatalf("after Slack recovered: exit %d, gate %+v; want the scheduler retry to clear the error", code, gate)
	}
	if fake.count() != 1 || fake.updateCount() < 2 || fake.update(0).Get("ts") != "1700000000.000100" {
		t.Fatalf("retry did not edit root: %d posts, %d edits", fake.count(), fake.updateCount())
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitOK {
		t.Fatalf("run finish after recovery exit %d, want 0", code)
	}
	if _, code := runCLI(t, "run", "check", "--run-id", "RUN1"); code != ExitUsage {
		t.Fatalf("finished run check exit %d, want usage", code)
	}
	if _, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "next run", "--run-id", "RUN3"); code != ExitOK {
		t.Fatalf("start active sibling run exit %d", code)
	}

	health.Store(slackapi.SocketDisconnected)
	if gate, code := checkGate(t, "RUN3"); code != ExitUnavailable || gate.Reason != "socket_mode disconnected" {
		t.Fatalf("disconnected socket: exit %d, gate %+v", code, gate)
	}
	health.Store(slackapi.SocketConnected)
	if _, code := checkGate(t, "RUN3"); code != ExitOK {
		t.Fatalf("reconnected socket: exit %d, want 0", code)
	}

	if _, code := runCLI(t, "run", "check", "--run-id", "NOPE"); code != ExitUsage {
		t.Fatalf("run check on an unknown run exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "check"); code != ExitUsage {
		t.Fatalf("run check without --run-id exit %d, want %d", code, ExitUsage)
	}

	stop()
	gate, code = checkGate(t, "RUN3")
	if code != ExitUnavailable || gate.Kind != "unavailable" || !strings.HasPrefix(gate.Reason, "daemon unreachable: ") {
		t.Fatalf("no daemon: exit %d, gate %+v; want 11 and a daemon unreachable reason", code, gate)
	}
}

func TestDaemonStatusReportsInjectedSocketModeHealth(t *testing.T) {
	_, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemonWith(t, cfg, daemon.Options{SocketModeHealth: func() string { return slackapi.SocketDisconnected }})

	out, code := runCLI(t, "daemon", "status")
	if code != ExitOK || strings.TrimSpace(out) != `{"socket_mode":"disconnected"}` {
		t.Fatalf("daemon status exit %d, output %q", code, out)
	}
}
