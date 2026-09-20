package gate

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/gatecontext"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/procreap"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/safeurl"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm/github"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/worktrees"
)

var ensureGateHooksPathIsolation = git.EnsureHooksPathIsolation

var sweepRunWorktrees = procreap.SweepRunWorktrees

type gateSnapshot struct {
	files    map[string][]byte
	modes    map[string]os.FileMode
	paths    map[string]bool
	links    map[string]string
	hooksDir string
}

func snapshotGate(dir string) gateSnapshot {
	s := gateSnapshot{files: map[string][]byte{}, modes: map[string]os.FileMode{}, paths: map[string]bool{}, links: map[string]string{}, hooksDir: filepath.Join(dir, "hooks")}
	paths := []string{filepath.Join(dir, "config"), filepath.Join(dir, "config.worktree"), filepath.Join(dir, "safety-dance-gate-config")}
	if entries, err := os.ReadDir(s.hooksDir); err == nil {
		for _, entry := range entries {
			if !entry.IsDir() {
				paths = append(paths, filepath.Join(s.hooksDir, entry.Name()))
			}
		}
	}
	for _, path := range paths {
		s.paths[path] = false
		info, err := os.Lstat(path)
		if err != nil {
			continue
		}
		s.paths[path] = true
		s.modes[path] = info.Mode().Perm()
		if info.Mode()&os.ModeSymlink != 0 {
			if target, readErr := os.Readlink(path); readErr == nil {
				s.links[path] = target
			}
			continue
		}
		if raw, readErr := os.ReadFile(path); readErr == nil {
			s.files[path] = raw
		}
	}
	return s
}

func (s gateSnapshot) restore() {
	if entries, err := os.ReadDir(s.hooksDir); err == nil {
		for _, entry := range entries {
			path := filepath.Join(s.hooksDir, entry.Name())
			if !s.paths[path] && !entry.IsDir() {
				_ = os.Remove(path)
			}
		}
	}
	for path, existed := range s.paths {
		if !existed {
			_ = os.Remove(path)
			continue
		}
		_ = os.Remove(path)
		if target, ok := s.links[path]; ok {
			_ = os.Symlink(target, path)
			continue
		}
		if raw, ok := s.files[path]; ok {
			_ = os.WriteFile(path, raw, s.modes[path])
			_ = os.Chmod(path, s.modes[path])
		}
	}
}

// RemoteName is the name of the git remote that points to the local gate.
const RemoteName = "safety-dance"

// repoID generates a deterministic 12-char hex ID from an absolute path.
func repoID(absPath string) string {
	h := sha256.Sum256([]byte(absPath))
	return fmt.Sprintf("%x", h[:6])
}

// Init sets up a safety-dance gate for the git repo at workDir.
// It creates a bare repo, installs the post-receive hook, best-effort
// isolates the bare repo's hooks path from shared local config writes when
// Git supports config --worktree, adds the safety-dance remote, and records
// the repo in the database.
//
// Init is idempotent: re-running it on an already-initialized repo repairs and
// refreshes the gate (for example installing a newer hook, picking up hook-path
// isolation, or restoring a missing remote) instead of failing. This includes
// a working directory that was renamed or moved since the gate was created:
// the gate identified by the leftover safety-dance remote is reattached at the
// new path, preserving its run history. The returned bool reports whether a
// new gate was created (true) or an existing one was refreshed (false).
func Init(ctx context.Context, d *db.DB, p *paths.Paths, workDir string) (*db.Repo, bool, error) {
	return InitWithFork(ctx, d, p, workDir, "")
}

