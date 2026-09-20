package steps

import (
	"context"
	"fmt"
	"strings"

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
	baseBranch := repo.DefaultBranch
	if cfg := mergedConfig(ctx); cfg != nil && strings.TrimSpace(cfg.PR.BaseBranch) != "" {
		baseBranch = strings.TrimSpace(cfg.PR.BaseBranch)
	}
	if run.PRBaseBranch != nil && strings.TrimSpace(*run.PRBaseBranch) != "" {
		baseBranch = strings.TrimSpace(*run.PRBaseBranch)
	}
	pr, err := host.FindPR(ctx, run.Branch, baseBranch)
	if err != nil {
		return err
	}
	if pr == nil {
		pr, err = host.CreatePR(ctx, run.Branch, baseBranch, scm.PRContent{Title: "Safety Dance validation", Body: "Created by Safety Dance."})
		if err != nil {
			return err
		}
	}
	if pr == nil || pr.URL == "" {
		return fmt.Errorf("provider returned no pull-request URL")
	}
	return database.UpdateRunPRURL(run.ID, pr.URL)
}
