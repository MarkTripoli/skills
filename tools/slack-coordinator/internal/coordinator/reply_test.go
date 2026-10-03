package coordinator

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// rpcCode is the JSON-RPC code rpcError gives err; 0 means a plain error.
func rpcCode(err error) int {
	var rpcErr *ipc.RPCError
	if errors.As(rpcError(err), &rpcErr) {
		return rpcErr.Code
	}
	return 0
}

func TestPostReplyPostsVerbatimInTheThreadAfterTheGate(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	before, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	posts, cards := len(poster.posts), len(poster.statusCards)
	text := "Hour 3: *wave 2* merged; <https://example.test|link> stays as typed"

	// No Health injected: the gate is unavailable and nothing is posted.
	if _, err := c.PostReply(ctx, ReplyParams{RunID: "RUN1", Text: text}); rpcCode(err) != ipc.ErrUnavailable || len(poster.posts) != posts {
		t.Fatalf("reply while unavailable: %v (code %d), %d posts; want unavailable and no post", err, rpcCode(err), len(poster.posts)-posts)
	}

	c.Health = func() string { return slackapi.SocketConnected }
	result, err := c.PostReply(ctx, ReplyParams{RunID: "RUN1", Text: text})
	if err != nil {
		t.Fatal(err)
	}
	if len(poster.posts) != posts+1 || len(poster.statusCards) != cards || len(poster.updates) != 0 {
		t.Fatalf("reply: posts +%d, cards +%d, edits %d; want one new post and no card or root change", len(poster.posts)-posts, len(poster.statusCards)-cards, len(poster.updates))
	}
	got := poster.posts[len(poster.posts)-1]
	if got.ChannelID != "C1" || got.ThreadTS != before.ThreadTS || got.Text != text || got.Blocks != nil {
		t.Fatalf("reply form %+v; want the text verbatim, no blocks, in thread %s", got, before.ThreadTS)
	}
	if result.RunID != "RUN1" || result.ThreadTS != before.ThreadTS || result.MessageTS != "1700000000.000102" {
		t.Fatalf("result %+v; want the posted message ts under the root", result)
	}
	after, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if after.NextStatusDue != before.NextStatusDue || after.LastStatus != before.LastStatus || after.StatusIntervalSeconds != before.StatusIntervalSeconds {
		t.Fatalf("reply changed status state: before %+v, after %+v", before, after)
	}

	for name, in := range map[string]ReplyParams{"empty text": {RunID: "RUN1"}, "blank text": {RunID: "RUN1", Text: " \n"}, "no run": {Text: "x"}, "unknown run": {RunID: "NOPE", Text: "x"}, "too long": {RunID: "RUN1", Text: strings.Repeat("é", maxReplyChars+1)}} {
		if _, err := c.PostReply(ctx, in); err == nil || rpcCode(err) != 0 {
			t.Fatalf("%s: %v (code %d); want a usage error", name, err, rpcCode(err))
		}
	}
	if len(poster.posts) != posts+1 {
		t.Fatalf("refused replies posted %d messages", len(poster.posts)-posts-1)
	}
}

func TestPostReplyRefusesPendingOwnerInputDisabledAndFinishedRuns(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	c.Health = func() string { return slackapi.SocketConnected }
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	startTestRun(t, c, "RUN2")
	startTestRun(t, c, "RUN3")
	posts := len(poster.posts)

	if _, err := c.DB.InsertOwnerInput(ctx, db.OwnerInput{RunID: "RUN1", MessageTS: "1700000000.000900", Text: "stop", ReceivedAt: "t"}); err != nil {
		t.Fatal(err)
	}
	_, err := c.PostReply(ctx, ReplyParams{RunID: "RUN1", Text: "progress"})
	var gate *ContentGateError
	if !errors.As(err, &gate) || gate.Kind != GateOwnerInput || rpcCode(err) != ipc.ErrUnavailable {
		t.Fatalf("reply over pending owner input: %v (code %d); want owner_input refusal", err, rpcCode(err))
	}

	if err := c.DisableSlackForRun(ctx, "RUN2"); err != nil {
		t.Fatal(err)
	}
	if _, err := c.PostReply(ctx, ReplyParams{RunID: "RUN2", Text: "progress"}); rpcCode(err) != ipc.ErrSlackDisabled {
		t.Fatalf("reply on a disabled run: %v (code %d); want slack_disabled", err, rpcCode(err))
	}

	if err := c.FinishRun(ctx, FinishRunInput{RunID: "RUN3", Outcome: "completed"}); err != nil {
		t.Fatal(err)
	}
	posts3 := len(poster.posts)
	if _, err := c.PostReply(ctx, ReplyParams{RunID: "RUN3", Text: "late"}); !errors.Is(err, db.ErrRunNotActive) || rpcCode(err) != 0 {
		t.Fatalf("reply on a finished run: %v (code %d); want ErrRunNotActive as a usage error", err, rpcCode(err))
	}
	if len(poster.posts) != posts3 {
		t.Fatalf("reply on a finished run posted %d messages", len(poster.posts)-posts3)
	}
	for _, p := range poster.posts[posts:] {
		if p.Text == "progress" || p.Text == "late" {
			t.Fatalf("refused reply reached Slack: %+v", p)
		}
	}
}

func TestPostReplyFailureDoesNotCloseTheGate(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	c.Health = func() string { return slackapi.SocketConnected }
	ctx := context.Background()
	startTestRun(t, c, "RUN1")

	poster.fail = errors.New("ratelimited")
	_, err := c.PostReply(ctx, ReplyParams{RunID: "RUN1", Text: "progress"})
	var delivery *DeliveryError
	if !errors.As(err, &delivery) || rpcCode(err) != ipc.ErrUnavailable {
		t.Fatalf("failed reply: %v (code %d); want a delivery error", err, rpcCode(err))
	}
	run, err := c.DB.GetRun(ctx, "RUN1")
	if err != nil {
		t.Fatal(err)
	}
	if run.LastDeliveryError.Valid {
		t.Fatalf("failed reply recorded delivery error %q; a progress reply must not close the gate", run.LastDeliveryError.String)
	}
	poster.fail = nil
	if gate, err := c.CheckBeforeWrite(ctx, "RUN1"); err != nil || gate.Kind != GateReady {
		t.Fatalf("gate after a failed reply: %+v, %v; want ready", gate, err)
	}
}

func TestPostReplyGatesInsideStatusLock(t *testing.T) {
	c, poster, _ := newTestCoordinator(t)
	c.Health = func() string { return slackapi.SocketConnected }
	ctx := context.Background()
	startTestRun(t, c, "RUN1")
	posts := len(poster.posts)

	// A disable that commits while the reply waits for statusMu must win.
	c.statusMu.Lock()
	done := make(chan error, 1)
	go func() {
		_, err := c.PostReply(ctx, ReplyParams{RunID: "RUN1", Text: "progress"})
		done <- err
	}()
	time.Sleep(50 * time.Millisecond)
	if err := c.DB.DisableSlack(ctx, "RUN1"); err != nil {
		c.statusMu.Unlock()
		t.Fatal(err)
	}
	c.statusMu.Unlock()
	if err := <-done; rpcCode(err) != ipc.ErrSlackDisabled {
		t.Fatalf("reply racing a disable: %v (code %d); want slack_disabled", err, rpcCode(err))
	}
	if len(poster.posts) != posts {
		t.Fatalf("reply racing a disable posted %d messages", len(poster.posts)-posts)
	}
}
