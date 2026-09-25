package cli

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// installFakeAgent puts a `pi` on PATH that is agent's fake-agent.sh
// writing text to result.md.
func installFakeAgent(t *testing.T, text string) {
	t.Helper()
	script, err := os.ReadFile(filepath.Join("..", "agent", "testdata", "fake-agent.sh"))
	if err != nil {
		t.Fatal(err)
	}
	bin := t.TempDir()
	if err := os.WriteFile(filepath.Join(bin, "pi"), script, 0o700); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_MODE", "result")
	t.Setenv("FAKE_TEXT", text)
}

func TestOwnerDMRunsTheAgentAndItsAnswerReplacesTheAck(t *testing.T) {
	const answer = "Two pull requests are open: #12 and #14."
	installFakeAgent(t, answer)
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{
		Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL},
		Agent: &config.Agent{Command: "pi", Approval: "edits", Timeout: 30 * time.Second, MaxRunsPerHour: 30},
	}
	inbound := make(chan socketmode.Event, 8)
	startTestDaemonWith(t, cfg, daemon.Options{
		SocketModeHealth: func() string { return slackapi.SocketConnected },
		Inbound:          inbound,
		DispatcherPeriod: 10 * time.Millisecond,
	})

	inbound <- ownerDM("U1", "D0000000001", "1700000000.000500", "summarize the open pull requests")

	deadline := time.Now().Add(10 * time.Second)
	for fake.updateCount() == 0 {
		if time.Now().After(deadline) {
			t.Fatalf("no chat.update after 10s; %d posts", fake.count())
		}
		time.Sleep(10 * time.Millisecond)
	}
	if fake.count() != 1 || fake.post(0).Get("text") != "Working on it" || fake.post(0).Get("thread_ts") != "1700000000.000500" {
		t.Fatalf("posts = %d (%v); want one Working on it ack in the DM thread", fake.count(), fake.post(0))
	}
	upd := fake.update(0)
	if upd.Get("channel") != "D0000000001" || upd.Get("ts") != "1700000000.000100" || upd.Get("text") != answer {
		t.Fatalf("chat.update form %v; want the ack edited into the agent's answer", upd)
	}
}