// InitWithFork is Init plus an optional GitHub fork push URL. The origin remote
// remains the parent repository used for PRs. When forkURL is empty, an
// existing fork setting is preserved across idempotent refreshes.
func InitWithFork(ctx context.Context, d *db.DB, p *paths.Paths, workDir, forkURL string) (*db.Repo, bool, error) {
	if classified, err := (gatecontext.Inspector{DB: d, Paths: p}).Inspect(ctx, gatecontext.Request{CWD: workDir, MarkerPresent: gatecontext.MarkerPresent()}); err != nil {
		return nil, false, err
	} else if classified.Nested {
		return nil, false, fmt.Errorf("%s", gatecontext.RefusalMessage(classified))
	}
	forkURL = strings.TrimSpace(forkURL)

	// Normalize worktrees back to the main repo root so one repo record works
	// from either the main checkout or any attached worktree.
	gitRoot, err := git.FindMainRepoRoot(workDir)
	if err != nil {
		return nil, false, fmt.Errorf("find git root: %w", err)
	}
	absRoot := gitRoot

	// Look up any existing gate so we know whether this is a fresh init or a
	// refresh, and so we never tear down a working gate on a repair failure.
	existing, err := d.GetRepoByPath(absRoot)
	if err != nil {
		return nil, false, fmt.Errorf("check existing: %w", err)
	}
	if existing == nil {
		// No record at this path, but the repo may have been moved or renamed
		// after init; if so, reattach its existing gate instead of failing on
		// the leftover remote.
		existing, err = reattachRelocatedRepo(ctx, d, p, absRoot)
		if err != nil {
			return nil, false, err
		}
	}

	// Read origin URL. Keep the historical rewritten value for non-fork repos,
	// but preserve the literal parent URL when fork routing is configured.
	getOriginURL := git.GetRemoteURL
	if forkURL != "" || (existing != nil && strings.TrimSpace(existing.ForkURL) != "") {
		getOriginURL = git.GetConfiguredRemoteURL
	}
	upstreamURL, err := getOriginURL(ctx, absRoot, "origin")
	if err != nil {
		// A missing "origin" is a normal state for a fresh `git init` repo, so
		// give an actionable message instead of leaking git plumbing. Only
		// substitute it when origin is genuinely absent; any other git failure
		// keeps its original error.
		hasOrigin, listErr := git.HasRemote(ctx, absRoot, "origin")
		if listErr == nil && !hasOrigin {
			return nil, false, fmt.Errorf(
				"no 'origin' remote in %s\n\n"+
					"safety-dance pushes your branch and opens a pull request, so it needs a remote to push to.\n"+
					"Add one, then re-run:\n\n"+
					"  git remote add origin <url>",
				absRoot)
		}
		return nil, false, fmt.Errorf("get origin url: %w", err)
	}
	if forkURL != "" {
		if err := validateForkRouting(ctx, upstreamURL, forkURL); err != nil {
			return nil, false, err
		}
	}

	// Redact embedded credentials for everything that is persisted, logged, or
	// surfaced to the user. The bare gate keeps the full credentialled URL on
	// its "origin" remote via provisionGate below so worktrees carved from it
	// can still authenticate pushes; the push step resolves that credential
	// from the worktree at run time instead of trusting the DB copy.
	redactedUpstreamURL := safeurl.Redact(upstreamURL)

	id := repoID(absRoot)
	if existing != nil {
		id = existing.ID
	}
	bareDir := p.RepoDir(id)

	// Journal the working repository's managed remote before any gate mutation.
	originalRemote, originalRemoteErr := git.GetRemoteURL(ctx, absRoot, RemoteName)
	originalRemotePresent := originalRemoteErr == nil
	restoreRemote := func() {
		if originalRemotePresent {
			_ = git.EnsureRemote(ctx, absRoot, RemoteName, originalRemote)
		} else {
			_ = git.RemoveRemote(ctx, absRoot, RemoteName)
		}
	}
	// Provision (or repair) the on-disk gate. This is idempotent.
	_, bareStatErr := os.Stat(bareDir)
	bareExisted := bareStatErr == nil
	gateBefore := snapshotGate(bareDir)
	if err := provisionGate(ctx, bareDir, absRoot, upstreamURL, p.ReposDir(), existing != nil); err != nil {
		if existing == nil {
			restoreRemote()
			if !bareExisted {
				_ = os.RemoveAll(bareDir)
			}
		} else {
			gateBefore.restore()
			restoreRemote()
		}
		return nil, false, err
	}
	// Detect default branch from upstream remote.
	branch := git.DefaultBranch(ctx, absRoot, "origin")

	if existing != nil {
		var repo *db.Repo
		if forkURL != "" {
			repo, err = d.UpdateRepoMetadataWithFork(existing.ID, redactedUpstreamURL, forkURL, branch)
		} else {
			repo, err = d.UpdateRepoMetadata(existing.ID, redactedUpstreamURL, branch)
		}
		if err != nil {
			gateBefore.restore()
			restoreRemote()
			return nil, false, fmt.Errorf("update repo metadata: %w", err)
		}
		slog.Info("gate refreshed", "repo_id", repo.ID, "path", absRoot)
		return repo, false, nil
	}

	// Insert repo record with deterministic ID.
	repo, err := d.InsertRepoWithIDAndFork(id, absRoot, redactedUpstreamURL, forkURL, branch)
	if err != nil {
		restoreRemote()
		if !bareExisted {
			_ = os.RemoveAll(bareDir)
		}
		return nil, false, fmt.Errorf("insert repo: %w", err)
	}
	slog.Info("gate initialized", "repo_id", id, "path", absRoot, "upstream", redactedUpstreamURL)
	return repo, true, nil
}

