package cli

import (
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

func TestRunEventAndFinishPostInTheThread(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	stop := startTestDaemon(t, cfg)

	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}

	out, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "Wiring flags", "--completed", "Parsed flag", "--decision", "stderr", "--blocker", "review", "--next", "docs")
	if code != ExitOK || out != "" {
		t.Fatalf("run event exit %d, output %q; want 0 and no output", code, out)
	}
	if fake.count() != 2 {
		t.Fatalf("chat.postMessage called %d times after event, want 2", fake.count())
	}
	status := fake.posts[1]
	if status.Get("thread_ts") != "1700000000.000100" || status.Get("channel") != "C0000000001" {
		t.Fatalf("status not posted as a thread reply: channel=%q thread_ts=%q", status.Get("channel"), status.Get("thread_ts"))
	}
	for _, part := range []string{"*Current work:* Wiring flags", "*Completed since last update:*\n• Parsed flag", "*Decisions:*\n• stderr", "*Blockers:*\n• review", "*Up next:*\n• docs"} {
		if !strings.Contains(status.Get("text"), part) {
			t.Errorf("status text missing %q:\n%s", part, status.Get("text"))
		}
	}

	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1"); code != ExitUsage {
		t.Fatalf("run event without --current exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "done"); code != ExitUsage {
		t.Fatalf("run finish with a bad outcome exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "event", "--run-id", "NOPE", "--current", "x"); code != ExitUsage {
		t.Fatalf("run event on an unknown run exit %d, want %d", code, ExitUsage)
	}
	if fake.count() != 2 {
		t.Fatalf("refused commands posted; %d posts", fake.count())
	}

	out, code = runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed", "--completed", "Added flag", "--evidence", "go test", "--link", "https://example.com/pr/1")
	if code != ExitOK || out != "" {
		t.Fatalf("run finish exit %d, output %q; want 0 and no output", code, out)
	}
	if fake.count() != 3 {
		t.Fatalf("chat.postMessage called %d times after finish, want 3", fake.count())
	}
	completion := fake.posts[2]
	if completion.Get("thread_ts") != "1700000000.000100" {
		t.Fatalf("completion not posted as a thread reply: thread_ts=%q", completion.Get("thread_ts"))
	}
	for _, part := range []string{"*Outcome:* completed", "*Completed work:*\n• Added flag", "*Unresolved items:* None", "*Evidence:*\n• go test", "*Links:*\n• https://example.com/pr/1", "*Finished at:* "} {
		if !strings.Contains(completion.Get("text"), part) {
			t.Errorf("completion text missing %q:\n%s", part, completion.Get("text"))
		}
	}

	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "late"); code != ExitUsage {
		t.Fatalf("run event on a finished run exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "failed"); code != ExitUsage {
		t.Fatalf("second run finish exit %d, want %d", code, ExitUsage)
	}
	if fake.count() != 3 {
		t.Fatalf("terminal run still posted; %d posts", fake.count())
	}

	stop()
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "x"); code != ExitUnavailable {
		t.Fatalf("run event with daemon stopped exit %d, want %d", code, ExitUnavailable)
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitUnavailable {
		t.Fatalf("run finish with daemon stopped exit %d, want %d", code, ExitUnavailable)
	}
}

func TestDaemonServeRejectsNonPositiveStatusInterval(t *testing.T) {
	_, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)

	if _, code := runCLI(t, "daemon", "serve", "--status-interval", "0s"); code != ExitUsage {
		t.Fatalf("daemon serve --status-interval 0s exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "daemon", "serve", "--status-interval", "soon"); code != ExitUsage {
		t.Fatalf("daemon serve --status-interval soon exit %d, want %d", code, ExitUsage)
	}
}
