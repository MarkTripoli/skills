package assistant

import (
	"context"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// TestRunPurgeTicksOnceAfterWarmup verifies that runPurgeLoop fires Purge
// exactly once after the warmup delay. It uses an injected s.Now clock and a
// stale DM request to observe that the purge ran.
func TestRunPurgeTicksOnceAfterWarmup(t *testing.T) {
	s, _, clock := newTestService(t)
	ctx := context.Background()

	// Retention: 30-day window, 7-day consumed window.
	const days, consumedDays = 30, 7
	s.Retention = config.Retention{Days: days, ConsumedDays: consumedDays}

	// Insert a DM request old enough to be purged (31 days > retention.days).
	staleRoot := "1700000000.999"
	_, err := s.DB.InsertDMRequest(ctx, db.DMRequest{
		RootTS:        staleRoot,
		ChannelID:     "D1",
		ReceivedAt:    clock.at.UTC().AddDate(0, 0, -31).Format(time.RFC3339),
		LastMessageAt: clock.at.UTC().AddDate(0, 0, -31).Format(time.RFC3339),
	})
	if err != nil {
		t.Fatal(err)
	}

	// Run the purge loop with a 5 ms warmup (much shorter than 1 min) and a
	// 1-hour repeat period so only the initial tick fires during the test.
	loopCtx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() {
		defer close(done)
		s.runPurgeLoop(loopCtx, 5*time.Millisecond, time.Hour)
	}()

	// Give the warmup enough wall time to fire, then stop the loop.
	time.Sleep(100 * time.Millisecond)
	cancel()
	<-done

	// The stale DM request must have been deleted by the purge.
	_, ok, err := s.DB.GetDMRequest(ctx, staleRoot)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("stale dm_request still present; RunPurge did not fire")
	}
}
