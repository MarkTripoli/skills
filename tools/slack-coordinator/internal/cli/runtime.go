package cli

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
)

func home() (*paths.Paths, error) {
	p, err := paths.New()
	if err != nil {
		return nil, usageErr("%w", err)
	}
	return p, nil
}

// loadConfig reads config.yaml; a missing or invalid file is a config error (exit 2).
func loadConfig(p *paths.Paths) (*config.Config, error) {
	cfg, err := config.Load(p.ConfigFile())
	if err != nil {
		return nil, usageErr("%w", err)
	}
	return cfg, nil
}

// callDaemon sends one request to the daemon. A failed dial is exit 11; a
// JSON-RPC error comes back as *ipc.RPCError.
func callDaemon(method string, params, result interface{}) error {
	p, err := home()
	if err != nil {
		return err
	}
	c, err := ipc.Dial(p.Socket())
	if err != nil {
		return unavailableErr(err)
	}
	defer c.Close()
	return c.Call(method, params, result)
}

func writePID(p *paths.Paths, pid int) error {
	return os.WriteFile(p.PIDFile(), []byte(fmt.Sprint(pid)), 0o600)
}

func gitRoot() (string, error) {
	out, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("find git root: %w", err)
	}
	return filepath.Abs(strings.TrimSpace(string(out)))
}
