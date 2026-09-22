package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/slack-go/slack/slackevents"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

// verifyText is the DM assistant.verify_owner posts to the owner.
const verifyText = "Reply to this message to finish setup"

// defaultVerifyTimeout is how long one verification waits for the owner's
// reply; the onboard client allows 130 s for the call.
const defaultVerifyTimeout = 120 * time.Second

// errVerifyPending refuses a second assistant.verify_owner while one is
// waiting: two waiters could not tell whose post a reply answers.
var errVerifyPending = errors.New("a setup verification is already waiting for the owner's reply")

// pendingVerify is one verification in flight. ts is the setup post's
// timestamp, empty until chat.postMessage returns; done is closed once by
// resolveVerify when the owner's reply arrives.
type pendingVerify struct {
	ts   string
	done chan struct{}
}

// Register binds assistant.verify_owner to server.
func (s *Service) Register(server *ipc.Server) {
	server.Handle(ipc.MethodAssistantVerifyOwner, func(ctx context.Context, _ json.RawMessage) (interface{}, error) {
		return s.VerifyOwner(ctx)
	})
}

// VerifyOwner opens the owner's DM, posts verifyText, and blocks until the
// owner answers it (a top-level DM later than the post, or a reply in its
// thread), the verification window passes, or ctx ends. The answer is
// consumed by routeDM without a row, reaction, or ack. The display name comes
// from users.info; when that call fails the owner id stands in and the
// failure is logged, because the reply itself is the proof setup needs.
func (s *Service) VerifyOwner(ctx context.Context) (ipc.VerifyOwnerResult, error) {
	v := &pendingVerify{done: make(chan struct{})}
	s.verifyMu.Lock()
	if s.verify != nil {
		s.verifyMu.Unlock()
		return ipc.VerifyOwnerResult{}, errVerifyPending
	}
	s.verify = v
	s.verifyMu.Unlock()
	defer s.clearVerify(v)

	dm, err := s.Slack.OpenConversation(ctx, s.Owner)
	if err != nil {
		return ipc.VerifyOwnerResult{}, fmt.Errorf("open owner DM: %w", err)
	}
	ts, err := s.Slack.PostMessage(ctx, dm, "", verifyText)
	if err != nil {
		return ipc.VerifyOwnerResult{}, fmt.Errorf("post setup DM: %w", err)
	}
	s.verifyMu.Lock()
	v.ts = ts
	s.verifyMu.Unlock()

	timeout := s.verifyTimeout
	if timeout <= 0 {
		timeout = defaultVerifyTimeout
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case <-v.done:
	case <-ctx.Done():
		return ipc.VerifyOwnerResult{}, ctx.Err()
	case <-timer.C:
		// A reply that raced the timer still counts: once the slot is cleared
		// no later reply can resolve v, so done is final.
		s.clearVerify(v)
		select {
		case <-v.done:
		default:
			return ipc.VerifyOwnerResult{Timeout: true}, nil
		}
	}
	return ipc.VerifyOwnerResult{OK: true, DisplayName: s.ownerDisplayName(ctx)}, nil
}

// clearVerify releases the verification slot if v still holds it.
func (s *Service) clearVerify(v *pendingVerify) {
	s.verifyMu.Lock()
	if s.verify == v {
		s.verify = nil
	}
	s.verifyMu.Unlock()
}

// ownerDisplayName is the owner's display name from users.info, or the owner
// id when the call fails.
func (s *Service) ownerDisplayName(ctx context.Context) string {
	user, err := s.Slack.UserInfo(ctx, s.Owner)
	if err != nil {
		slog.Warn("owner display name not resolved", "user", s.Owner, "error", err)
		return s.Owner
	}
	if user.DisplayName == "" {
		return s.Owner
	}
	return user.DisplayName
}

// resolveVerify reports whether msg, an owner DM, answers the pending
// verification and resolves it when so. A DM that arrives before
// chat.postMessage returned cannot be an answer and is routed normally.
func (s *Service) resolveVerify(msg *slackevents.MessageEvent) bool {
	s.verifyMu.Lock()
	defer s.verifyMu.Unlock()
	v := s.verify
	if v == nil || v.ts == "" || !answersVerify(msg, v.ts) {
		return false
	}
	s.verify = nil
	close(v.done)
	return true
}

// answersVerify reports whether msg answers the setup post at ts: a reply in
// its thread, or a top-level DM with a later timestamp.
func answersVerify(msg *slackevents.MessageEvent, ts string) bool {
	if msg.ThreadTimeStamp != "" {
		return msg.ThreadTimeStamp == ts
	}
	return msg.TimeStamp > ts
}
