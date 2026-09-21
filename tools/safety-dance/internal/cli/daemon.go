package cli

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/agent"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline/steps"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/policy"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/procreap"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/runenv"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/scm/github"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/shellenv"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/worktrees"
	"github.com/spf13/cobra"
)

func newDaemon() *cobra.Command {
	d := &cobra.Command{Use: "daemon", Short: "manage daemon"}
	d.AddCommand(&cobra.Command{Use: "start", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		return startDaemon(cmd, args)
	}})
	d.AddCommand(&cobra.Command{Use: "stop", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		return stopDaemon(cmd, args)
	}})
	d.AddCommand(&cobra.Command{Use: "restart", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		p, err := home()
		if err != nil {
			return err
		}
		service := daemon.Service{Home: p, Binary: "safety-dance", Executor: commandExecutor{}}
		if service.DefinitionExists() {
			return service.Restart()
		}
		if err := stopDaemon(cmd, args); err != nil {
			return err
		}
		return startDaemon(cmd, args)
	}})
	d.AddCommand(&cobra.Command{Use: "status", RunE: func(cmd *cobra.Command, args []string) error {
		var out ipc.HealthResult
		if err := callDaemon(ipc.MethodHealth, ipc.HealthParams{}, &out); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), out.Status)
		return nil
	}})
	d.AddCommand(&cobra.Command{Use: "serve", Hidden: true, RunE: serveDaemon})
	d.AddCommand(newAdmitPush(), newNotifyPush(), newIssuePushToken(), newRevokePushReceipt())
	return d
}

func newIssuePushToken() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "issue-push-token", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		var out ipc.IssuePushTokenResult
		if err := callDaemon(ipc.MethodIssuePushToken, ipc.IssuePushTokenParams{Gate: a.gate, Ref: a.ref, HookCapability: a.hookCapability}, &out); err != nil {
			return err
		}
		_, err := fmt.Fprintln(cmd.OutOrStdout(), out.Token)
		return err
	}}
	c.Flags().StringVar(&a.gate, "gate", "", "gate")
	c.Flags().StringVar(&a.ref, "ref", "", "ref")
	c.Flags().StringVar(&a.hookCapability, "hook-capability", "", "hook capability")
	return c
}

