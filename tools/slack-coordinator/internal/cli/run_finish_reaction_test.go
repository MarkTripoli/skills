package cli

import (
	"context"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

func TestRunFinishEmojiFlagAndReactionFailure(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	startTestDaemon(t, &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}})
	for _, id := range []string{"CUSTOM", "NONE", "FAIL"} {
		if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", id); code != ExitOK {
			t.Fatalf("start %s: %d %q", id, code, out)
		}
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "CUSTOM", "--outcome", "completed", "--emoji", ""); code != ExitUsage {
		t.Fatalf("empty finish emoji exit %d; want %d", code, ExitUsage)
	}
	for _, tc := range []struct{ id, emoji string }{{"CUSTOM", ":rocket:"}, {"NONE", "none"}} {
		if out, code := runCLI(t, "run", "finish", "--run-id", tc.id, "--outcome", "completed", "--emoji", tc.emoji); code != ExitOK || out != "" {
			t.Fatalf("finish %s: %d %q", tc.id, code, out)
		}
	}
	fake.mu.Lock()
	if len(fake.reactions) != 1 || fake.reactions[0].Get("name") != "rocket" || fake.reactions[0].Get("timestamp") != "1700000000.000100" {
		t.Fatalf("override and none reactions: %v", fake.reactions)
	}
	fake.mu.Unlock()
	fake.failReactions.Store(true)
	if out, code := runCLI(t, "run", "finish", "--run-id", "FAIL", "--outcome", "failed"); code != ExitOK || out != "" {
		t.Fatalf("failed reaction prevented finish: %d %q", code, out)
	}
	p, err := paths.New()
	if err != nil {
		t.Fatal(err)
	}
	database, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	run, err := database.GetRun(context.Background(), "FAIL")
	if err != nil {
		t.Fatal(err)
	}
	if run.Lifecycle != "failed" || !run.LastDeliveryError.Valid || !strings.Contains(run.LastDeliveryError.String, "reaction") {
		t.Fatalf("failed reaction did not persist on finished run: %+v", run)
	}
}
