package worktrees

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type pendingWorktree struct{ Source, Dir, Head string }

func journalPath(dir string) string         { return dir + ".safety-dance-pending.json" }
func removingJournalPath(dir string) string { return dir + ".safety-dance-removing.json" }

// CreateDetached journals ownership before Git creates the worktree. The
// journal remains until the run row has committed ownership.
func CreateDetached(ctx context.Context, source, dir, head string) (err error) {
	if source == "" || dir == "" || head == "" {
		return fmt.Errorf("source, directory, and head are required")
	}
	if err = os.MkdirAll(filepath.Dir(dir), 0755); err != nil {
		return err
	}
	marker := journalPath(dir)
	raw, err := json.Marshal(pendingWorktree{Source: source, Dir: dir, Head: head})
	if err != nil {
		return err
	}
	if err = os.WriteFile(marker, raw, 0600); err != nil {
		return fmt.Errorf("journal worktree creation: %w", err)
	}
	defer func() {
		if err != nil {
			_ = os.Remove(marker)
		}
	}()
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "add", "--detach", dir, head)
	if out, runErr := cmd.CombinedOutput(); runErr != nil {
		return fmt.Errorf("create worktree: %w: %s", runErr, out)
	}
	verify := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "HEAD")
	out, err := verify.Output()
	if err != nil {
		return fmt.Errorf("verify worktree: %w", err)
	}
	if got := strings.TrimSpace(string(out)); got != head {
		return fmt.Errorf("worktree head mismatch: got %s want %s", got, head)
	}
	return nil
}

// CommitOwnership removes the creation journal only after the run row owns it.
func CommitOwnership(dir string) error {
	if err := os.Remove(journalPath(dir)); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("complete worktree ownership journal: %w", err)
	}
	return nil
}

// RemoveDetached records removal before attempting it. A failed removal leaves
// the record for startup retry.
func RemoveDetached(ctx context.Context, source, dir string) error {
	if source == "" || dir == "" {
		return fmt.Errorf("source and directory are required")
	}
	raw, err := json.Marshal(pendingWorktree{Source: source, Dir: dir})
	if err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	marker := removingJournalPath(dir)
	if err := os.WriteFile(marker, raw, 0600); err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "remove", "--force", dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("remove worktree: %w: %s", err, out)
	}
	if err := os.Remove(marker); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("complete worktree removal journal: %w", err)
	}
	_ = os.Remove(journalPath(dir))
	return nil
}

// RecoverPending removes worktrees whose ownership transaction was interrupted
// before run persistence. Protected paths belong to committed runs.
func RecoverPending(ctx context.Context, root string, protected ...string) error {
	return filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".safety-dance-pending.json") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var pending pendingWorktree
		if err := json.Unmarshal(raw, &pending); err != nil {
			return fmt.Errorf("read pending worktree %s: %w", path, err)
		}
		for _, owned := range protected {
			if filepath.Clean(owned) == filepath.Clean(pending.Dir) {
				return nil
			}
		}
		if err := RemoveDetached(ctx, pending.Source, pending.Dir); err != nil {
			return err
		}
		return nil
	})
}

// RecoverRemoving retries removals whose daemon died during cleanup.
func RecoverRemoving(ctx context.Context, root string) error {
	return filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() || !strings.HasSuffix(path, ".safety-dance-removing.json") {
			return nil
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var removing pendingWorktree
		if err := json.Unmarshal(raw, &removing); err != nil {
			return fmt.Errorf("read removing worktree %s: %w", path, err)
		}
		return RemoveDetached(ctx, removing.Source, removing.Dir)
	})
}

// RecoverDetached verifies an owned run worktree after restart.
func RecoverDetached(ctx context.Context, source, dir, head string) error {
	if source == "" || dir == "" || head == "" {
		return fmt.Errorf("source, directory, and head are required")
	}
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return CreateDetached(ctx, source, dir, head)
	} else if err != nil {
		return err
	}
	verify := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "HEAD")
	out, err := verify.Output()
	if err != nil {
		return fmt.Errorf("verify recovered worktree: %w", err)
	}
	if got := strings.TrimSpace(string(out)); got != head {
		return fmt.Errorf("recovered worktree head mismatch: got %s want %s", got, head)
	}
	return nil
}