func startDaemon(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	if err := p.EnsureDirs(); err != nil {
		return err
	}
	if err := func() error { var out ipc.HealthResult; return callDaemon(ipc.MethodHealth, ipc.HealthParams{}, &out) }(); err == nil {
		fmt.Fprintln(cmd.OutOrStdout(), "daemon already running")
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	child := exec.Command(exe, "daemon", "serve")
	bootstrap, openErr := os.OpenFile(p.DaemonBootstrapLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if openErr != nil {
		return openErr
	}
	defer bootstrap.Close()
	child.Stdout = bootstrap
	child.Stderr = bootstrap
	child.Env = os.Environ()
	if err := child.Start(); err != nil {
		return err
	}
	if err := writePID(child.Process.Pid); err != nil {
		_ = child.Process.Kill()
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "daemon started (%d)\n", child.Process.Pid)
	if err := waitForDaemon(5 * time.Second); err != nil {
		_ = child.Process.Kill()
		if path, pathErr := pidPath(); pathErr == nil {
			_ = os.Remove(path)
		}
		return fmt.Errorf("daemon failed to become ready: %w", err)
	}
	return nil
}

func waitForDaemon(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var last error
	for time.Now().Before(deadline) {
		var out ipc.HealthResult
		if err := callDaemon(ipc.MethodHealth, ipc.HealthParams{}, &out); err == nil && out.Status == "ok" {
			return nil
		} else if err != nil {
			last = err
		}
		time.Sleep(25 * time.Millisecond)
	}
	if last == nil {
		last = fmt.Errorf("health check timed out")
	}
	return last
}

func stopInstalledService(p *paths.Paths) error {
	service := daemon.Service{Home: p, Binary: "safety-dance", Executor: commandExecutor{}}
	if !service.DefinitionExists() {
		return nil
	}
	return service.Stop()
}
func stopDaemon(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	path := p.PIDFile()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		if err := stopInstalledService(p); err != nil {
			return fmt.Errorf("stop installed daemon service: %w", err)
		}
		fmt.Fprintln(cmd.OutOrStdout(), "daemon stopped")
		return nil
	} else if err != nil {
		return err
	}
	var out ipc.ShutdownResult
	if err := callDaemon(ipc.MethodShutdown, ipc.ShutdownParams{}, &out); err != nil {
		return fmt.Errorf("authenticated daemon shutdown failed: %w", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var health ipc.HealthResult
		if err := callDaemon(ipc.MethodHealth, ipc.HealthParams{}, &health); err != nil {
			if err := stopInstalledService(p); err != nil {
				return fmt.Errorf("stop installed daemon service: %w", err)
			}
			_ = os.Remove(path)
			fmt.Fprintln(cmd.OutOrStdout(), "daemon stopped")
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	return fmt.Errorf("daemon did not stop within timeout")
}

func serveDaemon(cmd *cobra.Command, args []string) error {
	p, d, err := openRuntime()
	if err != nil {
		return err
	}
	defer d.Close()
	if err := p.EnsureDirs(); err != nil {
		return err
	}
	logFile, logErr := os.OpenFile(p.DaemonLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if logErr != nil {
		return logErr
	}
	defer logFile.Close()
	_, _ = fmt.Fprintf(logFile, "daemon starting pid=%d\n", os.Getpid())
	defer func() { _, _ = fmt.Fprintf(logFile, "daemon stopping pid=%d\n", os.Getpid()) }()
	own, err := daemon.AcquireOwnership(p)
	if err != nil {
		return err
	}
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, terminationSignal(), os.Interrupt)
	defer own.Close()
	defer os.Remove(p.PIDFile())
	server := ipc.NewServer()
	manager := daemon.NewManager(d, func(ctx context.Context, r *db.Run) {
		err := executeRun(ctx, d, p, r)
		cleanup := false
		journalCleanup := func() error {
			if r.WorktreeDir == nil {
				return nil
			}
			repo, repoErr := d.GetRepo(r.RepoID)
			if repoErr != nil {
				return repoErr
			}
			if repo == nil {
				return fmt.Errorf("repository %s not found", r.RepoID)
			}
			source, sourceErr := worktrees.SourceFor(context.Background(), []string{p.RepoDir(repo.ID), repo.WorkingPath}, *r.WorktreeDir)
			if sourceErr != nil {
				return sourceErr
			}
			return worktrees.JournalRemoval(source, *r.WorktreeDir)
		}
		if err != nil {
			// A remote write may have succeeded while mirror or binding failed.
			// Keep publication ownership and the worktree recoverable in that
			// state instead of terminalizing and deleting its evidence.
			if current, currentErr := d.GetRun(r.ID); currentErr == nil && current != nil && current.PushActive {
				fmt.Fprintf(os.Stderr, "safety-dance: publication recovery pending for %s: %v\n", r.ID, err)
				return
			}
			status := types.RunFailed
			if ctx.Err() != nil {
				status = types.RunCancelled
			}
			if skipRunCleanup() {
				if statusErr := d.UpdateRunErrorStatus(r.ID, err.Error(), status); statusErr != nil {
					fmt.Fprintf(os.Stderr, "safety-dance: fail run %s: %v\n", r.ID, statusErr)
				}
				return
			}
			if journalErr := journalCleanup(); journalErr != nil {
				fmt.Fprintf(os.Stderr, "safety-dance: journal worktree cleanup for %s: %v\n", r.ID, journalErr)
				return
			}
			if statusErr := d.UpdateRunErrorStatus(r.ID, err.Error(), status); statusErr == nil {
				cleanup = true
			}
		} else {
			if r.Status == types.RunCancelled && r.PushActive {
				cleanup = true
			} else if skipRunCleanup() {
				if statusErr := d.TransitionRunStatus(r.ID, types.RunRunning, types.RunCompleted); statusErr != nil {
					fmt.Fprintf(os.Stderr, "safety-dance: complete run %s: %v\n", r.ID, statusErr)
				}
			} else {
				// Persist cleanup intent before making the run terminal.
				if journalErr := journalCleanup(); journalErr != nil {
					fmt.Fprintf(os.Stderr, "safety-dance: journal worktree cleanup for %s: %v\n", r.ID, journalErr)
					return
				}
				if statusErr := d.TransitionRunStatus(r.ID, types.RunRunning, types.RunCompleted); statusErr == nil {
					cleanup = true
				}
			}
		}
		if !cleanup {
			return
		}
		current, statusErr := d.GetRun(r.ID)
		if statusErr != nil || current == nil || !current.Status.Terminal() || current.WorktreeDir == nil {
			return
		}
		if repo, e := d.GetRepo(r.RepoID); e == nil && repo != nil {
			source, sourceErr := worktrees.SourceFor(context.Background(), []string{p.RepoDir(repo.ID), repo.WorkingPath}, *current.WorktreeDir)
			if sourceErr != nil {
				fmt.Fprintf(os.Stderr, "safety-dance: worktree source lookup for %s: %v\n", r.ID, sourceErr)
				return
			}
			procreap.SweepRunWorktree(p.WorktreesDir(), r.RepoID, r.ID, *current.WorktreeDir, "run cleanup")
			if removeErr := worktrees.RemoveDetached(context.Background(), source, *current.WorktreeDir); removeErr != nil {
				fmt.Fprintf(os.Stderr, "safety-dance: worktree cleanup pending for %s: %v\n", r.ID, removeErr)
			}
		}
	})
	manager.SetRecoveryReaper(func(r *db.Run) error {
		if r.WorktreeDir == nil {
			return nil
		}
		return procreap.SweepRunWorktreeStrict(p.WorktreesDir(), r.RepoID, r.ID, *r.WorktreeDir, "daemon restart recovery")
	})
	adm := daemon.NewAdmissionWithStore(server, func(ctx context.Context, n daemon.PushNotification) error {
		return recordPush(d, p, manager, n)
	}, filepath.Join(p.Root(), "admission-receipts.json"))
	adm.DeferNotifications()
	if err := adm.InitError(); err != nil {
		return fmt.Errorf("load admission receipts: %w", err)
	}
	gatePaths := make([]string, 0)
	if repositories, reposErr := d.GetRepos(); reposErr != nil {
		return fmt.Errorf("load repositories for receipt recovery: %w", reposErr)
	} else {
		for _, repository := range repositories {
			gatePaths = append(gatePaths, p.RepoDir(repository.ID))
		}
	}
	if err := adm.ImportGateReceipts(context.Background(), gatePaths); err != nil {
		return fmt.Errorf("import gate receipts: %w", err)
	}
	shutdown := make(chan struct{})
	server.Handle(ipc.MethodShutdown, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		if err := daemon.AuthorizeMutationPeer(ipc.PeerPID(ctx)); err != nil {
			return nil, err
		}
		select {
		case shutdown <- struct{}{}:
		default:
		}
		return ipc.ShutdownResult{OK: true}, nil
	})
	server.Handle(ipc.MethodHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return ipc.HealthResult{Status: "ok"}, nil
	})
	server.Handle(ipc.MethodStartFreshRun, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		if err := daemon.AuthorizeMutationPeer(ipc.PeerPID(ctx)); err != nil {
			return nil, err
		}
		var q ipc.StartFreshRunParams
		if err := json.Unmarshal(raw, &q); err != nil {
			return nil, err
		}
		repo, err := d.GetRepo(q.RepoID)
		if err != nil {
			return nil, err
		}
		if repo == nil {
			return nil, fmt.Errorf("repository %s not found", q.RepoID)
		}
		nonceBytes := make([]byte, 16)
		if _, err := rand.Read(nonceBytes); err != nil {
			return nil, err
		}
		nonce := hex.EncodeToString(nonceBytes)
		globalConfig, err := config.LoadGlobal(p.ConfigFile())
		if err != nil {
			return nil, fmt.Errorf("load global configuration: %w", err)
		}
		layout := worktrees.New(p, globalConfig.WorktreeRoots)
		if err := layout.ValidateCheckout(repo.WorkingPath); err != nil {
			return nil, err
		}
		branchRef := canonicalRef(q.Branch)
		verifiedHead, verifyErr := git.RunBare(ctx, p.RepoDir(repo.ID), "rev-parse", "--verify", branchRef+"^{commit}")
		if verifyErr != nil || strings.TrimSpace(verifiedHead) != strings.TrimSpace(q.HeadSHA) {
			return nil, fmt.Errorf("requested head %s is not the authenticated gate head for %s", q.HeadSHA, branchRef)
		}
		worktree := layout.Dir(q.RepoID, repo.WorkingPath, nonce)
		if err := worktrees.CreateDetached(ctx, repo.WorkingPath, worktree, q.HeadSHA); err != nil {
			return nil, err
		}
		accepted := db.AcceptedRef{RepoID: q.RepoID, Branch: canonicalRef(q.Branch), GateHead: q.HeadSHA, LaunchNonce: nonce}
		var validationGeneration string
		gatesJSON, gatesErr := pinGatesForAdmission(ctx, p, repo, worktree, nonce, &validationGeneration)
		if gatesErr != nil {
			return nil, gatesErr
		}
		accepted.GatesJSON = gatesJSON
		accepted.ValidationGeneration = validationGeneration
		r, err := manager.ReplaceValidated(ctx, daemon.BranchKey{RepositoryID: q.RepoID, Ref: accepted.Branch}, accepted, worktree, func() error {
			current, err := git.RunBare(ctx, p.RepoDir(repo.ID), "rev-parse", "--verify", branchRef+"^{commit}")
			if err != nil || strings.TrimSpace(current) != strings.TrimSpace(q.HeadSHA) {
				return fmt.Errorf("requested head %s is no longer the authenticated gate head for %s", q.HeadSHA, branchRef)
			}
			return nil
		})
		if err != nil {
			return nil, err
		}
		if err := worktrees.CommitOwnership(worktree); err != nil {
			return nil, err
		}
		return ipc.StartFreshRunResult{Receipt: ipc.LaunchReceipt{RunID: r.ID, Branch: r.Branch, HeadSHA: r.HeadSHA, SubmittedHeadSHA: r.HeadSHA, Disposition: "created"}}, nil
	})
	server.Handle(ipc.MethodRespond, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		if err := daemon.AuthorizeMutationPeer(ipc.PeerPID(ctx)); err != nil {
			return nil, err
		}
		var q ipc.RespondParams
		if err := json.Unmarshal(raw, &q); err != nil {
			return nil, err
		}
		if q.RunID == "" || q.Step == "" || q.StepID == "" || q.Generation <= 0 || q.Action == "" {
			return nil, fmt.Errorf("run, step, step id, generation, and action are required")
		}
		if !types.ResponseAllowed(q.Step, q.Action) {
			return nil, fmt.Errorf("response %s is not allowed for step %s", q.Action, q.Step)
		}
		if q.Action != types.ActionApprove && q.Action != types.ActionFix && q.Action != types.ActionSkip && q.Action != types.ActionAbort {
			return nil, fmt.Errorf("unsupported response action %q", q.Action)
		}
		r, err := d.GetRun(q.RunID)
		if err != nil {
			return nil, err
		}
		if r == nil {
			return nil, fmt.Errorf("run %s not found", q.RunID)
		}
		steps, err := d.GetStepsByRun(q.RunID)
		if err != nil {
			return nil, err
		}
		waitingStepID := ""
		for _, step := range steps {
			if step.StepName == q.Step && (step.Status == types.StepStatusAwaitingApproval || step.Status == types.StepStatusFixReview) {
				waitingStepID = step.ID
				if step.ID != q.StepID || step.PromptGeneration != q.Generation {
					return nil, fmt.Errorf("response prompt identity is stale")
				}
				break
			}
		}
		if waitingStepID == "" {
			return nil, fmt.Errorf("run %s is not awaiting a response for %s", q.RunID, q.Step)
		}
		if err := d.RecordResponse(db.Response{RunID: q.RunID, Step: string(q.Step), StepID: q.StepID, Generation: q.Generation, Action: string(q.Action), Payload: q}); err != nil {
			return nil, err
		}
		return ipc.RespondResult{OK: true}, nil
	})
	server.Handle(ipc.MethodCancelRun, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		if err := daemon.AuthorizeMutationPeer(ipc.PeerPID(ctx)); err != nil {
			return nil, err
		}
		var q ipc.CancelRunParams
		if err := json.Unmarshal(raw, &q); err != nil {
			return nil, err
		}
		run, err := d.GetRun(q.RunID)
		if err != nil {
			return nil, err
		}
		if run == nil {
			return nil, fmt.Errorf("run %s not found", q.RunID)
		}
		if err := d.CancelRun(q.RunID, "cancelled"); err != nil {
			return nil, err
		}
		active := manager.Active(daemon.BranchKey{RepositoryID: run.RepoID, Ref: run.Branch})
		if active != nil && active.Run != nil && active.Run.ID == run.ID {
			active.Cancel()
			active.Wait()
		}
		return ipc.CancelRunResult{OK: true}, nil
	})
	protected := []string{}
	if owned, err := d.ActiveRunWorktrees(); err == nil {
		for _, worktree := range owned {
			if worktree.Dir != "" {
				protected = append(protected, worktree.Dir)
			}
		}
	} else {
		return fmt.Errorf("find owned worktrees: %w", err)
	}
	globalConfig, err := config.LoadGlobal(p.ConfigFile())
	if err != nil {
		return fmt.Errorf("load global configuration for worktree recovery: %w", err)
	}
	roots := []string{filepath.Join(p.Root(), "worktrees")}
	for _, root := range globalConfig.WorktreeRoots {
		root = filepath.Clean(root)
		seen := false
		for _, existing := range roots {
			if existing == root {
				seen = true
				break
			}
		}
		if !seen {
			roots = append(roots, root)
		}
	}
	if outside, outsideErr := d.RunWorktreesOutside(filepath.Join(p.Root(), "worktrees")); outsideErr == nil {
		for _, placement := range outside {
			root := filepath.Dir(worktrees.JournalRootFor(placement.Dir))
			seen := false
			for _, existing := range roots {
				if existing == root {
					seen = true
					break
				}
			}
			if !seen {
				roots = append(roots, root)
			}
		}
	} else {
		return fmt.Errorf("find worktree journals outside configured roots: %w", outsideErr)
	}
	for _, root := range roots {
		if _, statErr := os.Stat(root); os.IsNotExist(statErr) {
			continue
		} else if statErr != nil {
			return statErr
		}
		if err := worktrees.RecoverPending(context.Background(), root, protected...); err != nil {
			return fmt.Errorf("recover pending worktrees: %w", err)
		}
		if err := worktrees.RecoverRemoving(context.Background(), root, protected...); err != nil {
			return fmt.Errorf("recover removing worktrees: %w", err)
		}
	}
	if err := manager.Recover(context.Background()); err != nil {
		return err
	}
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			if err := adm.ReconcileOnce(context.Background()); err != nil {
				_, _ = fmt.Fprintf(logFile, "reconcile admission: %v\n", err)
			}
			<-ticker.C
		}
	}()
	if err := server.Listen(p.Socket()); err != nil {
		return err
	}
	go server.ServeReady()
	select {
	case <-sig:
	case <-shutdown:
	}
	manager.Shutdown()
	server.Close()
	server.CloseListener()
	return nil
}

