package cli

import (
	"errors"
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

// dialDaemon connects to the daemon socket. A missing home is a usage error;
// a failed dial is returned unwrapped for callers that report it themselves.
func dialDaemon() (*ipc.Client, error) {
	p, err := home()
	if err != nil {
		return nil, err
	}
	return ipc.Dial(p.Socket())
}

// callDaemon sends one request to the daemon. A failed dial is exit 11; a
// JSON-RPC error comes back as *ipc.RPCError.
func callDaemon(method string, params, result interface{}) error {
	c, err := dialDaemon()
	if err != nil {
		var coded *ExitCodeError
		if errors.As(err, &coded) {
			return err
		}
		return unavailableErr(err)
	}
	defer c.Close()
	return c.Call(method, params, result)
}

// daemonErr maps a callDaemon failure to the exit code the daemon's answer
// implies: a post the daemon could not deliver is exit 11 like a dial failure;
// any other refusal (unknown run, finished run, bad input) is a usage error.
func daemonErr(err error) error {
	var rpcErr *ipc.RPCError
	if !errors.As(err, &rpcErr) {
		return err
	}
	if rpcErr.Code == ipc.ErrUnavailable {
		return &ExitCodeError{Code: ExitUnavailable, Err: rpcErr}
	}
	return usageErr("%s", rpcErr.Message)
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
