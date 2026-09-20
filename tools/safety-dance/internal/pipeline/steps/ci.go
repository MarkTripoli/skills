package steps

import (
	"context"
	"fmt"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
)

func CI(ctx context.Context) error {
	host := scmHost(ctx)
	database := dbValue(ctx)
	if host == nil || database == nil {
		return fmt.Errorf("ci: SCM owner is required")
	}
	run, err := database.GetRun(runID(ctx))
	if err != nil {
		return err
	}
	if run == nil || run.PRURL == nil || *run.PRURL == "" {
		return fmt.Errorf("ci: pull request URL is required")
	}
	if err := host.Available(ctx); err != nil {
		return fmt.Errorf("ci provider unavailable: %w", err)
	}
	expectedHead := run.HeadSHA
	pr := &scm.PR{URL: *run.PRURL, HeadSHA: expectedHead}
	cfg := mergedConfig(ctx)
	timeout := config.DefaultCITimeout
	if cfg != nil {
		timeout = cfg.CITimeout
	}
	deadline := time.Time{}
	if timeout > 0 {
		deadline = time.Now().Add(timeout)
	}
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		state, stateErr := host.GetPRState(ctx, pr)
		if stateErr != nil {
			return stateErr
		}
		if state != scm.PRStateOpen {
			return fmt.Errorf("ci: pull request state is %s", state)
		}
		checks, checksErr := host.GetChecks(ctx, pr)
		if checksErr != nil {
			return checksErr
		}
		if len(checks) > 0 {
			allPassing := true
			for _, check := range checks {
				if check.Bucket != scm.CheckBucketPass {
					if !check.Pending() {
						return fmt.Errorf("ci: check %s is not passing", check.Name)
					}
					allPassing = false
				}
			}
			if allPassing {
				return database.SetRunCIReady(run.ID, true)
			}
		}
		if !deadline.IsZero() && !time.Now().Before(deadline) {
			return fmt.Errorf("ci: checks did not pass before timeout")
		}
		timer := time.NewTimer(ciPollInterval)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

var ciPollInterval = 2 * time.Second