func pinGatesForAdmission(ctx context.Context, p *paths.Paths, repo *db.Repo, worktree, nonce string, generation *string) (string, error) {
	pushed, err := config.LoadRepo(worktree)
	if err != nil {
		return "", fmt.Errorf("load pushed repository configuration: %w", err)
	}
	trusted := &config.RepoConfig{}
	gateRepo := p.RepoDir(repo.ID)
	ref := "refs/safety-dance/trusted/admission-" + nonce
	if _, err := git.Run(ctx, gateRepo, "fetch", "--no-tags", repo.UpstreamURL, "refs/heads/"+repo.DefaultBranch+":"+ref); err != nil {
		return "", fmt.Errorf("fetch trusted configuration: %w", err)
	}
	defer func() { _, _ = git.Run(ctx, gateRepo, "update-ref", "-d", ref) }()
	trustedRevision, err := git.Run(ctx, gateRepo, "rev-parse", ref)
	if err != nil {
		return "", fmt.Errorf("resolve trusted policy revision: %w", err)
	}
	if generation != nil {
		*generation = strings.TrimSpace(trustedRevision)
	}
	entries, err := git.Run(ctx, gateRepo, "ls-tree", "-r", "--name-only", ref, "--", ".safety-dance.yaml")
	if err != nil {
		return "", fmt.Errorf("inspect trusted configuration: %w", err)
	}
	if strings.TrimSpace(entries) != "" {
		raw, err := git.ShowFile(ctx, gateRepo, ref, ".safety-dance.yaml")
		if err != nil {
			return "", fmt.Errorf("read trusted repository configuration: %w", err)
		}
		trusted, err = config.LoadRepoFromBytes([]byte(raw))
		if err != nil {
			return "", fmt.Errorf("load trusted repository configuration: %w", err)
		}
	}
	trusted, err = policy.Resolve(p, repo.ID, strings.TrimSpace(trustedRevision), func() *config.RepoConfig {
		if strings.TrimSpace(entries) != "" {
			return trusted
		}
		return nil
	}())
	if err != nil {
		return "", err
	}
	effective := config.EffectiveRepoConfig(pushed, trusted, trusted.AllowRepoCommands)
	global, err := config.LoadGlobal(p.ConfigFile())
	if err != nil {
		return "", fmt.Errorf("load global configuration: %w", err)
	}
	merged := config.Merge(global, effective)
	return config.MarshalGates(merged.Gates)
}

