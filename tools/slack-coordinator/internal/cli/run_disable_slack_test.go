package cli

import (
	"bytes"
	"io"
	"os"
	"strings"
	"testing"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
)

// runCLIWithStdin is runCLI with stdin supplied for commands that prompt.
func runCLIWithStdin(t *testing.T, stdin string, args ...string) (string, int) {
	return runCLIWithReader(t, strings.NewReader(stdin), args...)
}

func runCLIWithReader(t *testing.T, stdin io.Reader, args ...string) (string, int) {
	var buf bytes.Buffer
	SetOutput(&buf)
	t.Cleanup(func() { output = os.Stdout })
	root := NewRoot()
	root.SetIn(stdin)
	root.SetArgs(args)
	err := root.Execute()
	return buf.String(), exitCode(err)
}

func TestRunDisableSlackRejectsPipedConfirmation(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	startTestDaemon(t, cfg)
	for _, id := range []string{"RUN1", "RUN2"} {
		if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", id); code != ExitOK {
			t.Fatalf("run start %s exit %d, output %q", id, code, out)
		}
	}
	posts := fake.count()
	summary := "run_id: RUN1\nchannel_id: C0000000001\npermalink: https://t.slack.com/archives/C0000000001/p1700000000000100\n"

	// Even the exact confirmation is refused when stdin is not an operator terminal.
	for name, stdin := range map[string]string{"no": "no\n", "empty": "", "yes with noise": "yes please\n", "reader yes": "yes\n"} {
		out, code := runCLIWithStdin(t, stdin, "run", "disable-slack", "--run-id", "RUN1")
		if code != ExitRefused || out != summary {
			t.Fatalf("%s: exit %d, output %q; want %d after summary without a prompt", name, code, out, ExitRefused)
		}
		for _, id := range []string{"RUN1", "RUN2"} {
			if gate, code := checkGate(t, id); code != ExitOK || gate.Kind != "ready" {
				t.Fatalf("%s: %s after refused break-glass: exit %d, gate %+v; want ready", name, id, code, gate)
			}
		}
	}

	pipeReader, pipeWriter, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := io.WriteString(pipeWriter, "yes\n"); err != nil {
		pipeReader.Close()
		pipeWriter.Close()
		t.Fatal(err)
	}
	if err := pipeWriter.Close(); err != nil {
		pipeReader.Close()
		t.Fatal(err)
	}
	out, code := runCLIWithReader(t, pipeReader, "run", "disable-slack", "--run-id", "RUN1")
	pipeReader.Close()
	if code != ExitRefused || out != summary {
		t.Fatalf("piped yes: exit %d, output %q; want %d after summary without a prompt", code, out, ExitRefused)
	}
	if gate, code := checkGate(t, "RUN1"); code != ExitOK || gate.Kind != "ready" {
		t.Fatalf("run after piped break-glass: exit %d, gate %+v; want ready", code, gate)
	}

	if _, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack", "--run-id", "NOPE"); code != ExitUsage {
		t.Fatalf("disable-slack on an unknown run exit %d, want %d", code, ExitUsage)
	}
	if _, code := runCLIWithStdin(t, "yes\n", "run", "disable-slack"); code != ExitUsage {
		t.Fatalf("disable-slack without --run-id exit %d, want %d", code, ExitUsage)
	}
	if fake.count() != posts {
		t.Fatalf("refused break-glass changed Slack messages; got %d posts, want %d", fake.count(), posts)
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
