package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// StatusScheduler applies due status-card edits (or legacy root edits), retries
// failed deliveries and Jira backlinks, and flags unread owner replies.
type StatusScheduler struct {
	C *Coordinator
}

// Tick retries failed status-card edits and due Jira backlinks and posts
// unread-reply notices. Every run is attempted; errors are joined.
func (s *StatusScheduler) Tick(ctx context.Context, now time.Time) error {
	s.C.statusMu.Lock()
	defer s.C.statusMu.Unlock()
	due, err := s.C.DB.DueStatusRuns(ctx, stamp(now))
	if err != nil {
		return err
	}
	failed, err := s.C.DB.RunsWithDeliveryError(ctx)
	if err != nil {
		return err
	}
	var errs []error
	seen := make(map[string]bool, len(due))
	for _, run := range due {
		seen[run.RunID] = true
		if run.LastDeliveryError.Valid && strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
			continue
		}
		if !run.LastStatus.Valid {
			if err := s.C.DB.ClearStatusDue(ctx, run.RunID); err != nil {
				errs = append(errs, fmt.Errorf("run %s: %w", run.RunID, err))
			}
			continue
		}
		if run.LastDeliveryError.Valid && strings.HasPrefix(run.LastDeliveryError.String, "blocker notification:") {
			continue
		}
		if err := s.retryStatus(ctx, run); err != nil {
			errs = append(errs, fmt.Errorf("run %s: %w", run.RunID, err))
		}
	}
	for _, run := range failed {
		if seen[run.RunID] || !run.LastStatus.Valid {
			continue
		}
		if strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
			continue
		}
		// A failed blocker reply needs the originating event retried; editing
		// the root cannot recover it or clear its unavailable gate.
		if strings.HasPrefix(run.LastDeliveryError.String, "blocker notification:") {
			continue
		}
		if err := s.retryStatus(ctx, run); err != nil {
			errs = append(errs, fmt.Errorf("run %s: %w", run.RunID, err))
		}
	}
	if err := s.C.retryBacklinks(ctx, now); err != nil {
		errs = append(errs, err)
	}
	if err := s.noticeUnreadInputs(ctx, now); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// unreadInputAfter is how long an owner reply may sit unread before the
// thread is told no agent has read it.
const unreadInputAfter = 5 * time.Minute

const unreadInputNotice = "No agent has read this reply yet; the agent may have stopped. `!runs` lists active runs."

// noticeUnreadInputs posts one notice per owner input left unread past
// unreadInputAfter. It bypasses c.post so a failure never becomes the run's
// last_delivery_error; the unmarked input is retried on a later tick.
func (s *StatusScheduler) noticeUnreadInputs(ctx context.Context, now time.Time) error {
	stale, err := s.C.DB.StaleOwnerInputs(ctx, stamp(now.Add(-unreadInputAfter)))
	if err != nil {
		return err
	}
	var errs []error
	for _, in := range stale {
		if _, err := s.C.Slack.PostBlocksMessage(ctx, in.ChannelID, in.ThreadTS, unreadInputNotice, nil); err != nil {
			errs = append(errs, fmt.Errorf("run %s: unread input notice %s: %w", in.RunID, in.MessageTS, err))
			continue
		}
		if err := s.C.DB.MarkStaleNotice(ctx, in.RunID, in.MessageTS, stamp(now)); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
}

// retryStatus edits the status card with the last saved event.
func (s *StatusScheduler) retryStatus(ctx context.Context, run db.Run) error {
	e := WorkEvent{RunID: run.RunID}
	if run.LastStatus.Valid {
		if err := json.Unmarshal([]byte(run.LastStatus.String), &e); err != nil {
			return fmt.Errorf("decode last status: %w", err)
		}
		e.RunID = run.RunID
	}
	return s.C.renderStatus(ctx, run, e)
}

// Run calls Tick every `every` until ctx ends, logging failures.
func (s *StatusScheduler) Run(ctx context.Context, every time.Duration) {
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			if err := s.Tick(ctx, now); err != nil {
				slog.Warn("status scheduler tick failed", "error", err)
			}
		}
	}
}
