package cli

import (
	"context"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

func reactCLIError(args ...string) (string, int) {
	root := NewRoot()
	root.SetArgs(args)
	err := root.Execute()
	if err == nil {
		return "", ExitOK
	}
	return err.Error(), exitCode(err)
}

func TestRunReactMarksRootBeforeAndAfterFinish(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	startTestDaemon(t, &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}})
	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("start: %d %q", code, out)
	}
	for _, emoji := range []string{":eyes:", "rocket"} {
		if out, code := runCLI(t, "run", "react", "--run-id", "RUN1", "--emoji", emoji); code != ExitOK || out != "" {
			t.Fatalf("react %s: %d %q", emoji, code, out)
		}
	}
	if out, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed", "--emoji", "none"); code != ExitOK {
		t.Fatalf("finish: %d %q", code, out)
	}
	if out, code := runCLI(t, "run", "react", "--run-id", "RUN1", "--emoji", "white_check_mark"); code != ExitOK || out != "" {
		t.Fatalf("react finished: %d %q", code, out)
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if len(fake.reactions) != 3 {
		t.Fatalf("reactions = %v; want three explicit reactions", fake.reactions)
	}
	for i, want := range []string{"eyes", "rocket", "white_check_mark"} {
		if got := fake.reactions[i].Get("name"); got != want {
			t.Errorf("reaction %d = %q, want %q", i, got, want)
		}
		if got := fake.reactions[i].Get("timestamp"); got != "1700000000.000100" {
			t.Errorf("reaction %d timestamp = %q", i, got)
		}
	}
}

func TestRunReactMapsSlackErrors(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	startTestDaemon(t, &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}})
	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("start: %d %q", code, out)
	}
	fake.failReactions.Store(true)
	out, code := reactCLIError("run", "react", "--run-id", "RUN1", "--emoji", "eyes")
	if code != ExitUnavailable || !strings.Contains(out, "reaction") {
		t.Fatalf("failed reaction: %d %q", code, out)
	}
}

func TestRunReactDisabledDoesNotContactSlack(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	startTestDaemon(t, &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}})
	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("start: %d %q", code, out)
	}
	p, err := paths.New()
	if err != nil {
		t.Fatal(err)
	}
	database, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	if err := database.DisableSlack(context.Background(), "RUN1"); err != nil {
		database.Close()
		t.Fatal(err)
	}
	database.Close()
	before := fake.requests.Load()
	out, code := reactCLIError("run", "react", "--run-id", "RUN1", "--emoji", "eyes")
	if code != ExitUsage || !strings.Contains(out, "slack disabled for this run: RUN1") {
		t.Fatalf("react on Slack-disabled run: exit %d, error %q; want exit %d and explicit refusal", code, out, ExitUsage)
	}
	if got := fake.requests.Load(); got != before {
		t.Fatalf("reaction contacted Slack: requests %d, before %d", got, before)
	}
}