func validateForkRouting(ctx context.Context, upstreamURL, forkURL string) error {
	parentProvider := scm.DetectProviderContext(ctx, upstreamURL)
	forkProvider := scm.DetectProviderContext(ctx, forkURL)
	if parentProvider == scm.ProviderGitHub && forkProvider == scm.ProviderGitHub {
		if github.RepoSlug(upstreamURL) == "" || github.RepoSlug(forkURL) == "" {
			return fmt.Errorf("fork URL routing requires GitHub parent and fork remotes with owner/repo paths")
		}
		return nil
	}
	return fmt.Errorf("fork URL routing is currently supported only for GitHub parent and fork remotes (parent provider: %s, fork provider: %s)", parentProvider, forkProvider)
}

// provisionGate creates or repairs the on-disk gate for a repo: the bare repo,
// its push/hook configuration, hook-path isolation, and the git remotes wiring
// the working repo to the gate and the gate to its upstream. Every step is
// idempotent so this doubles as the repair path for re-running init.
func provisionGate(ctx context.Context, bareDir, absRoot, upstreamURL, reposDir string, refresh bool) error {
	// Create the bare repo. git init --bare is a no-op on an existing one.
	if err := git.InitBare(ctx, bareDir); err != nil {
		return fmt.Errorf("create bare repo: %w", err)
	}
	if _, err := git.RunBare(ctx, bareDir, "config", "receive.advertisePushOptions", "true"); err != nil {
		return fmt.Errorf("enable push options: %w", err)
	}

	if err := git.RefreshManagedGateHooks(bareDir); err != nil {
		return fmt.Errorf("install hooks: %w", err)
	}

	// Pin core.hookspath in the bare's per-worktree config so subprocess
	// writes to shared local config (e.g. husky during pnpm install) can't
	// disable the gate hook. See git.IsolateHooksPath for details.
	isolated, err := ensureGateHooksPathIsolation(ctx, bareDir)
	if err != nil {
		return fmt.Errorf("isolate hooks path: %w", err)
	}
	if isolated {
		if err := git.MarkGateConfigCurrent(bareDir); err != nil {
			return fmt.Errorf("stamp gate config: %w", err)
		}
	}

	// Record upstream as origin on the gate repo so gh can resolve repository
	// context from detached worktrees created from the gate.
	if err := git.EnsureRemote(ctx, bareDir, "origin", upstreamURL); err != nil {
		return fmt.Errorf("add gate origin remote: %w", err)
	}

	if err := ensureWorkingRemote(ctx, absRoot, bareDir, reposDir, refresh); err != nil {
		return fmt.Errorf("add remote: %w", err)
	}

	return nil
}

