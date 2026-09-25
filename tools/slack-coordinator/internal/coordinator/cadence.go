package coordinator

import (
	"context"
	"errors"
	"time"
)

// SetStatusCadence adjusts one active run's routine root-edit cadence without
// affecting blocker notifications or completion. A pending event is rescheduled
// relative to the last root edit; overdue work is picked up on the next tick.
func (c *Coordinator) SetStatusCadence(ctx context.Context, in StatusCadenceInput) error {
	c.statusMu.Lock()
	defer c.statusMu.Unlock()
	if in.Seconds <= 0 {
		return errors.New("cadence must be a positive number of seconds")
	}
	// Guard against duration overflow when converting seconds to nanoseconds.
	if in.Seconds > int64((1<<63-1)/int64(time.Second)) {
		return errors.New("cadence is too large")
	}
	run, err := c.activeRun(ctx, in.RunID)
	if err != nil {
		return err
	}
	run.StatusIntervalSeconds = in.Seconds
	return c.DB.SetStatusInterval(ctx, in.RunID, in.Seconds, stamp(statusDue(run)))
}
