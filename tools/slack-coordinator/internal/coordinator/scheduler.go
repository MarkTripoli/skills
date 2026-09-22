package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// StatusScheduler reposts the last status of every active run that has been
// quiet for C.Quiet, so the thread shows the run is still alive, retries runs
// whose last post failed so run check can return to ready, and retries Jira
// backlinks that are due.
type StatusScheduler struct {
	C *Coordinator
}

// Tick posts one status message for every run due at now and for every run
// carrying a delivery error, resets each posted run's quiet interval from
// now, then retries due Jira backlinks. Every run is attempted; the returned
// error joins the failures.
func (s *StatusScheduler) Tick(ctx context.Context, now time.Time) error {
	due, err := s.C.DB.DueStatusRuns(ctx, stamp(now))
	if err != nil {
		return err
	}
	failed, err := s.C.DB.RunsWithDeliveryError(ctx)
	if err != nil {
		return err
	}
	seen := make(map[string]bool, len(due))
	var errs []error
	for _, batch := range [2][]db.Run{due, failed} {
		for _, run := range batch {
			if seen[run.RunID] {
				continue
			}
			seen[run.RunID] = true
			if err := s.repostStatus(ctx, run, now); err != nil {
				errs = append(errs, fmt.Errorf("run %s: %w", run.RunID, err))
			}
		}
	}
	if err := s.C.retryBacklinks(ctx, now); err != nil {
		errs = append(errs, err)
	}
	return errors.Join(errs...)
}

// repostStatus posts run's last status again (an all-None status when the run
// has none yet) and restarts its quiet interval.
func (s *StatusScheduler) repostStatus(ctx context.Context, run db.Run, now time.Time) error {
	e := WorkEvent{RunID: run.RunID}
	if run.LastStatus.Valid {
		if err := json.Unmarshal([]byte(run.LastStatus.String), &e); err != nil {
			return fmt.Errorf("decode last status: %w", err)
		}
		e.RunID = run.RunID
	}
	if err := s.C.post(ctx, run, RenderStatus(e)); err != nil {
		return fmt.Errorf("post status message: %w", err)
	}
	return s.C.storeStatus(ctx, e, now)
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
