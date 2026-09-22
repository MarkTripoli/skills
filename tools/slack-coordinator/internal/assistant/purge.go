package assistant

import (
	"context"
	"log/slog"
	"time"
)

// Purge runs one full retention sweep using now as the reference clock and the
// service's configured retention windows. It returns the run_id of every
// deleted assistant_runs row.
func (s *Service) Purge(ctx context.Context, now time.Time) ([]string, error) {
	return s.DB.PurgeRetention(ctx, now, s.Retention.Days, s.Retention.ConsumedDays)
}

// RunPurge runs Purge once after a one-minute warm-up delay and then every 24
// hours until ctx is cancelled. Errors are logged; the loop continues on failure.
func (s *Service) RunPurge(ctx context.Context) {
	s.runPurgeLoop(ctx, time.Minute, 24*time.Hour)
}

// runPurgeLoop is the testable core of RunPurge: it fires once after warmup
// then every period.
func (s *Service) runPurgeLoop(ctx context.Context, warmup, period time.Duration) {
	timer := time.NewTimer(warmup)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return
	case <-timer.C:
	}
	s.runPurgeOnce(ctx)

	ticker := time.NewTicker(period)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.runPurgeOnce(ctx)
		}
	}
}

func (s *Service) runPurgeOnce(ctx context.Context) {
	ids, err := s.Purge(ctx, s.Now())
	if err != nil {
		slog.Warn("purge failed", "error", err)
		return
	}
	if len(ids) > 0 {
		slog.Info("purge deleted assistant runs", "count", len(ids))
	}
}
