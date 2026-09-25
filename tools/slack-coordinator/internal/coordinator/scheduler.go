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

// StatusScheduler applies due root edits and retries failed deliveries. It
// never posts routine thread replies.
type StatusScheduler struct {
	C *Coordinator
}

// Tick retries failed root edits. Every run is attempted; the returned error
// joins the failures.
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
		// An upload error is ambiguous: retrying could create a duplicate file.
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
		// Root edits cannot determine whether the failed upload already landed.
		if run.LastDeliveryError.Valid && strings.HasPrefix(run.LastDeliveryError.String, db.UploadOutcomeUncertainPrefix) {
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
	return errors.Join(errs...)
}

// retryStatus edits the root with the last saved status.
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
