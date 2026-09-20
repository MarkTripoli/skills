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
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/config"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/pipeline/steps"
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
	d.AddCommand(newAdmitPush(), newNotifyPush(), newIssuePushToken())
	return d
}

func newIssuePushToken() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "issue-push-token", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		var out ipc.IssuePushTokenResult
		if err := callDaemon(ipc.MethodIssuePushToken, ipc.IssuePushTokenParams{Gate: a.gate, Ref: a.ref}, &out); err != nil {
			return err
		}
		_, err := fmt.Fprintln(cmd.OutOrStdout(), out.Token)
		return err
	}}
	c.Flags().StringVar(&a.gate, "gate", "", "gate")
	c.Flags().StringVar(&a.ref, "ref", "", "ref")
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
	child.Stdout = os.Stdout
	child.Stderr = os.Stderr
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
	if err := stopInstalledService(p); err != nil {
		return err
	}
	path := p.PIDFile()
	raw, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		fmt.Fprintln(cmd.OutOrStdout(), "daemon stopped")
		return nil
	}
	if err != nil {
		return err
	}
	pid, err := strconv.Atoi(strings.TrimSpace(string(raw)))
	if err != nil {
		return err
	}
	if proc, e := os.FindProcess(pid); e == nil {
		_ = proc.Signal(syscall.SIGTERM)
	}
	_ = os.Remove(path)
	fmt.Fprintln(cmd.OutOrStdout(), "daemon stopped")
	return nil
}