func recordPush(d *db.DB, p *paths.Paths, manager *daemon.Manager, n daemon.PushNotification) error {
	repos, err := d.GetRepos()
	if err != nil {
		return err
	}
	gatePath, err := filepath.Abs(n.Gate)
	if err != nil {
		return err
	}
	if resolved, resolveErr := filepath.EvalSymlinks(gatePath); resolveErr == nil {
		gatePath = resolved
	}
	for _, r := range repos {
		expected, expectedErr := filepath.Abs(p.RepoDir(r.ID))
		if expectedErr != nil {
			continue
		}
		if resolved, resolveErr := filepath.EvalSymlinks(expected); resolveErr == nil {
			expected = resolved
		}
		if filepath.Clean(expected) != filepath.Clean(gatePath) {
			continue
		}
		// Keep the canonical full ref as the coordination identity. A branch
		// and tag can legally share the same short spelling.
		branch := n.Ref
		current, currentErr := git.RunBare(context.Background(), gatePath, "rev-parse", n.Ref)
		if currentErr == nil && strings.TrimSpace(current) != strings.TrimSpace(n.New) {
			// A delayed notification for an older accepted update must not replace
			// the run already admitted for the current ref.
			return nil
		}
		nonce := n.Token
		if nonce == "" {
			return fmt.Errorf("accepted push has no durable identity")
		}
		if existing, err := d.GetRunByLaunchNonce(r.ID, branch, nonce); err != nil {
			return err
		} else if existing != nil {
			if existing.Status.Terminal() {
				return nil
			}
			if manager.Active(daemon.BranchKey{RepositoryID: r.ID, Ref: branch}) == nil {
				if err := manager.Resume(context.Background(), existing); err != nil {
					return err
				}
			}
			return nil
		}
		globalConfig, err := config.LoadGlobal(p.ConfigFile())
		if err != nil {
			return fmt.Errorf("load global configuration: %w", err)
		}
		layout := worktrees.New(p, globalConfig.WorktreeRoots)
		if err := layout.ValidateCheckout(r.WorkingPath); err != nil {
			return err
		}
		worktree := layout.Dir(r.ID, r.WorkingPath, nonce)
		source := r.WorkingPath
		if _, checkoutErr := git.Run(context.Background(), r.WorkingPath, "cat-file", "-e", n.New+"^{commit}"); checkoutErr != nil {
			source = gatePath
		}
		if err := worktrees.CreateDetached(context.Background(), source, worktree, n.New); err != nil {
			return fmt.Errorf("create accepted-head worktree: %w", err)
		}
		var validationGeneration string
		accepted := db.AcceptedRef{RepoID: r.ID, Branch: branch, GateHead: n.New, PreviousReconciledHead: n.Old, LaunchNonce: nonce, ValidationGeneration: n.ValidationGeneration, RequestedOptions: append([]string(nil), n.Options...)}
		gatesJSON, gatesErr := pinGatesForAdmission(context.Background(), p, r, worktree, nonce, &validationGeneration)
		if gatesErr != nil {
			return gatesErr
		}
		accepted.GatesJSON = gatesJSON
		if accepted.ValidationGeneration == "" {
			accepted.ValidationGeneration = validationGeneration
		}
		if _, err = manager.ReplaceValidated(context.Background(), daemon.BranchKey{RepositoryID: r.ID, Ref: branch}, accepted, worktree, func() error {
			current, err := git.RunBare(context.Background(), gatePath, "rev-parse", "--verify", branch+"^{commit}")
			if err != nil || strings.TrimSpace(current) != strings.TrimSpace(n.New) {
				return fmt.Errorf("accepted push head %s was superseded before run creation", n.New)
			}
			return nil
		}); err != nil {
			return err
		}
		return worktrees.CommitOwnership(worktree)
	}
	return fmt.Errorf("unknown gate %q", n.Gate)
}

