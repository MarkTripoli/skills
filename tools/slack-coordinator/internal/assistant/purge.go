package assistant

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
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

	removed := 0

	// Remove the run directory of every deleted assistant_runs row.
	for _, id := range ids {
		dir := s.Paths.RunDir(id)
		if err := os.RemoveAll(dir); err != nil {
			slog.Error("run directory not removed", "path", dir, "error", err)
		} else {
			removed++
		}
	}

	// Scan the runs directory for orphaned entries whose row no longer exists.
	runsDir := filepath.Join(s.Paths.Workspace(), "runs")
	entries, readErr := os.ReadDir(runsDir)
	if readErr != nil && !os.IsNotExist(readErr) {
		slog.Warn("purge could not scan runs directory", "path", runsDir, "error", readErr)
	}
	for _, e := range entries {
		id := e.Name()
		exists, err := s.DB.AssistantRunExists(ctx, id)
		if err != nil {
			slog.Error("run directory not removed", "path", filepath.Join(runsDir, id), "error", err)
			continue
		}
		if !exists {
			dir := filepath.Join(runsDir, id)
			if err := os.RemoveAll(dir); err != nil {
				slog.Error("run directory not removed", "path", dir, "error", err)
			} else {
				removed++
			}
		}
	}

	if len(ids) > 0 || removed > 0 {
		slog.Info("purge deleted assistant runs", "count", len(ids), "dirs_removed", removed)
	}
}
