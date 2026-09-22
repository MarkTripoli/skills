package cli

import (
	"bytes"
	"os"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// runCLIWithStdin is runCLI with stdin supplied for commands that prompt.
func runCLIWithStdin(t *testing.T, stdin string, args ...string) (string, int) {
	var buf bytes.Buffer
	SetOutput(&buf)
	t.Cleanup(func() { output = os.Stdout })
	root := NewRoot()
	root.SetIn(strings.NewReader(stdin))
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), exitCode(err)
}

func TestRunDisableSlackBreaksGlassForOneRunAfterYes(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)
	for _, id := range []string{"RUN1", "RUN2"} {
		if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", id); code != ExitOK {
			t.Fatalf("run start %s exit %d, output %q", id, code, out)
		}
	}
	posts := fake.count()
	summary := "run_id: RUN1\nchannel_id: C0000000001\npermalink: https://t.slack.com/archives/C0000000001/p1700000000000100\n" +
		"Slack gating stops for this run only. Type yes to continue: "

	// Anything but "yes" refuses without an IPC call: both runs stay enabled.
	for name, stdin := range map[string]string{"no": "no\n", "empty": "", "yes with noise": "yes please\n"} {
		out, code := runCLIWithStdin(t, stdin, "run", "disable-slack", "--run-id", "RUN1")
		if code != ExitRefused || !strings.HasPrefix(out, summary) {
			t.Fatalf("%s: exit %d, output %q; want %d after the summary and prompt", name, code, out, ExitRefused)
		}
		for _, id := range []string{"RUN1", "RUN2"} {
			if gate, code := checkGate(t, id); code != ExitOK || gate.Kind != "ready" {
				t.Fatalf("%s: %s after a refused break-glass: exit %d, gate %+v; want ready", name, id, code, gate)
			}
		}
	}

	if _, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack", "--run-id", "NOPE"); code != ExitUsage {
		t.Fatalf("disable-slack on an unknown run exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack"); code != ExitUsage {
		t.Fatalf("disable-slack without --run-id exit %d, want %d", code, ExitUsage)
	}

	out, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack", "--run-id", "RUN1")
	if code != ExitOK || out != summary {
		t.Fatalf("disable-slack with yes: exit %d, output %q", code, out)
	}
	gate, code := checkGate(t, "RUN1")
	if code != ExitSlackDisabled || gate.Kind != "slack_disabled" || gate.Reason != "" || gate.Input != nil {
		t.Fatalf("disabled run: exit %d, gate %+v; want %d and slack_disabled", code, gate, ExitSlackDisabled)
	}
	if gate.Run == nil || gate.Run.RunID != "RUN1" {
		t.Fatalf("slack_disabled gate run summary %+v; want RUN1", gate.Run)
	}
	if gate, code := checkGate(t, "RUN2"); code != ExitOK || gate.Kind != "ready" {
		t.Fatalf("sibling run after the break-glass: exit %d, gate %+v; want ready", code, gate)
	}

	// Posts stop for the disabled run while SQLite keeps recording.
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "offline"); code != ExitOK {
		t.Fatalf("run event on a disabled run exit %d, want 0", code)
	}
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitOK {
		t.Fatalf("run finish on a disabled run exit %d, want 0", code)
	}
	if fake.count() != posts {
		t.Fatalf("disabled run made %d chat.postMessage requests, want 0", fake.count()-posts)
	}
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN1", "--current", "after finish"); code != ExitUsage {
		t.Fatalf("run event on a finished disabled run exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLI(t, "run", "event", "--run-id", "RUN2", "--current", "still posting"); code != ExitOK || fake.count() != posts+1 {
		t.Fatalf("sibling run event: exit %d with %d new posts; want 0 and one post", code, fake.count()-posts)
	}
	if _, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack", "--run-id", "RUN1"); code != ExitUsage {
		t.Fatalf("disable-slack on a finished run exit %d, want %d", code, ExitUsage)
	}
}

func TestRunDisableSlackNeedsTheDaemon(t *testing.T) {
	_, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	stop := startTestDaemon(t, cfg)
	if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", "RUN1"); code != ExitOK {
		t.Fatalf("run start exit %d, output %q", code, out)
	}
	stop()
	out, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack", "--run-id", "RUN1")
	if code != ExitUnavailable || out != "" {
		t.Fatalf("disable-slack with no daemon: exit %d, output %q; want %d and no prompt", code, out, ExitUnavailable)
	}
}
