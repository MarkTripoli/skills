package coordinator

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"unicode/utf8"
)

// ReplyParams posts one progress reply, without blocks, in an active run's thread.
type ReplyParams struct {
	RunID string `json:"run_id"`
	Text  string `json:"text"`
}

// ReplyResult identifies the posted thread reply.
type ReplyResult struct {
	RunID     string `json:"run_id"`
	ThreadTS  string `json:"thread_ts"`
	MessageTS string `json:"message_ts"`
}

// maxReplyChars is Slack's chat.postMessage text limit. Longer text is
// refused before the gate, so it exits as a usage error rather than as an
// outage the agent would retry.
const maxReplyChars = 40000

// PostReply posts Text verbatim as a thread reply under the run's root after a
// fresh write gate, so an agent never talks over an unanswered owner reply.
// Slack renders the text as mrkdwn, so mentions in it notify. It holds
// statusMu from the gate through the post, so a concurrent finish or Slack
// disable lands either before the gate or after the reply. It never edits the
// root or the status card and does not touch the cadence. A failed post is
// returned as a DeliveryError but is not recorded as the run's last delivery
// error: no scheduler retries a progress reply, so it must not hold the run's
// gate closed.
func (c *Coordinator) PostReply(ctx context.Context, in ReplyParams) (ReplyResult, error) {
	if strings.TrimSpace(in.Text) == "" {
		return ReplyResult{}, errors.New("text is required")
	}
	if n := utf8.RuneCountInString(in.Text); n > maxReplyChars {
		return ReplyResult{}, fmt.Errorf("text is %d characters; Slack accepts at most %d", n, maxReplyChars)
	}
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	run, err := c.requireWriteReady(ctx, in.RunID)
	if err != nil {
		return ReplyResult{}, err
	}
	ts, err := c.Slack.PostBlocksMessage(ctx, run.ChannelID, run.ThreadTS, in.Text, nil)
	if err != nil {
		return ReplyResult{}, fmt.Errorf("post reply: %w", &DeliveryError{Err: err})
	}
	return ReplyResult{RunID: run.RunID, ThreadTS: run.ThreadTS, MessageTS: ts}, nil
}
