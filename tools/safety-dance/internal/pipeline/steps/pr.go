package steps

import (
	"context"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
)

func PR(ctx context.Context) error {
	host := scmHost(ctx)
	database := dbValue(ctx)
	if host == nil || database == nil {
		return fmt.Errorf("pull-request: SCM owner is required")
	}
	run, err := database.GetRun(runID(ctx))
	if err != nil {
		return err
	}
	if run == nil {
		return fmt.Errorf("run not found")
	}
	repo, err := database.GetRepo(run.RepoID)
	if err != nil {
		return err
	}
	if repo == nil {
		return fmt.Errorf("repository not found")
	}
	if err := host.Available(ctx); err != nil {
		return fmt.Errorf("pull-request provider unavailable: %w", err)
	}
	pr, err := host.FindPR(ctx, run.Branch, repo.DefaultBranch)
	if err != nil {
		return err
	}
	if pr == nil {
		pr, err = host.CreatePR(ctx, run.Branch, repo.DefaultBranch, scm.PRContent{Title: "Safety Dance validation", Body: "Created by Safety Dance."})
		if err != nil {
			return err
		}
	}
	if pr == nil || pr.URL == "" {
		return fmt.Errorf("provider returned no pull-request URL")
	}
	return database.UpdateRunPRURL(run.ID, pr.URL)
}
