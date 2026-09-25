package cli

import (
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

func TestRunCadenceChangesActiveRunWithoutNewSlackMessage(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)
	if _, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("start exit %d", code)
	}
	for _, duration := range []string{"0s", "1ms", "soon"} {
		if _, code := runCLI(t, "run", "cadence", "--run-id", "RUN1", "--every", duration); code != ExitUsage {
			t.Fatalf("cadence %s exit %d, want usage", duration, code)
		}
	}
	if out, code := runCLI(t, "run", "cadence", "--run-id", "RUN1", "--every", "20m"); code != ExitOK || out != "" {
		t.Fatalf("valid cadence exit %d, output %q", code, out)
	}
	if fake.count() != 1 || fake.updateCount() != 0 {
		t.Fatalf("cadence itself notified Slack: posts=%d edits=%d", fake.count(), fake.updateCount())
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitOK {
		t.Fatalf("finish exit %d", code)
	}
	if _, code := runCLI(t, "run", "cadence", "--run-id", "RUN1", "--every", "1h"); code != ExitUsage {
		t.Fatalf("finished run cadence exit %d", code)
	}
}
