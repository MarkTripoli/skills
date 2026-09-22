package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"
)

// StatusScheduler reposts the last status of every active run that has been
// quiet for C.Quiet, so the thread shows the run is still alive.
type StatusScheduler struct {
	C *Coordinator
}

// Tick posts one status message for every run due at now and resets each
// run's quiet interval from now. Every due run is attempted; the returned
// error joins the failures.
func (s *StatusScheduler) Tick(ctx context.Context, now time.Time) error {
	due, err := s.C.DB.DueStatusRuns(ctx, stamp(now))
	if err != nil {
		return err
	}
	var errs []error
	for _, run := range due {
		e := WorkEvent{RunID: run.RunID}
		if run.LastStatus.Valid {
			if err := json.Unmarshal([]byte(run.LastStatus.String), &e); err != nil {
				errs = append(errs, fmt.Errorf("run %s: decode last status: %w", run.RunID, err))
				continue
			}
			e.RunID = run.RunID
		}
		if _, err := s.C.Slack.PostMessage(ctx, run.ChannelID, run.ThreadTS, RenderStatus(e)); err != nil {
			errs = append(errs, fmt.Errorf("run %s: post status message: %w", run.RunID, err))
			continue
		}
		if err := s.C.storeStatus(ctx, e, now); err != nil {
			errs = append(errs, err)
		}
	}
	return errors.Join(errs...)
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