func canonicalRef(ref string) string {
	ref = strings.TrimSpace(ref)
	if strings.HasPrefix(ref, "refs/") {
		return ref
	}
	return "refs/heads/" + ref
}

func normalizeSHA(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.Trim(value, "0") == "" {
		return ""
	}
	return value
}

func livePublicationHead(ctx context.Context, remote, ref string) string {
	head, _, err := queryPublicationHead(ctx, remote, ref)
	if err != nil {
		return ""
	}
	return head
}

// queryPublicationHead distinguishes an absent remote ref from a failed
// lookup. An absent branch is a valid zero-base publication state.
func queryPublicationHead(ctx context.Context, remote, ref string) (string, bool, error) {
	out, err := exec.CommandContext(ctx, "git", "ls-remote", remote, ref).Output()
	if err != nil {
		return "", false, err
	}
	fields := strings.Fields(string(out))
	if len(fields) == 0 {
		return "", false, nil
	}
	return normalizeSHA(fields[0]), true, nil
}

func mirrorPublication(ctx context.Context, p *paths.Paths, repoID, ref, candidate, submitted string) error {
	gate := p.RepoDir(repoID)
	current, exists, err := git.DirectRefTarget(ctx, gate, ref)
	if err != nil {
		return err
	}
	if exists && normalizeSHA(current) == normalizeSHA(candidate) {
		return nil
	}
	if !exists {
		submitted = strings.Repeat("0", len(candidate))
	}
	_, err = git.RunBare(ctx, gate, "update-ref", "--no-deref", ref, candidate, submitted)
	return err
}

func newSCMHost(ctx context.Context, upstream, fork, worktree string) (scm.Host, error) {
	provider := scm.DetectProvider(upstream)
	if provider != scm.ProviderGitHub {
		return nil, fmt.Errorf("SCM provider %s is not supported by this build; refusing to start a publish pipeline", provider)
	}
	factory := func(commandCtx context.Context, name string, args ...string) *exec.Cmd {
		command := exec.CommandContext(commandCtx, name, args...)
		command.Dir = worktree
		return command
	}
	host := scm.ResolveHost(ctx, upstream)
	if host == "" {
		return nil, fmt.Errorf("cannot resolve GitHub host from upstream remote")
	}
	repoSlug := github.HostPrefixedSlugForHost(upstream, host)
	if strings.TrimSpace(fork) != "" {
		return github.NewWithFork(factory, func() bool { _, err := exec.LookPath("gh"); return err == nil }, host, repoSlug, github.RepoSlug(fork), false), nil
	}
	return github.New(factory, func() bool { _, err := exec.LookPath("gh"); return err == nil }, host, repoSlug), nil
}

