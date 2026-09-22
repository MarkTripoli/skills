package coordinator

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
)

// BacklinkWriter is the Jira surface StartRun and the scheduler need.
type BacklinkWriter interface {
	SetThreadURL(ctx context.Context, issueKey, threadURL string) error
}

// maxBackoff caps the wait between backlink attempts.
const maxBackoff = time.Hour

// backoff is how long a backlink waits after its n-th failed attempt:
// min(1h, 30s << n).
func backoff(n int) time.Duration {
	if n < 0 || n >= 7 { // 30s << 7 already exceeds the cap
		return maxBackoff
	}
	return min(maxBackoff, 30*time.Second<<n)
}

// attemptBacklink writes b's thread URL to its issue once. Success marks the
// row delivered; failure counts the attempt, records the error, and schedules
// the next try after backoff(b.Attempts). The run's own delivery state is
// never touched, so run check does not see Jira failures.
func (c *Coordinator) attemptBacklink(ctx context.Context, b db.Backlink, now time.Time) error {
	if c.Jira == nil {
		return errors.New("jira is not configured")
	}
	if err := c.Jira.SetThreadURL(ctx, b.IssueKey, b.ThreadURL); err != nil {
		next := stamp(now.Add(backoff(b.Attempts)))
		if dbErr := c.DB.MarkBacklinkFailed(ctx, b.RunID, err.Error(), next); dbErr != nil {
			return errors.Join(err, fmt.Errorf("record backlink failure: %w", dbErr))
		}
		return err
	}
	return c.DB.MarkBacklinkDelivered(ctx, b.RunID)
}

// retryBacklinks attempts every pending backlink due at now. Nothing runs when
// Jira is not configured.
func (c *Coordinator) retryBacklinks(ctx context.Context, now time.Time) error {
	if c.Jira == nil {
		return nil
	}
	due, err := c.DB.DueBacklinks(ctx, stamp(now))
	if err != nil {
		return err
	}
	var errs []error
	for _, b := range due {
		if err := c.attemptBacklink(ctx, b, now); err != nil {
			errs = append(errs, fmt.Errorf("backlink %s -> %s: %w", b.RunID, b.IssueKey, err))
		}
	}
	return errors.Join(errs...)
}