func serveDaemon(cmd *cobra.Command, args []string) error {
	p, d, err := openRuntime()
	if err != nil {
		return err
	}
	defer d.Close()
	own, err := daemon.AcquireOwnership(p)
	if err != nil {
		return err
	}
	defer own.Close()
	server := ipc.NewServer()
	manager := daemon.NewManager(d, func(ctx context.Context, r *db.Run) {
		err := executeRun(ctx, d, p, r)
		cleanup := false
		if err != nil {
			status := types.RunFailed
			if ctx.Err() != nil {
				status = types.RunCancelled
			}
			if statusErr := d.UpdateRunErrorStatus(r.ID, err.Error(), status); statusErr == nil {
				cleanup = true
			}
		} else if statusErr := d.TransitionRunStatus(r.ID, types.RunRunning, types.RunCompleted); statusErr == nil {
			cleanup = true
		}
		if !cleanup {
			return
		}
		current, statusErr := d.GetRun(r.ID)
		if statusErr != nil || current == nil || !current.Status.Terminal() || current.WorktreeDir == nil {
			return
		}
		if repo, e := d.GetRepo(r.RepoID); e == nil && repo != nil {
			_ = worktrees.RemoveDetached(context.Background(), repo.WorkingPath, *current.WorktreeDir)
		}
	})
	adm := daemon.NewAdmissionWithStore(server, func(ctx context.Context, n daemon.PushNotification) error { return recordPush(d, p, manager, n) }, filepath.Join(p.Root(), "admission-receipts.json"))
	if err := adm.InitError(); err != nil {
		return fmt.Errorf("load admission receipts: %w", err)
	}
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()
		for {
			if err := adm.ReconcileOnce(context.Background()); err != nil {
				// The receipt remains persisted and will be retried on the next tick.
			}
			<-ticker.C
		}
	}()
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
		worktree := p.WorktreeDir(q.RepoID, nonce)
		if err := worktrees.CreateDetached(ctx, repo.WorkingPath, worktree, q.HeadSHA); err != nil {
			return nil, err
		}
		accepted := db.AcceptedRef{RepoID: q.RepoID, Branch: q.Branch, GateHead: q.HeadSHA, LaunchNonce: nonce}
		r, err := manager.Replace(ctx, daemon.BranchKey{RepositoryID: q.RepoID, Ref: q.Branch}, accepted, worktree)
		if err != nil {
			_ = os.RemoveAll(worktree)
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
		if q.RunID == "" || q.Step == "" || q.Action == "" {
			return nil, fmt.Errorf("run, step, and action are required")
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
		waiting := false
		for _, step := range steps {
			if step.StepName == q.Step && (step.Status == types.StepStatusAwaitingApproval || step.Status == types.StepStatusFixReview) {
				waiting = true
				break
			}
		}
		if !waiting {
			return nil, fmt.Errorf("run %s is not awaiting a response for %s", q.RunID, q.Step)
		}
		if err := d.RecordResponse(db.Response{RunID: q.RunID, Step: string(q.Step), Action: string(q.Action), Payload: q}); err != nil {
			return nil, err
		}
		if pipeline.StepName(q.Step) == pipeline.StepReview && q.Action == types.ActionApprove && r.WorktreeDir != nil {
			head, headErr := git.Run(ctx, *r.WorktreeDir, "rev-parse", "HEAD")
			if headErr != nil {
				return nil, headErr
			}
			if headErr = d.UpdateRunReviewApprovedHeadSHA(q.RunID, strings.TrimSpace(head)); headErr != nil {
				return nil, headErr
			}
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
		if err := d.CancelRun(q.RunID, "cancelled"); err != nil {
			return nil, err
		}
		run, err := d.GetRun(q.RunID)
		if err != nil {
			return nil, err
		}
		if run != nil {
			active := manager.Active(daemon.BranchKey{RepositoryID: run.RepoID, Ref: run.Branch})
			if active != nil {
				active.Cancel()
				active.Wait()
			}
		}
		return ipc.CancelRunResult{OK: true}, nil
	})
	if err := manager.Recover(context.Background()); err != nil {
		return err
	}
	if err := server.Listen(p.Socket()); err != nil {
		return err
	}
	go server.ServeReady()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	<-sig
	server.Close()
	server.CloseListener()
	return nil
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
		branch := strings.TrimPrefix(n.Ref, "refs/heads/")
		nonce := n.Token
		if nonce == "" {
			return fmt.Errorf("accepted push has no durable identity")
		}
		if existing, err := d.GetRunByLaunchNonce(r.ID, branch, nonce); err != nil {
			return err
		} else if existing != nil {
			return nil
		}
		worktree := p.WorktreeDir(r.ID, nonce)
		if err := worktrees.CreateDetached(context.Background(), r.WorkingPath, worktree, n.New); err != nil {
			return err
		}
		accepted := db.AcceptedRef{RepoID: r.ID, Branch: branch, GateHead: n.New, PreviousReconciledHead: n.Old, LaunchNonce: nonce, RequestedOptions: append([]string(nil), n.Options...)}
		_, err = manager.Replace(context.Background(), daemon.BranchKey{RepositoryID: r.ID, Ref: branch}, accepted, worktree)
		if err != nil {
			_ = os.RemoveAll(worktree)
		}
		return err
	}
	return fmt.Errorf("unknown gate %q", n.Gate)
}
func normalizeSHA(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || strings.Trim(value, "0") == "" {
		return ""
	}
	return value
}