func ensureWorkingRemote(ctx context.Context, absRoot, bareDir, reposDir string, refresh bool) error {
	if refresh {
		return git.EnsureRemote(ctx, absRoot, RemoteName, bareDir)
	}
	existingURL, err := git.GetRemoteURL(ctx, absRoot, RemoteName)
	if err != nil {
		return git.AddRemote(ctx, absRoot, RemoteName, bareDir)
	}
	if existingURL == bareDir {
		return nil
	}
	// A leftover remote pointing into our own repos dir is stale gate wiring
	// (e.g. the working directory was copied, or its gate was half-ejected);
	// repoint it. Anything else is a user-managed remote we must not touch.
	if filepath.Dir(existingURL) == reposDir {
		return git.EnsureRemote(ctx, absRoot, RemoteName, bareDir)
	}
	return fmt.Errorf("remote %q already exists with url %q", RemoteName, existingURL)
}

// reattachRelocatedRepo detects a working directory that was renamed or moved
// after init: it carries a safety-dance remote pointing at a gate in our repos
// dir, but its repo record references the old path. When the old path no
// longer exists, the record is migrated to the new path so the existing gate
// and its run history are reattached. It returns nil when the repo should be
// treated as a fresh init instead: no gate remote, an orphan gate with no
// record, or a copy whose original still exists on disk.
func reattachRelocatedRepo(ctx context.Context, d *db.DB, p *paths.Paths, absRoot string) (*db.Repo, error) {
	remoteURL, err := git.GetRemoteURL(ctx, absRoot, RemoteName)
	if err != nil {
		return nil, nil
	}
	id := strings.TrimSuffix(filepath.Base(remoteURL), ".git")
	if p.RepoDir(id) != remoteURL {
		// Not one of our gate paths; fresh init decides what to do with it.
		return nil, nil
	}
	repo, err := d.GetRepo(id)
	if err != nil {
		return nil, fmt.Errorf("look up relocated repo: %w", err)
	}
	if repo == nil {
		return nil, nil
	}
	if _, err := os.Stat(repo.WorkingPath); err == nil {
		// The recorded checkout still exists, so absRoot is a copy of it, not
		// a move; the copy gets its own gate.
		return nil, nil
	}
	migrated, err := d.UpdateRepoWorkingPath(id, absRoot)
	if err != nil {
		return nil, fmt.Errorf("migrate repo working path: %w", err)
	}
	slog.Info("gate reattached after working dir move", "repo_id", id, "old_path", repo.WorkingPath, "new_path", absRoot)
	return migrated, nil
}

// Eject removes the safety-dance gate from the repo at workDir.
// It removes the remote, deletes the bare repo and worktrees,
// and deletes the repo record from the database.
func Eject(ctx context.Context, d *db.DB, p *paths.Paths, workDir string) (*db.Repo, error) {
	if classified, err := (gatecontext.Inspector{DB: d, Paths: p}).Inspect(ctx, gatecontext.Request{CWD: workDir, MarkerPresent: gatecontext.MarkerPresent()}); err != nil {
		return nil, err
	} else if classified.Nested {
		return nil, fmt.Errorf("%s", gatecontext.RefusalMessage(classified))
	}
	// Normalize worktrees back to the main repo root so eject works no matter
	// which checkout the user runs it from.
	gitRoot, err := git.FindMainRepoRoot(workDir)
	if err != nil {
		return nil, fmt.Errorf("find git root: %w", err)
	}
	absRoot := gitRoot

	// Look up repo in DB.
	repo, err := d.GetRepoByPath(absRoot)
	if err != nil {
		return nil, fmt.Errorf("get repo: %w", err)
	}
	if repo == nil {
		return nil, fmt.Errorf("not initialized for %s", absRoot)
	}

	// Remove remote from working repo (non-fatal).
	_ = git.RemoveRemote(ctx, absRoot, RemoteName)

	// Delete bare repo.
	bareDir := p.RepoDir(repo.ID)
	os.RemoveAll(bareDir)

	// Delete worktrees for this repo. This happens before the repo record is
	// deleted, because in a configured root the run rows are what identify
	// which directories are ours to remove.
	removeRepoWorktrees(d, p, repo)

	// Delete repo record (cascades to runs + steps).
	if err := d.DeleteRepo(repo.ID); err != nil {
		return nil, fmt.Errorf("delete repo record: %w", err)
	}

	slog.Info("gate ejected", "repo_id", repo.ID, "path", absRoot)
	return repo, nil
}

