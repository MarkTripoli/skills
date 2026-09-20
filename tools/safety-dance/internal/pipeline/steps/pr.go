package steps

import (
	"context"
	"fmt"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/conventional"
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
	if err := database.UpdateRunPRBaseBranch(run.ID, baseBranch); err != nil {
		return err
	}
	pr, err := host.FindPR(ctx, run.Branch, baseBranch)
	if err != nil {
		return err
	}
	if pr == nil {
		title := "chore: validate changes"
		if run.Intent != nil && strings.TrimSpace(*run.Intent) != "" {
			title = conventional.TightenTitle(*run.Intent)
		}
		if cfg := mergedConfig(ctx); cfg != nil {
			var titleErr error
			title, titleErr = cfg.PR.RenderTitle(run.Branch, title)
			if titleErr != nil {
				return fmt.Errorf("render pull-request title: %w", titleErr)
			}
		}
		pr, err = host.CreatePR(ctx, run.Branch, baseBranch, scm.PRContent{Title: title, Body: "Created by Safety Dance."})
		if err != nil {
			return err
		}
	}
	if pr == nil || pr.URL == "" {
		return fmt.Errorf("provider returned no pull-request URL")
	}
	if reader, ok := host.(scm.PRBaseBranchReader); ok {
		liveBase, readErr := reader.GetPRBaseBranch(ctx, pr)
		if readErr != nil {
			return readErr
		}
		if strings.TrimSpace(liveBase) != "" && strings.TrimSpace(liveBase) != baseBranch {
			retargeter, canRetarget := host.(scm.PRBaseRetargeter)
			if !canRetarget {
				return fmt.Errorf("pull-request target is %q, expected %q, and provider cannot retarget", liveBase, baseBranch)
			}
			if err := retargeter.SetPRBaseBranch(ctx, pr, baseBranch); err != nil {
				return err
			}
		}
	}
	return database.UpdateRunPRURL(run.ID, pr.URL)
}
