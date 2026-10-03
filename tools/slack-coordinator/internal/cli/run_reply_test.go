package cli

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/slack-go/slack/socketmode"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

func TestRunReplyPostsInTheThreadBehindTheGate(t *testing.T) {
	fake, apiURL := newFakeSlack(t)
	cfg := &config.Config{Slack: config.Slack{BotToken: "xoxb-1", AppToken: "xapp-1", OwnerUserID: "U1", APIURL: apiURL}}
	inbound := make(chan socketmode.Event, 8)
	stop := startTestDaemonWith(t, cfg, daemon.Options{
		SocketModeHealth: func() string { return slackapi.SocketConnected },
		Inbound:          inbound,
	})
	for _, id := range []string{"RUN1", "RUN2"} {
		if out, code := runCLI(t, "run", "start", "--channel", "C0000000001", "--work", "x", "--run-id", id); code != ExitOK {
			t.Fatalf("run start %s exit %d, output %q", id, code, out)
		}
	}
	posts, edits := fake.count(), fake.updateCount()

	for name, args := range map[string][]string{
		"no --text":    {"run", "reply", "--run-id", "RUN1"},
		"empty --text": {"run", "reply", "--run-id", "RUN1", "--text", " "},
		"no --run-id":  {"run", "reply", "--text", "x"},
		"unknown run":  {"run", "reply", "--run-id", "NOPE", "--text", "x"},
		"extra arg":    {"run", "reply", "--run-id", "RUN1", "--text", "x", "y"},
	} {
		if out, code := runCLI(t, args...); code != ExitUsage || out != "" {
			t.Fatalf("%s: exit %d, output %q; want %d and no output", name, code, out, ExitUsage)
		}
	}
	if fake.count() != posts {
		t.Fatalf("refused replies posted %d messages", fake.count()-posts)
	}

	text := "Hour 1: *tests* green, <https://example.test|PR> opened"
	out, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", text)
	if code != ExitOK {
		t.Fatalf("run reply exit %d, output %q", code, out)
	}
	var result coordinator.ReplyResult
	if err := json.Unmarshal([]byte(out), &result); err != nil {
		t.Fatalf("run reply stdout %q is not one JSON object: %v", out, err)
	}
	if fake.count() != posts+1 || fake.updateCount() != edits {
		t.Fatalf("run reply made %d posts and %d edits; want one post and no edit", fake.count()-posts, fake.updateCount()-edits)
	}
	reply := fake.post(posts)
	if reply.Get("channel") != "C0000000001" || reply.Get("thread_ts") != "1700000000.000100" || reply.Get("text") != text || reply.Get("blocks") != "" {
		t.Fatalf("reply form %v; want the text verbatim as a plain reply under the root", reply)
	}
	if result.RunID != "RUN1" || result.ThreadTS != "1700000000.000100" || result.MessageTS != "1700000000.000500" {
		t.Fatalf("result %+v; want the posted message ts", result)
	}

	// A pending owner reply refuses the post until it is resolved.
	inbound <- threadReply("U1", "1700000000.000900", "Pause the rollout")
	gate, code := waitForGate(t, "RUN1", ExitOwnerInput)
	if code != ExitOwnerInput || gate.Input == nil {
		t.Fatalf("owner reply not seen: exit %d, gate %+v", code, gate)
	}
	posts = fake.count()
	if out, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", "still going"); code != ExitUnavailable || out != "" {
		t.Fatalf("reply over owner input: exit %d, output %q; want %d and no output", code, out, ExitUnavailable)
	}
	if fake.count() != posts {
		t.Fatalf("reply over owner input posted %d messages", fake.count()-posts)
	}
	if _, code := runCLI(t, "run", "resolve", "--run-id", "RUN1", "--message-ts", gate.Input.MessageTS, "--outcome", "applied", "--reply", "Paused."); code != ExitOK {
		t.Fatalf("run resolve exit %d", code)
	}

	// A failed post exits 11 but leaves the gate open for the next step.
	fake.failPosts.Store(true)
	posts = fake.count()
	if _, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", "progress"); code != ExitUnavailable {
		t.Fatalf("reply with Slack failing exit %d, want %d", code, ExitUnavailable)
	}
	fake.failPosts.Store(false)
	if gate, code := checkGate(t, "RUN1"); code != ExitOK || gate.Kind != "ready" {
		t.Fatalf("after a failed reply: exit %d, gate %+v; want ready", code, gate)
	}
	if _, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", "progress"); code != ExitOK || fake.count() != posts+1 {
		t.Fatalf("retried reply exit %d with %d posts; want 0 and one post", code, fake.count()-posts)
	}

	// Slack disabled for one run: exit 12, no Slack call.
	p, err := paths.New()
	if err != nil {
		t.Fatal(err)
	}
	database, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	if err := database.DisableSlack(context.Background(), "RUN2"); err != nil {
		database.Close()
		t.Fatal(err)
	}
	database.Close()
	before := fake.requests.Load()
	if out, code := runCLI(t, "run", "reply", "--run-id", "RUN2", "--text", "progress"); code != ExitSlackDisabled || out != "" {
		t.Fatalf("reply on a disabled run: exit %d, output %q; want %d", code, out, ExitSlackDisabled)
	}
	if got := fake.requests.Load(); got != before {
		t.Fatalf("disabled reply made %d Slack API calls", got-before)
	}

	// A finished run takes no more replies.
	if _, code := runCLI(t, "run", "finish", "--run-id", "RUN1", "--outcome", "completed"); code != ExitOK {
		t.Fatalf("run finish exit %d", code)
	}
	posts = fake.count()
	if _, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", "late"); code != ExitUsage || fake.count() != posts {
		t.Fatalf("reply on a finished run exit %d with %d posts; want %d and none", code, fake.count()-posts, ExitUsage)
	}

	stop()
	if _, code := runCLI(t, "run", "reply", "--run-id", "RUN1", "--text", "x"); code != ExitUnavailable {
		t.Fatalf("reply with the daemon stopped exit %d, want %d", code, ExitUnavailable)
	}
}
