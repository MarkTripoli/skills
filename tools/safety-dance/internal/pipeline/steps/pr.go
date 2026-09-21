package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
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
		if step.LastActivity == nil {
			continue
		}
		var record struct {
			Kind  string   `json:"kind"`
			Items []string `json:"items"`
		}
		if json.Unmarshal([]byte(*step.LastActivity), &record) == nil && record.Kind == "typed-evidence" {
			items = append(items, record.Items...)
		} else if strings.HasPrefix(*step.LastActivity, "evidence:") {
			for _, item := range strings.Split(strings.TrimSpace(strings.TrimPrefix(*step.LastActivity, "evidence:")), ";") {
				if strings.TrimSpace(item) != "" {
					items = append(items, strings.TrimSpace(item))
				}
			}
		}
	}
	if len(items) == 0 {
		return "", nil
	}
	files := make([]string, 0, len(items))
	for i, item := range items {
		extension := ".txt"
		content := []byte(item + "\n")
		if strings.HasPrefix(item, "file://") {
			path, pathErr := confinedEvidencePath(strings.TrimPrefix(item, "file://"), worktree(ctx), dir)
			if pathErr != nil {
				return "", pathErr
			}
			info, statErr := os.Stat(path)
			if statErr != nil || !info.Mode().IsRegular() {
				return "", fmt.Errorf("evidence file is not a regular file: %s", path)
			}
			if ext := strings.ToLower(filepath.Ext(path)); ext != "" && len(ext) <= 10 {
				extension = ext
			}
			raw, readErr := os.ReadFile(path)
			if readErr != nil {
				return "", fmt.Errorf("read evidence file: %w", readErr)
			}
			content = raw
		}
		target := filepath.Join(dir, fmt.Sprintf("evidence-%03d%s", i+1, extension))
		if err := os.WriteFile(target, content, 0o600); err != nil {
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
			base := repositoryWebURL(repo.PushURL())
			for _, file := range published.Files {
				links = append(links, fmt.Sprintf("- [%s](%s/blob/%s/%s/%s)", file, strings.TrimRight(base, "/"), published.CommitSHA, published.Dir, file))
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

func confinedEvidencePath(raw, worktreeDir, evidenceRoot string) (string, error) {
	if strings.TrimSpace(raw) == "" || filepath.IsAbs(raw) {
		return "", fmt.Errorf("evidence file path must be relative to a managed root")
	}
	for _, root := range []string{worktreeDir, evidenceRoot} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		rootAbs, err := filepath.Abs(root)
		if err != nil {
			continue
		}
		candidate, err := filepath.Abs(filepath.Join(rootAbs, raw))
		if err != nil {
			continue
		}
		rel, err := filepath.Rel(rootAbs, candidate)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		resolved, err := filepath.EvalSymlinks(candidate)
		if err != nil {
			continue
		}
		resolvedRel, err := filepath.Rel(rootAbs, resolved)
		if err == nil && resolvedRel != ".." && !strings.HasPrefix(resolvedRel, ".."+string(filepath.Separator)) {
			return resolved, nil
		}
	}
	return "", fmt.Errorf("evidence file path is outside managed roots")
}

func repositoryWebURL(remote string) string {
	host := scm.ExtractHost(remote)
	path := scm.RepoPath(remote)
	if host == "" || path == "" {
		return ""
	}
	return (&url.URL{Scheme: "https", Host: host, Path: "/" + strings.TrimPrefix(path, "/")}).String()
}

func mergeEvidenceBody(existing, generated string) string {
	const start, end = "<!-- safety-dance:evidence -->", "<!-- /safety-dance:evidence -->"
	section := start + "\n" + generated + "\n" + end
	if begin := strings.Index(existing, start); begin >= 0 {
		if finish := strings.Index(existing[begin+len(start):], end); finish >= 0 {
			finish += begin + len(start)
			return existing[:begin] + section + existing[finish+len(end):]
		}
	}
	if strings.TrimSpace(existing) == "" {
		return section
	}
	return strings.TrimRight(existing, "\n") + "\n\n" + section
}
