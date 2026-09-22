package cli

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newDaemon() *cobra.Command {
	d := &cobra.Command{Use: "daemon", Short: "Manage the per-user daemon"}
	d.AddCommand(
		&cobra.Command{Use: "start", Short: "Start the daemon in the background", Args: cobra.NoArgs, RunE: startDaemon},
		&cobra.Command{Use: "stop", Short: "Ask the daemon to shut down", Args: cobra.NoArgs, RunE: stopDaemon},
		&cobra.Command{Use: "status", Short: "Print the daemon health JSON", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
			var out ipc.HealthResult
			if err := callDaemon(ipc.MethodDaemonHealth, ipc.HealthParams{}, &out); err != nil {
				return err
			}
			return json.NewEncoder(cmd.OutOrStdout()).Encode(out)
		}},
		&cobra.Command{Use: "serve", Hidden: true, Args: cobra.NoArgs, RunE: serveDaemon},
	)
	return d
}

func health() error {
	var out ipc.HealthResult
	return callDaemon(ipc.MethodDaemonHealth, ipc.HealthParams{}, &out)
}

func startDaemon(cmd *cobra.Command, _ []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	if err := p.EnsureDirs(); err != nil {
		return err
	}
	if _, err := loadConfig(p); err != nil {
		return err
	}
	if health() == nil {
		fmt.Fprintln(cmd.OutOrStdout(), "daemon already running")
		return nil
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	logFile, err := os.OpenFile(p.DaemonLog(), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	defer logFile.Close()
	child := exec.Command(exe, "daemon", "serve")
	child.Stdout = logFile
	child.Stderr = logFile
	child.Env = os.Environ()
	if err := child.Start(); err != nil {
		return err
	}
	if err := writePID(p, child.Process.Pid); err != nil {
		_ = child.Process.Kill()
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "daemon started (%d)\n", child.Process.Pid)
	if err := waitForDaemon(5 * time.Second); err != nil {
		_ = child.Process.Kill()
		_ = os.Remove(p.PIDFile())
		return fmt.Errorf("daemon failed to become ready (see %s): %w", p.DaemonLog(), err)
	}
	return nil
}

func waitForDaemon(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var last error
	for time.Now().Before(deadline) {
		if last = health(); last == nil {
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	return last
}

func stopDaemon(cmd *cobra.Command, _ []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	var out ipc.ShutdownResult
	err = callDaemon(ipc.MethodDaemonShutdown, ipc.ShutdownParams{}, &out)
	var coded *ExitCodeError
	if errors.As(err, &coded) && coded.Code == ExitUnavailable {
		_ = os.Remove(p.PIDFile())
		fmt.Fprintln(cmd.OutOrStdout(), "daemon not running")
		return nil
	}
	if err != nil {
		return fmt.Errorf("daemon shutdown failed: %w", err)
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if health() != nil {
			_ = os.Remove(p.PIDFile())
			fmt.Fprintln(cmd.OutOrStdout(), "daemon stopped")
			return nil
		}
		time.Sleep(25 * time.Millisecond)
	}
	return errors.New("daemon did not stop within timeout")
}

func serveDaemon(cmd *cobra.Command, _ []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	cfg, err := loadConfig(p)
	if err != nil {
		return err
	}
	ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	fmt.Fprintf(os.Stderr, "daemon starting pid=%d\n", os.Getpid())
	defer fmt.Fprintf(os.Stderr, "daemon stopping pid=%d\n", os.Getpid())
	return daemon.Serve(ctx, p, cfg, daemon.Options{})
}