func livePublicationHead(ctx context.Context, remote, ref string) string {
	out, err := exec.CommandContext(ctx, "git", "ls-remote", remote, ref).Output()
	if err != nil {
		return ""
	}
	fields := strings.Fields(string(out))
	if len(fields) == 0 {
		return ""
	}
	return normalizeSHA(fields[0])
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
	if err := worktrees.RecoverDetached(ctx, repo.WorkingPath, worktree, run.HeadSHA); err != nil {
		return err
	}
	if _, err := os.Stat(worktree); err != nil {
		return fmt.Errorf("owned worktree unavailable: %w", err)
	}
	pushedConfig, err := config.LoadRepo(worktree)
	if err != nil {
		return fmt.Errorf("load pushed repository configuration: %w", err)
	}
	trustedConfig := &config.RepoConfig{}
	trustedRef := "refs/safety-dance/trusted/" + run.ID
	if _, err := git.Run(ctx, repo.WorkingPath, "fetch", "--no-tags", "origin", "refs/heads/"+repo.DefaultBranch+":"+trustedRef); err != nil {
		return fmt.Errorf("fetch trusted configuration: %w", err)
	}
	defer func() { _, _ = git.Run(ctx, repo.WorkingPath, "update-ref", "-d", trustedRef) }()
	entries, err := git.Run(ctx, repo.WorkingPath, "ls-tree", "-r", "--name-only", trustedRef, "--", ".safety-dance.yaml")
	if err != nil {
		return fmt.Errorf("inspect trusted configuration: %w", err)
	}
	if strings.TrimSpace(entries) != "" {
		raw, showErr := git.ShowFile(ctx, repo.WorkingPath, trustedRef, ".safety-dance.yaml")
		if showErr != nil {
			return fmt.Errorf("read trusted repository configuration: %w", showErr)
		}
		trustedConfig, err = config.LoadRepoFromBytes([]byte(raw))
		if err != nil {
			return fmt.Errorf("load trusted repository configuration: %w", err)
		}
	}
	effectiveConfig := config.EffectiveRepoConfig(pushedConfig, trustedConfig, trustedConfig.AllowRepoCommands)
	ref := run.Branch
	if !strings.HasPrefix(ref, "refs/") {
		ref = "refs/heads/" + ref
	}
	verifiedHead := livePublicationHead(ctx, repo.PushURL(), ref)
	if verifiedHead == "" {
		verifiedHead = normalizeSHA(run.BaseSHA)
	}
	request := steps.PushRequest{Worktree: worktree, Remote: repo.PushURL(), Ref: ref, Candidate: run.HeadSHA, VerifiedHead: verifiedHead, Rewrite: verifiedHead != "" && verifiedHead == normalizeSHA(run.BaseSHA), BeforePush: func() error {
		current, checkErr := database.GetRun(run.ID)
		if checkErr != nil {
			return checkErr
		}
		if current == nil || current.Status == types.RunCancelled || current.Status == types.RunFailed {
			return fmt.Errorf("run %s was superseded before publication", run.ID)
		}
		return nil
	}}
	runner := pipeline.NewDurable(database, run.ID)
	for _, name := range pipeline.CoreSteps {
		name := name
		runner.Register(name, func(stepCtx context.Context) error {
			stepCtx = steps.WithWorktree(stepCtx, worktree)
			stepCtx = steps.WithRepoConfig(stepCtx, effectiveConfig)
			stepCtx = steps.WithRun(stepCtx, database, run.ID)
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
			if stepErr != nil {
				return stepErr
			}
			// Persist the latest owned worktree head so restart recovery resumes
			// from the output of the last completed modifying step.
			if head, headErr := git.Run(stepCtx, worktree, "rev-parse", "HEAD"); headErr == nil {
				if headErr = database.UpdateRunHeadSHA(run.ID, strings.TrimSpace(head)); headErr != nil {
					return headErr
				}
			}
			if name == pipeline.StepReview {
				head, headErr := git.Run(stepCtx, worktree, "rev-parse", "HEAD")
				if headErr != nil {
					return headErr
				}
				return database.UpdateRunReviewApprovedHeadSHA(run.ID, strings.TrimSpace(head))
			}
			return nil
		})
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
			_, err := git.RunBare(mirrorCtx, p.RepoDir(run.RepoID), "update-ref", ref, candidate)
			return err
		})
		return err
	})
	_, err = runner.Run(ctx)
	return err
}

type pushArgs struct {
	gate, ref, old, new, token string
	options                    []string
}

func newAdmitPush() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "admit-push", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodAdmitPush, ipc.AdmitPushParams{Gate: a.gate, Ref: a.ref, Old: a.old, New: a.new, Token: a.token}, &ipc.AdmitPushResult{})
	}}
	flags(c, a)
	return c
}
func newNotifyPush() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "notify-push", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: a.gate, Ref: a.ref, Old: a.old, New: a.new, PushOptions: a.options}, &map[string]bool{})
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
	c.Flags().StringSliceVar(&a.options, "push-option", nil, "push option")
}