func recoverCancelledPublication(database *db.DB, p *paths.Paths, repo *db.Repo, run *db.Run, worktree string) error {
	if run.ReviewApprovedHeadSHA == nil || strings.TrimSpace(*run.ReviewApprovedHeadSHA) == "" {
		return fmt.Errorf("cancelled run %s has no reviewed publication head", run.ID)
	}
	ref := run.Branch
	if !strings.HasPrefix(ref, "refs/") {
		ref = "refs/heads/" + ref
	}
	verified := livePublicationHead(context.Background(), repo.PushURL(), ref)
	if verified != normalizeSHA(*run.ReviewApprovedHeadSHA) {
		return fmt.Errorf("cancelled run %s was not published; remote remains at %s", run.ID, verified)
	}
	recoveryCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	submitted := ""
	if run.SubmittedHeadSHA != nil {
		submitted = strings.TrimSpace(*run.SubmittedHeadSHA)
	}
	if submitted == "" {
		return fmt.Errorf("cancelled run %s has no submitted head custody", run.ID)
	}
	_, err := steps.Publish(recoveryCtx, database, run.ID, steps.PushRequest{
		Worktree: worktree, Remote: repo.PushURL(), Ref: ref,
		Candidate: *run.ReviewApprovedHeadSHA, ReviewedHead: *run.ReviewApprovedHeadSHA,
		VerifiedHead: verified, Rewrite: false,
	}, func(ctx context.Context, candidate string) error {
		return mirrorPublication(ctx, p, run.RepoID, ref, candidate, submitted)
	})
	return err
}

const evidenceRootMarker = ".safety-dance-evidence-root"
const evidenceRunMarker = ".safety-dance-run"

