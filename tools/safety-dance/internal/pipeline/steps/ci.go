package steps

import (
	"context"
	"fmt"
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
	pr := &scm.PR{URL: *run.PRURL, HeadSHA: run.HeadSHA}
	state, err := host.GetPRState(ctx, pr)
	if err != nil {
		return err
	}
	if state != scm.PRStateOpen {
		return fmt.Errorf("ci: pull request state is %s", state)
	}
	checks, err := host.GetChecks(ctx, pr)
	if err != nil {
		return err
	}
	if len(checks) == 0 {
		return fmt.Errorf("ci: provider returned no checks")
	}
	for _, check := range checks {
		if check.Pending() || check.Bucket != scm.CheckBucketPass {
			return fmt.Errorf("ci: check %s is not passing", check.Name)
		}
	}
	return database.SetRunCIReady(run.ID, true)
}
