package paths

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// EnvHome overrides the runtime root, which defaults to ~/.slack-coordinator.
const EnvHome = "SLACK_COORDINATOR_HOME"

// Paths locates every slack-coordinator file under one runtime root.
type Paths struct {
	root string
}

// New returns Paths rooted at SLACK_COORDINATOR_HOME or ~/.slack-coordinator.
// Under go test the environment variable is required so a test never touches
// the developer's real daemon.
func New() (*Paths, error) {
	if root := os.Getenv(EnvHome); root != "" {
		abs, err := filepath.Abs(root)
		if err != nil {
			return nil, err
		}
		return &Paths{root: abs}, nil
	}
	if testing.Testing() {
		return nil, fmt.Errorf("%s must be set under go test to avoid touching the real slack-coordinator root", EnvHome)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	return &Paths{root: filepath.Join(home, ".slack-coordinator")}, nil
}

// WithRoot returns Paths rooted at a custom directory (for testing).
func WithRoot(root string) *Paths {
	return &Paths{root: root}
}

func (p *Paths) Root() string       { return p.root }
func (p *Paths) DB() string         { return filepath.Join(p.root, "state.sqlite") }
func (p *Paths) Socket() string     { return filepath.Join(p.root, "socket") }
func (p *Paths) PIDFile() string    { return filepath.Join(p.root, "daemon.pid") }
func (p *Paths) ConfigFile() string { return filepath.Join(p.root, "config.yaml") }
func (p *Paths) DaemonLog() string  { return filepath.Join(p.root, "daemon.log") }

// LockFile is the advisory lock that keeps one live daemon per root. PIDFile
// is informational; LockFile is what refuses a second daemon.
func (p *Paths) LockFile() string { return filepath.Join(p.root, "daemon.lock") }

// Workspace is the directory agent runs execute under.
func (p *Paths) Workspace() string { return filepath.Join(p.root, "workspace") }

// RunDir is the working directory of one agent run.
func (p *Paths) RunDir(id string) string { return filepath.Join(p.Workspace(), "runs", id) }

// OnboardCheckpoint records how far first-run onboarding progressed.
func (p *Paths) OnboardCheckpoint() string { return filepath.Join(p.root, "onboard.json") }

// EnsureDirs creates the root, readable by the owner only.
func (p *Paths) EnsureDirs() error {
	if err := os.MkdirAll(p.root, 0o700); err != nil {
		return err
	}
	return os.Chmod(p.root, 0o700)
}

// EnsureWorkspace creates <root>/workspace/runs, both directories readable by
// the owner only.
func (p *Paths) EnsureWorkspace() error {
	runs := filepath.Join(p.Workspace(), "runs")
	if err := os.MkdirAll(runs, 0o700); err != nil {
		return err
	}
	if err := os.Chmod(p.Workspace(), 0o700); err != nil {
		return err
	}
	return os.Chmod(runs, 0o700)
}
