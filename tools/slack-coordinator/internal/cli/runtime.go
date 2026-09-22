package cli

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

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

// callDaemon sends one request to the daemon with the client's default reply
// deadline. A failed dial is exit 11; a JSON-RPC error comes back as
// *ipc.RPCError.
func callDaemon(method string, params, result interface{}) error {
	return callDaemonWithin(context.Background(), 0, method, params, result)
}

// callDaemonWithin is callDaemon with cancellation and a reply deadline for a
// method that legitimately blocks longer than the default, such as
// assistant.verify_owner; zero keeps the default.
func callDaemonWithin(ctx context.Context, timeout time.Duration, method string, params, result interface{}) error {
	c, err := dialDaemon()
	if err != nil {
		var coded *ExitCodeError
		if errors.As(err, &coded) {
			return err
		}
		return unavailableErr(err)
	}
	defer c.Close()
	return c.CallWithContext(ctx, method, params, result, timeout)
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
