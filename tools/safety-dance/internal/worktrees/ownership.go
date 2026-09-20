package worktrees

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type pendingWorktree struct{ Source, Dir, Head string }

func metadataDir(dir string) string {
	clean := filepath.Clean(dir)
	configured := strings.TrimSpace(os.Getenv("SD_HOME"))
	if configured == "" {
		if home, err := os.UserHomeDir(); err == nil {
			configured = filepath.Join(home, ".safety-dance")
		}
	}
	if configured != "" {
		if root, err := filepath.Abs(configured); err == nil {
			defaultRoot := filepath.Join(root, "worktrees")
			rel, relErr := filepath.Rel(defaultRoot, clean)
			if relErr == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
				return filepath.Join(defaultRoot, ".safety-dance-journals")
			}
		}
	}
	return filepath.Join(filepath.Dir(clean), ".safety-dance-journals")
}

// JournalRootFor returns the durable journal directory for a recorded worktree.
func JournalRootFor(dir string) string { return metadataDir(dir) }
func journalName(dir, kind string) string {
	sum := sha256.Sum256([]byte(filepath.Clean(dir)))
	return hex.EncodeToString(sum[:]) + ".safety-dance-" + kind + ".json"
}
func journalPath(dir string) string {
	return filepath.Join(metadataDir(dir), journalName(dir, "pending"))
}
func removingJournalPath(dir string) string {
	return filepath.Join(metadataDir(dir), journalName(dir, "removing"))
}

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
	if err = os.MkdirAll(filepath.Dir(marker), 0700); err != nil {
		return err
	}
	raw, err := json.Marshal(pendingWorktree{Source: source, Dir: dir, Head: head})
	if err != nil {
		return err
	}
	if err = os.WriteFile(marker, raw, 0600); err != nil {
		return fmt.Errorf("journal worktree creation: %w", err)
	}
	created := false
	defer func() {
		if err != nil && !created {
			_ = os.Remove(marker)
		}
	}()
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "add", "--detach", dir, head)
	if out, runErr := cmd.CombinedOutput(); runErr != nil {
		return fmt.Errorf("create worktree: %w: %s", runErr, out)
	}
	created = true
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

// JournalRemoval records cleanup intent before a run enters terminal state.
// RemoveDetached performs the recorded operation and clears this marker only
// after Git confirms removal.
func JournalRemoval(source, dir string) error {
	if source == "" || dir == "" {
		return fmt.Errorf("source and directory are required")
	}
	raw, err := json.Marshal(pendingWorktree{Source: source, Dir: dir})
	if err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	marker := removingJournalPath(dir)
	if err := os.MkdirAll(filepath.Dir(marker), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(marker, raw, 0600); err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	return nil

}
func RemoveDetached(ctx context.Context, source, dir string) error {
	if source == "" || dir == "" {
		return fmt.Errorf("source and directory are required")
	}
	raw, err := json.Marshal(pendingWorktree{Source: source, Dir: dir})
	if err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	marker := removingJournalPath(dir)
	if err := os.MkdirAll(filepath.Dir(marker), 0700); err != nil {
		return err
	}
	if err := os.WriteFile(marker, raw, 0600); err != nil {
		return fmt.Errorf("journal worktree removal: %w", err)
	}
	if _, sourceErr := os.Stat(source); sourceErr != nil {
		return fmt.Errorf("inspect worktree source: %w", sourceErr)
	}
	if _, statErr := os.Stat(dir); os.IsNotExist(statErr) {
		_ = os.Remove(marker)
		_ = os.Remove(journalPath(dir))
		return nil
	} else if statErr != nil {
		return fmt.Errorf("inspect worktree before removal: %w", statErr)
	}
	cmd := exec.CommandContext(ctx, "git", "-C", source, "worktree", "remove", "--force", dir)
	if out, err := cmd.CombinedOutput(); err != nil {
		if _, statErr := os.Stat(dir); os.IsNotExist(statErr) {
			_ = os.Remove(marker)
			_ = os.Remove(journalPath(dir))
			return nil
		}
		return fmt.Errorf("remove worktree: %w: %s", err, out)
	}
	if err := os.Remove(marker); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("complete worktree removal journal: %w", err)
	}
	_ = os.Remove(journalPath(dir))
	return nil
}

// SourceFor returns the repository that owns dir, refusing to guess from the
// configured repository when a run was created from a different Git source.
func SourceFor(ctx context.Context, sources []string, dir string) (string, error) {
	want, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for _, source := range sources {
		if source == "" {
			continue
		}
		out, runErr := exec.CommandContext(ctx, "git", "-C", source, "worktree", "list", "--porcelain").Output()
		if runErr != nil {
			continue
		}
		for _, line := range strings.Split(string(out), "\n") {
			if strings.HasPrefix(line, "worktree ") {
				candidate, absErr := filepath.Abs(strings.TrimPrefix(line, "worktree "))
				if absErr == nil && candidate == want {
					return source, nil
				}
			}
		}
	}
	return "", fmt.Errorf("worktree %s is not registered with a known source", dir)
}

// RecoverPending removes worktrees whose ownership transaction was interrupted
// before run persistence. Protected paths belong to committed runs.
func RecoverPending(ctx context.Context, root string, protected ...string) error {
	journalRoot := filepath.Join(root, ".safety-dance-journals")
	if _, err := os.Stat(journalRoot); os.IsNotExist(err) {
		return nil
	}
	return filepath.WalkDir(journalRoot, func(path string, entry os.DirEntry, walkErr error) error {
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
		return RemoveDetached(ctx, pending.Source, pending.Dir)
	})
}

// RecoverRemoving retries removals whose daemon died during cleanup.
func RecoverRemoving(ctx context.Context, root string, protected ...string) error {
	journalRoot := filepath.Join(root, ".safety-dance-journals")
	if _, err := os.Stat(journalRoot); os.IsNotExist(err) {
		return nil
	}
	return filepath.WalkDir(journalRoot, func(path string, entry os.DirEntry, walkErr error) error {
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
		for _, owned := range protected {
			if filepath.Clean(owned) == filepath.Clean(removing.Dir) {
				return nil
			}
		}
		return RemoveDetached(ctx, removing.Source, removing.Dir)
	})
}

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
