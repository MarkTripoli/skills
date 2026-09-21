package steps

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/conventional"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/evidence"
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
	body, bodyErr := renderEvidence(ctx, repo, run, pr.URL)
	if bodyErr != nil {
		return bodyErr
	}
	if strings.TrimSpace(body) != "" {
		if _, err := host.UpdatePR(ctx, pr, scm.PRContent{Body: body}); err != nil {
			return err
		}
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

func renderEvidence(ctx context.Context, repo *db.Repo, run *db.Run, prURL string) (string, error) {
	cfg := mergedConfig(ctx)
	if cfg == nil || strings.TrimSpace(evidenceDir(ctx)) == "" {
		return "", nil
	}
	dir := evidenceDir(ctx)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return "", err
	}
	steps, err := dbValue(ctx).GetStepsByRun(run.ID)
	if err != nil {
		return "", err
	}
	var items []string
	for _, step := range steps {
		if step.LastActivity == nil || !strings.HasPrefix(*step.LastActivity, "evidence:") {
			continue
		}
		for _, item := range strings.Split(strings.TrimSpace(strings.TrimPrefix(*step.LastActivity, "evidence:")), ";") {
			if strings.TrimSpace(item) != "" {
				items = append(items, strings.TrimSpace(item))
			}
		}
	}
	if len(items) == 0 {
		return "", nil
	}
	files := make([]string, 0, len(items))
	for i, item := range items {
		target := filepath.Join(dir, fmt.Sprintf("evidence-%03d.txt", i+1))
		if err := os.WriteFile(target, []byte(item+"\n"), 0o600); err != nil {
			return "", err
		}
		files = append(files, target)
	}
	var links []string
	if cfg.Test.Evidence.StoreInRepo {
		published, err := evidence.Publish(ctx, evidence.Request{RepoDir: worktree(ctx), PushURL: repo.PushURL(), Branch: cfg.Test.Evidence.Branch, Dir: cfg.Test.Evidence.Dir, Segments: []string{run.Branch, run.ID}, SourceDir: dir, Message: "safety-dance: publish test evidence", ForbiddenBranches: []string{run.Branch, repo.DefaultBranch}})
		if err != nil {
			return "", err
		}
		if published != nil {
			for _, file := range published.Files {
				links = append(links, fmt.Sprintf("- [%s](%s)", file, strings.TrimRight(prURL, "/")+"/blob/"+published.CommitSHA+"/"+published.Dir+"/"+file))
			}
		}
	}
	if cfg.Test.Evidence.AttachMedia {
		if uploader, ok := scmHost(ctx).(interface {
			UploadUserAsset(context.Context, string) (string, error)
		}); ok {
			for _, file := range files {
				ext := strings.ToLower(filepath.Ext(file))
				if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".gif" && ext != ".webm" && ext != ".mp4" {
					continue
				}
				url, err := uploader.UploadUserAsset(ctx, file)
				if err != nil {
					return "", err
				}
				links = append(links, "- "+url)
			}
		}
	}
	if len(links) == 0 {
		return "- Evidence: `" + dir + "`", nil
	}
	return "## Safety Dance evidence\n\n" + strings.Join(links, "\n"), nil
}
