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
		got := fake.reactions[i]
		if got.Get("name") != want || got.Get("channel") != "C0000000001" || got.Get("timestamp") != "1700000000.000100" {
			t.Errorf("reaction %d = %v; want %s on root message", i, got, want)
		}
	}
}

func TestRunReactMapsSlackErrors(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	stop := startTestDaemon(t, &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}})
	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("start: %d %q", code, out)
	}
	for _, args := range [][]string{
		{"run", "react", "--run-id", "NOPE", "--emoji", "eyes"},
		{"run", "react", "--run-id", "RUN1", "--emoji", "::"},
		{"run", "react", "--run-id", "RUN1", "--emoji", ""},
	} {
		if _, code := runCLI(t, args...); code != ExitUsage {
			t.Fatalf("%v exit %d; want %d", args, code, ExitUsage)
		}
	}
	fake.mu.Lock()
	if len(fake.reactions) != 0 {
		t.Fatalf("refused reactions contacted Slack: %v", fake.reactions)
	}
	fake.reactionError = "invalid_name"
	fake.mu.Unlock()
	if out, code := reactCLIError("run", "react", "--run-id", "RUN1", "--emoji", ":missing_custom:"); code != ExitUsage || !strings.Contains(out, "missing_custom") {
		t.Fatalf("invalid name: exit %d, output %q", code, out)
	}
	fake.mu.Lock()
	fake.reactionError = "already_reacted"
	fake.mu.Unlock()
	if out, code := runCLI(t, "run", "react", "--run-id", "RUN1", "--emoji", "eyes"); code != ExitOK || out != "" {
		t.Fatalf("duplicate: exit %d, output %q", code, out)
	}
	fake.failReactions.Store(true)
	if _, code := runCLI(t, "run", "react", "--run-id", "RUN1", "--emoji", "rocket"); code != ExitUnavailable {
		t.Fatalf("Slack unreachable: exit %d; want %d", code, ExitUnavailable)
	}
	stop()
	if _, code := runCLI(t, "run", "react", "--run-id", "RUN1", "--emoji", "rocket"); code != ExitUnavailable {
		t.Fatalf("daemon unreachable: exit %d; want %d", code, ExitUnavailable)
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
	defer database.Close()
	if err := database.DisableSlack(context.Background(), "RUN1"); err != nil {
		t.Fatal(err)
	}
	before := fake.requests.Load()
	if out, code := reactCLIError("run", "react", "--run-id", "RUN1", "--emoji", "eyes"); code != ExitSlackDisabled || !strings.Contains(out, "slack disabled") {
		t.Fatalf("disabled: exit %d, output %q", code, out)
	}
	if got := fake.requests.Load(); got != before {
		t.Fatalf("disabled react made %d Slack API calls", got-before)
	}
}
