package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/spf13/cobra"
)

func newDaemon() *cobra.Command {
	d := &cobra.Command{Use: "daemon", Short: "manage daemon"}
	d.AddCommand(&cobra.Command{Use: "start", RunE: startDaemon})
	d.AddCommand(&cobra.Command{Use: "stop", RunE: stopDaemon})
	d.AddCommand(&cobra.Command{Use: "restart", RunE: func(cmd *cobra.Command, args []string) error {
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
	d.AddCommand(newAdmitPush(), newNotifyPush())
	return d
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
	return nil
}

func stopDaemon(cmd *cobra.Command, args []string) error {
	path, err := pidPath()
	if err != nil {
		return err
	}
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
	server.Handle(ipc.MethodHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return ipc.HealthResult{Status: "ok"}, nil
	})
	adm := daemon.NewAdmission(server, func(ctx context.Context, n daemon.PushNotification) error { return recordPush(d, p, n) })
	_ = adm
	server.Handle(ipc.MethodStartFreshRun, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		var q ipc.StartFreshRunParams
		if err := json.Unmarshal(raw, &q); err != nil {
			return nil, err
		}
		r, err := d.InsertRun(q.RepoID, q.Branch, q.HeadSHA, "")
		if err != nil {
			return nil, err
		}
		return ipc.StartFreshRunResult{Receipt: ipc.LaunchReceipt{RunID: r.ID, Branch: r.Branch, HeadSHA: r.HeadSHA, SubmittedHeadSHA: r.HeadSHA, Disposition: "created"}}, nil
	})
	server.Handle(ipc.MethodRespond, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		return ipc.RespondResult{OK: true}, nil
	})
	server.Handle(ipc.MethodCancelRun, func(ctx context.Context, raw json.RawMessage) (interface{}, error) {
		var q ipc.CancelRunParams
		if err := json.Unmarshal(raw, &q); err != nil {
			return nil, err
		}
		return ipc.CancelRunResult{OK: d.CancelRun(q.RunID, "cancelled") == nil}, nil
	})
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

func recordPush(d *db.DB, p *paths.Paths, n daemon.PushNotification) error {
	repos, err := d.GetRepos()
	if err != nil {
		return err
	}
	for _, r := range repos {
		if p.RepoDir(r.ID) == n.Gate {
			branch := strings.TrimPrefix(n.Ref, "refs/heads/")
			_, err := d.InsertRun(r.ID, branch, n.New, n.Old)
			return err
		}
	}
	return fmt.Errorf("unknown gate %q", n.Gate)
}

type pushArgs struct {
	gate, ref, old, new, token string
	options                    []string
}

func newAdmitPush() *cobra.Command {
	a := &pushArgs{}
	c := &cobra.Command{Use: "admit-push", Hidden: true, RunE: func(cmd *cobra.Command, args []string) error {
		return callDaemon(ipc.MethodAdmitPush, ipc.AdmitPushParams{Gate: a.gate, Ref: a.ref, Token: a.token}, &ipc.AdmitPushResult{})
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