// removeRepoWorktrees deletes the ejected repository's run worktrees.
//
// Under the default placement safety-dance owns <SD_HOME>/worktrees/<repoID>
// outright, so the whole directory goes. Everything a run recorded outside it
// is removed one directory at a time (see worktree_roots and
// internal/worktrees): such a directory sits in a directory of the operator's
// own - it holds the toolchain configuration the runs were placed there to
// inherit - so eject removes exactly what this repository's own run rows
// recorded, and touches nothing else: not the root, not the operator's files,
// and not a neighbouring directory that merely looks like a run. Reading the
// recorded placement rather than deriving it is also what reaches a run left in
// a root the operator has since reconfigured away.
//
// Every one of those directories is swept before any of them is removed - both
// halves, in the one process snapshot that costs (see
// procreap.SweepRunWorktrees). Which half a run landed in says nothing about
// whether it leaked a process that escaped its group, and a default-placement
// directory removed without a sweep leaves that process burning CPU on a deleted
// cwd until some later daemon startup happens to sweep the tree by shape - which
// is the cost this sweep exists to eliminate, not to defer.
//
// The sweep also has to precede the deletion of the repository record: the
// cascade takes the run rows with it, and outside the default tree those rows are
// the only thing that can name the directory. Sweeping afterwards would be
// sweeping a directory nothing knows about.
//
// Failures are logged rather than fatal: an eject that cannot delete a leftover
// worktree must still finish removing the gate.
func removeRepoWorktrees(d *db.DB, p *paths.Paths, repo *db.Repo) {
	defaultDir := filepath.Join(p.WorktreesDir(), repo.ID)

	runs, err := d.GetRunsByRepo(repo.ID)
	if err != nil {
		slog.Warn("failed to list runs while removing worktrees during eject", "repo_id", repo.ID, "error", err)
		os.RemoveAll(defaultDir)
		return
	}
	var recorded []string
	var sweepable []procreap.Worktree
	for _, run := range runs {
		path := worktrees.RecordedDir(p, run.WorktreePath(), repo.ID, run.ID)
		if !worktrees.Contains(defaultDir, path) {
			// Everything in the default tree goes with the directory we own
			// outright, so only the rest is removed one path at a time.
			recorded = append(recorded, path)
		}
		if reachableRunWorktree(path, run.Status) {
			sweepable = append(sweepable, procreap.Worktree{Dir: path, RepoID: repo.ID, RunID: run.ID})
		}
	}
	sweepRunWorktrees(p.WorktreesDir(), sweepable, "eject")

	os.RemoveAll(defaultDir)
	for _, path := range recorded {
		if err := os.RemoveAll(path); err != nil {
			slog.Warn("failed to remove run worktree during eject", "path", path, "error", err)
		}
	}
}

// reachableRunWorktree reports whether a recorded placement can still have
// anything standing in it, which is the same bound daemon startup applies to the
// same set (see leftoverRecordedRunWorktrees and db.ActiveRunWorktreesOutside):
// a directory that is still on disk, or the worktree of a run that never
// reached a terminal state and may therefore have lost its directory while a
// process it leaked kept holding it.
//
// A terminal run whose directory is already gone is not in reach: its removal
// swept it, and eject would otherwise pay a full sweep for every run this
// repository has ever had - run rows are never pruned, so that set grows without
// bound while the work it does is empty.
func reachableRunWorktree(dir string, status types.RunStatus) bool {
	if info, err := os.Stat(dir); err == nil && info.IsDir() {
		return true
	}
	return status == types.RunPending || status == types.RunRunning
}