func prepareEvidenceStorage(p *paths.Paths, runID string, settings config.Evidence) error {
	root := p.EvidenceRoot(settings.LocalRoot)
	if err := p.ValidateEvidenceRoot(settings.LocalRoot); err != nil {
		return err
	}
	if err := os.MkdirAll(root, 0o700); err != nil {
		return err
	}
	marker := filepath.Join(root, evidenceRootMarker)
	if raw, err := os.ReadFile(marker); err == nil && string(raw) != "safety-dance\n" {
		return fmt.Errorf("evidence root %q is not owned by Safety Dance", root)
	} else if os.IsNotExist(err) {
		if err := os.WriteFile(marker, []byte("safety-dance\n"), 0o600); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	runDir := filepath.Join(root, runID)
	if err := os.MkdirAll(runDir, 0o700); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(runDir, evidenceRunMarker), []byte(runID+"\n"), 0o600); err != nil {
		return err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	type directory struct {
		name     string
		modified time.Time
	}
	var dirs []directory
	now := time.Now()
	for _, entry := range entries {
		if !entry.IsDir() || entry.Name() == runID {
			continue
		}
		entryDir := filepath.Join(root, entry.Name())
		if raw, markerErr := os.ReadFile(filepath.Join(entryDir, evidenceRunMarker)); markerErr != nil || strings.TrimSpace(string(raw)) != entry.Name() {
			continue
		}
		info, infoErr := entry.Info()
		if infoErr != nil {
			continue
		}
		if settings.Retention > 0 && now.Sub(info.ModTime()) > settings.Retention {
			_ = os.RemoveAll(entryDir)
			continue
		}
		dirs = append(dirs, directory{entry.Name(), info.ModTime()})
	}
	if settings.MaxRuns > 0 && len(dirs) > settings.MaxRuns {
		sort.Slice(dirs, func(i, j int) bool { return dirs[i].modified.Before(dirs[j].modified) })
		for _, old := range dirs[:len(dirs)-settings.MaxRuns] {
			if old.name != runID {
				_ = os.RemoveAll(filepath.Join(root, old.name))
			}
		}
	}
	return nil
}
func executeRun(ctx context.Context, database *db.DB, p *paths.Paths, run *db.Run) error {
	repo, err := database.GetRepo(run.RepoID)
	if err != nil {
		return err
	}
	if repo == nil || repo.PushURL() == "" {
		return fmt.Errorf("repository %s has no publication remote", run.RepoID)
	}
	if run.WorktreeDir == nil || *run.WorktreeDir == "" {
		return fmt.Errorf("run %s has no owned worktree", run.ID)
	}
	worktree := *run.WorktreeDir
	if err := os.MkdirAll(p.RunLogDir(run.ID), 0o700); err != nil {
		return fmt.Errorf("create run log directory: %w", err)
	}
	runLogPath := filepath.Join(p.RunLogDir(run.ID), "run.log")
	logFile, logErr := os.OpenFile(runLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if logErr != nil {
		return fmt.Errorf("open run log: %w", logErr)
	}
	gateRepo := p.RepoDir(repo.ID)
	defer logFile.Close()
	_, _ = fmt.Fprintf(logFile, "run %s started for %s\n", run.ID, run.Branch)
	defer func() { _, _ = fmt.Fprintf(logFile, "run %s finished\n", run.ID) }()
	source, sourceErr := worktrees.SourceFor(ctx, []string{p.RepoDir(repo.ID), repo.WorkingPath}, worktree)
	if sourceErr != nil {
		if !skipRunCleanup() {
			return sourceErr
		}
		source = p.RepoDir(repo.ID)
	}
	if err := worktrees.RecoverDetached(ctx, source, worktree, run.HeadSHA); err != nil {
		return err
	}
	if _, err := os.Stat(worktree); err != nil {
		return fmt.Errorf("owned worktree unavailable: %w", err)
	}
	if run.Status == types.RunCancelled && run.PushActive {
		return recoverCancelledPublication(database, p, repo, run, worktree)
	}
	pushedConfig, err := config.LoadRepo(worktree)
	if err != nil {
		return fmt.Errorf("load pushed repository configuration: %w", err)
	}
	trustedConfig := &config.RepoConfig{}
	trustedRef := "refs/safety-dance/trusted/" + run.ID
	if _, err := git.Run(ctx, gateRepo, "fetch", "--no-tags", repo.UpstreamURL, "refs/heads/"+repo.DefaultBranch+":"+trustedRef); err != nil {
		return fmt.Errorf("fetch trusted configuration: %w", err)
	}
	defer func() { _, _ = git.Run(ctx, gateRepo, "update-ref", "-d", trustedRef) }()
	trustedRevision, err := git.Run(ctx, gateRepo, "rev-parse", trustedRef)
	if err != nil {
		return fmt.Errorf("resolve trusted policy revision: %w", err)
	}
	if run.LaunchValidationGeneration != nil && strings.TrimSpace(*run.LaunchValidationGeneration) != "" && strings.TrimSpace(*run.LaunchValidationGeneration) != strings.TrimSpace(trustedRevision) {
		return fmt.Errorf("trusted policy changed after admission: expected %s, got %s", *run.LaunchValidationGeneration, strings.TrimSpace(trustedRevision))
	}
	entries, err := git.Run(ctx, gateRepo, "ls-tree", "-r", "--name-only", trustedRef, "--", ".safety-dance.yaml")
	if err != nil {
		return fmt.Errorf("inspect trusted configuration: %w", err)
	}
	if strings.TrimSpace(entries) != "" {
		raw, showErr := git.ShowFile(ctx, gateRepo, trustedRef, ".safety-dance.yaml")
		if showErr != nil {
			return fmt.Errorf("read trusted repository configuration: %w", showErr)
		}
		trustedConfig, err = config.LoadRepoFromBytes([]byte(raw))
		if err != nil {
			return fmt.Errorf("load trusted repository configuration: %w", err)
		}
	}
	trustedConfig, err = policy.Resolve(p, repo.ID, strings.TrimSpace(trustedRevision), func() *config.RepoConfig {
		if strings.TrimSpace(entries) != "" {
			return trustedConfig
		}
		return nil
	}())
	if err != nil {
		return err
	}
	effectiveConfig := config.EffectiveRepoConfig(pushedConfig, trustedConfig, trustedConfig.AllowRepoCommands)
	globalConfig, globalErr := config.LoadGlobal(p.ConfigFile())
	if globalErr != nil {
		return fmt.Errorf("load global configuration: %w", globalErr)
	}
	mergedConfig := config.Merge(globalConfig, effectiveConfig)
	if err := prepareEvidenceStorage(p, run.ID, mergedConfig.Test.Evidence); err != nil {
		return fmt.Errorf("prepare run evidence storage: %w", err)
	}
	evidenceDir := p.RunEvidenceDir(mergedConfig.Test.Evidence.LocalRoot, run.ID)
	if err := mergedConfig.ResolveAgent(ctx, exec.LookPath); err != nil {
		return fmt.Errorf("resolve validation agent: %w", err)
	}
	gatePayload, gateErr := database.GetRunGates(run.ID)
	if gateErr != nil {
		return gateErr
	}
	if strings.TrimSpace(gatePayload) == "" {
		return fmt.Errorf("run %s has no pinned gate policy", run.ID)
	}
	gates, gateErr := config.ParseGates(gatePayload)
	if gateErr != nil {
		return fmt.Errorf("load pinned gates: %w", gateErr)
	}
	gateByStep := make(map[pipeline.StepName]config.Gate, len(gates))
	order := make([]pipeline.StepName, 0, len(pipeline.CoreSteps)+len(gates))
	for _, core := range pipeline.CoreSteps {
		order = append(order, core)
		for _, gate := range gates {
			if pipeline.StepName(gate.After) == core {
				step := pipeline.StepName(gate.StepName())
				order = append(order, step)
				gateByStep[step] = gate
			}
		}
	}
	ref := run.Branch
	if !strings.HasPrefix(ref, "refs/") {
		ref = "refs/heads/" + ref
	}
	verifiedHead, verifiedExists, verifiedErr := queryPublicationHead(ctx, repo.PushURL(), ref)
	if verifiedErr != nil {
		return fmt.Errorf("resolve upstream publication head: %w", verifiedErr)
	}
	if !verifiedExists {
		verifiedHead = ""
	}
	scmHost, err := newSCMHost(ctx, repo.UpstreamURL, repo.ForkURL, worktree)
	if err != nil {
		return err
	}
	var request steps.PushRequest
	request = steps.PushRequest{Worktree: worktree, Remote: repo.PushURL(), Ref: ref, Candidate: run.HeadSHA, VerifiedHead: verifiedHead, BeforePush: func(req *steps.PushRequest) error {
		current, checkErr := database.GetRun(run.ID)
		if checkErr != nil {
			return checkErr
		}
		if current == nil || current.Status == types.RunFailed || (current.Status == types.RunCancelled && !current.PushActive) {
			return fmt.Errorf("run %s was superseded before publication", run.ID)
		}
		candidate, headErr := git.Run(context.Background(), worktree, "rev-parse", "HEAD")
		if headErr != nil {
			return headErr
		}
		if verifiedHead != "" && strings.TrimSpace(candidate) != verifiedHead {
			_, mergeErr := git.Run(context.Background(), worktree, "merge-base", "--is-ancestor", verifiedHead, strings.TrimSpace(candidate))
			req.Rewrite = mergeErr != nil
		}
		return nil
	}}
	runner := pipeline.NewDurable(database, run.ID)
	runner.SetOrder(order)
	runner.SetInteractive(true)
	for gateStep, gate := range gateByStep {
		gateStep, gate := gateStep, gate
		checkpoint := func() (string, error) {
			head, headErr := git.Run(context.Background(), worktree, "rev-parse", "HEAD")
			if headErr != nil {
				return "", headErr
			}
			return strings.TrimSpace(head), nil
		}
		runner.RegisterWithInputsAndCheckpoint(gateStep, pipeline.StepInputs{Command: gate.Command, Owner: "gate." + string(gateStep)}, func(stepCtx context.Context) error {
			name, args := "sh", []string{"-c", gate.Command}
			if runtime.GOOS == "windows" {
				name, args = "cmd.exe", []string{"/D", "/S", "/C", gate.Command}
			}
			command := exec.CommandContext(stepCtx, name, args...)
			command.Dir = worktree
			command.Env = agent.SafeEnvironment(worktree, runenv.Overlay{}, []string{"SD_PARENT_RUN_ID=" + run.ID})
			shellenv.ConfigureShellCommand(command)
			if output, commandErr := shellenv.CombinedOutputShellCommand(command); commandErr != nil {
				return fmt.Errorf("custom gate %s: %s: %w", gate.Name, strings.TrimSpace(string(output)), commandErr)
			}
			return nil
		}, checkpoint)
	}
	for _, name := range pipeline.CoreSteps {
		name := name
		checkpoint := func() (string, error) {
			head, headErr := git.Run(context.Background(), worktree, "rev-parse", "HEAD")
			if headErr != nil {
				return "", headErr
			}
			return strings.TrimSpace(head), nil
		}
		runner.RegisterWithInputsAndCheckpoint(name, pipeline.StepInputs{CandidateHead: run.BaseSHA, Policy: mergedConfig.TrustedConfigSHA + "\x00" + string(mergedConfig.ReplayGlobalYAML) + "\x00" + string(mergedConfig.ReplayRepoYAML), Command: fmt.Sprintf("%#v", mergedConfig.Commands), Owner: "pipeline." + string(name), ValidationGeneration: valueOrEmpty(run.LaunchValidationGeneration)}, func(stepCtx context.Context) error {
			stepCtx = steps.WithWorktree(stepCtx, worktree)
			stepCtx = steps.WithConfig(stepCtx, mergedConfig)
			stepCtx = steps.WithRun(stepCtx, database, run.ID)
			stepCtx = steps.WithSCM(stepCtx, scmHost)
			stepCtx = steps.WithEvidenceDir(stepCtx, evidenceDir)
			var stepErr error
			switch name {
			case pipeline.StepIntent:
				stepErr = steps.Intent(stepCtx)
			case pipeline.StepRebase:
				stepErr = steps.Rebase(stepCtx)
			case pipeline.StepReview:
				stepErr = steps.Review(stepCtx)
			case pipeline.StepTest:
				stepErr = steps.Test(stepCtx)
			case pipeline.StepDocument:
				stepErr = steps.Document(stepCtx)
			case pipeline.StepLint:
				stepErr = steps.Lint(stepCtx)
			case pipeline.StepPullRequest:
				stepErr = steps.PR(stepCtx)
			case pipeline.StepCI:
				stepErr = steps.CI(stepCtx)
			default:
				stepErr = fmt.Errorf("unknown pipeline step %s", name)
			}
			return stepErr
		}, checkpoint)
	}
	runner.Register(pipeline.StepPush, func(pushCtx context.Context) error {
		current, err := database.GetRun(run.ID)
		if err != nil || current == nil || current.ReviewApprovedHeadSHA == nil {
			return fmt.Errorf("review evidence is required before publication")
		}
		head, err := git.Run(pushCtx, worktree, "rev-parse", "HEAD")
		if err != nil {
			return err
		}
		head = strings.TrimSpace(head)
		if head != *current.ReviewApprovedHeadSHA {
			return fmt.Errorf("worktree HEAD %s differs from reviewed head %s", head, *current.ReviewApprovedHeadSHA)
		}
		request.Candidate, request.ReviewedHead = head, *current.ReviewApprovedHeadSHA
		if dirty, dirtyErr := git.Run(pushCtx, worktree, "status", "--porcelain"); dirtyErr != nil {
			return dirtyErr
		} else if strings.TrimSpace(dirty) != "" {
			return fmt.Errorf("worktree has uncommitted changes after review")
		}
		_, err = steps.Publish(pushCtx, database, run.ID, request, func(mirrorCtx context.Context, candidate string) error {
			submitted := ""
			if run.SubmittedHeadSHA != nil {
				submitted = strings.TrimSpace(*run.SubmittedHeadSHA)
			}
			if submitted == "" {
				return fmt.Errorf("run %s has no submitted head custody", run.ID)
			}
			return mirrorPublication(mirrorCtx, p, run.RepoID, request.Ref, candidate, submitted)
		})
		return err
	})
	_, err = runner.Run(ctx)
	if err == nil {
		completeRunInTest(database, run.ID)
	}
	return err
}

type pushArgs struct {
	gate, ref, old, new, token, hookCapability string
	options                                    []string
}

func newAdmitPush() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "admit-push", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodAdmitPush, ipc.AdmitPushParams{Gate: a.gate, Ref: a.ref, Old: a.old, New: a.new, Token: a.token, HookCapability: a.hookCapability}, &ipc.AdmitPushResult{})
	}}
	flags(c, a)
	return c
}
func newRevokePushReceipt() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "revoke-push-receipt", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodRevokePushReceipt, ipc.RevokePushReceiptParams{Gate: a.gate, Ref: a.ref, Old: a.old, New: a.new, Token: a.token, HookCapability: a.hookCapability}, &map[string]bool{})
	}}
	flags(c, a)
	return c
}
func newNotifyPush() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "notify-push", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: a.gate, Ref: a.ref, Old: a.old, New: a.new, HookCapability: a.hookCapability, PushOptions: a.options}, &map[string]bool{})
	}}
	flags(c, a)
	return c
}
func flags(c *cobra.Command, a *pushArgs) {
	c.Flags().StringVar(&a.gate, "gate", "", "gate")
	c.Flags().StringVar(&a.ref, "ref", "", "ref")
	c.Flags().StringVar(&a.old, "old", "", "old")
	c.Flags().StringVar(&a.new, "new", "", "new")
	c.Flags().StringVar(&a.token, "token", "", "token")
	c.Flags().StringVar(&a.hookCapability, "hook-capability", "", "hook capability")
	c.Flags().StringSliceVar(&a.options, "push-option", nil, "push option")
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}
