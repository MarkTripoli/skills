package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

// supervisionNotice is what daemon stop prints when a service is installed:
// the supervisor restarts a stopped daemon.
const supervisionNotice = "service installed; use service uninstall to stop supervision"

// commandExecutor runs launchctl and systemctl for real.
type commandExecutor struct{}

func (commandExecutor) Run(name string, args ...string) error {
	out, err := exec.Command(name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(string(out)))
	}
	return nil
}

// serviceFor builds the supervisor entry for the runtime home with this
// binary. Tests replace it to inject a recording executor and a fixed GOOS.
var serviceFor = func(p *paths.Paths) (daemon.Service, error) {
	exe, err := os.Executable()
	if err != nil {
		return daemon.Service{}, err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return daemon.Service{}, err
	}
	return daemon.Service{Home: p, Binary: exe, Executor: commandExecutor{}}, nil
}

// service resolves the home and supervisor entry; an unsupported platform is
// a usage error (exit 2).
func service() (daemon.Service, string, error) {
	p, err := home()
	if err != nil {
		return daemon.Service{}, "", err
	}
	s, err := serviceFor(p)
	if err != nil {
		return daemon.Service{}, "", err
	}
	path, err := s.DefinitionPath()
	if err != nil {
		return daemon.Service{}, "", usageErr("%w", err)
	}
	return s, path, nil
}

func newService() *cobra.Command {
	c := &cobra.Command{
		Use:   "service",
		Short: "Supervise the daemon with launchd (macOS) or systemd (Linux)",
		Long: `Installs a per-user launchd agent or systemd user unit that runs
"slack-coordinator daemon serve" at login and restarts it after exit. The
definition binds this binary and $SLACK_COORDINATOR_HOME; run install again
after moving either.`,
	}
	c.AddCommand(
		&cobra.Command{Use: "install", Short: "Write the service definition and start supervision", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
			s, path, err := service()
			if err != nil {
				return err
			}
			if err := s.Home.EnsureDirs(); err != nil {
				return err
			}
			if err := s.Install(); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "service installed at %s\n", path)
			return nil
		}},
		&cobra.Command{Use: "uninstall", Short: "Stop supervision and remove the service definition", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
			s, path, err := service()
			if err != nil {
				return err
			}
			if !s.Installed() {
				fmt.Fprintln(cmd.OutOrStdout(), "service not installed")
				return nil
			}
			if err := s.Uninstall(); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "service removed from %s\n", path)
			return nil
		}},
		&cobra.Command{Use: "status", Short: "Report whether the service definition is installed", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
			s, path, err := service()
			if err != nil {
				return err
			}
			if s.Installed() {
				fmt.Fprintf(cmd.OutOrStdout(), "service installed at %s\n", path)
			} else {
				fmt.Fprintln(cmd.OutOrStdout(), "service not installed")
			}
			return nil
		}},
	)
	return c
}
