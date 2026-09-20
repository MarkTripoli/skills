package worktrees

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCreateDetachedKeepsJournalUntilCommit(t *testing.T) {
	source := t.TempDir()
	run(t, source, "git", "init", "-q")
	run(t, source, "git", "config", "user.email", "test@example.com")
	run(t, source, "git", "config", "user.name", "Test")
	run(t, source, "sh", "-c", "printf x > file && git add file && git commit -qm init")
	head := strings.TrimSpace(string(runOut(t, source, "git", "rev-parse", "HEAD")))
	dir := filepath.Join(t.TempDir(), "run")
	if err := CreateDetached(context.Background(), source, dir, head); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(journalPath(dir)); err != nil {
		t.Fatalf("pending journal missing: %v", err)
	}
	if err := CommitOwnership(dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(journalPath(dir)); !os.IsNotExist(err) {
		t.Fatalf("journal remains: %v", err)
	}
}

func TestRecoverPendingPreservesCommittedWorktree(t *testing.T) {
	source := t.TempDir()
	run(t, source, "git", "init", "-q")
	run(t, source, "git", "config", "user.email", "test@example.com")
	run(t, source, "git", "config", "user.name", "Test")
	run(t, source, "sh", "-c", "printf x > file && git add file && git commit -qm init")
	head := strings.TrimSpace(string(runOut(t, source, "git", "rev-parse", "HEAD")))
	dir := filepath.Join(t.TempDir(), "run")
	if err := CreateDetached(context.Background(), source, dir, head); err != nil {
		t.Fatal(err)
	}
	if err := RecoverPending(context.Background(), filepath.Dir(dir), dir); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); err != nil {
		t.Fatalf("owned worktree removed: %v", err)
	}
}

func TestRemoveDetachedLeavesRetryJournalOnFailure(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "run")
	err := RemoveDetached(context.Background(), filepath.Join(t.TempDir(), "missing"), dir)
	if err == nil {
		t.Fatal("expected removal failure")
	}
	if _, statErr := os.Stat(removingJournalPath(dir)); statErr != nil {
		t.Fatalf("retry journal missing: %v", statErr)
	}
}

func TestJournalRemovalRecordsIntentBeforeRemoval(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "run")
	source := filepath.Join(t.TempDir(), "gate.git")
	if err := JournalRemoval(source, dir); err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(removingJournalPath(dir))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(raw), source) || !strings.Contains(string(raw), dir) {
		t.Fatalf("journal does not identify cleanup ownership: %s", raw)
	}
}

func TestDefaultSDHomeRecoveryFindsPendingJournal(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SD_HOME", root)
	source := filepath.Join(root, "source")
	run(t, root, "git", "init", "-q", source)
	run(t, source, "git", "config", "user.email", "test@example.com")
	run(t, source, "git", "config", "user.name", "Test")
	run(t, source, "sh", "-c", "printf x > file && git add file && git commit -qm init")
	head := strings.TrimSpace(string(runOut(t, source, "git", "rev-parse", "HEAD")))
	dir := filepath.Join(root, "worktrees", "run")
	if err := CreateDetached(context.Background(), source, dir, head); err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(root, "worktrees", ".safety-dance-journals"); JournalRootFor(dir) != want {
		t.Fatalf("journal root = %s, want %s", JournalRootFor(dir), want)
	}
	if err := RecoverPending(context.Background(), filepath.Join(root, "worktrees")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("uncommitted worktree survived recovery: %v", err)
	}
}

func TestRecoverRemovingReplaysDefaultSDHomeJournal(t *testing.T) {
	root := t.TempDir()
	t.Setenv("SD_HOME", root)
	source := filepath.Join(root, "source")
	run(t, root, "git", "init", "-q", source)
	run(t, source, "git", "config", "user.email", "test@example.com")
	run(t, source, "git", "config", "user.name", "Test")
	run(t, source, "sh", "-c", "printf x > file && git add file && git commit -qm init")
	head := strings.TrimSpace(string(runOut(t, source, "git", "rev-parse", "HEAD")))
	dir := filepath.Join(root, "worktrees", "run")
	if err := CreateDetached(context.Background(), source, dir, head); err != nil {
		t.Fatal(err)
	}
	if err := CommitOwnership(dir); err != nil {
		t.Fatal(err)
	}
	if err := JournalRemoval(source, dir); err != nil {
		t.Fatal(err)
	}
	if err := RecoverRemoving(context.Background(), filepath.Join(root, "worktrees")); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("worktree survived removal recovery: %v", err)
	}
}
