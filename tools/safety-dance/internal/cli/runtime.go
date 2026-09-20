package cli

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/gate"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

func openRuntime() (*paths.Paths, *db.DB, error) {
	p, err := home()
	if err != nil {
		return nil, nil, err
	}
	if err := p.EnsureDirs(); err != nil {
		return nil, nil, err
	}
	d, err := db.Open(p.DB())
	if err != nil {
		return nil, nil, err
	}
	return p, d, nil
}

func callDaemon(method string, params, result interface{}) error {
	p, err := home()
	if err != nil {
		return err
	}
	c, err := ipc.Dial(p.Socket())
	if err != nil {
		return fmt.Errorf("daemon unavailable: %w", err)
	}
	defer c.Close()
	return c.Call(method, params, result)
}

func gitRoot() (string, error) {
	out, err := exec.Command("git", "rev-parse", "--show-toplevel").Output()
	if err != nil {
		return "", fmt.Errorf("find git root: %w", err)
	}
	return filepath.Abs(strings.TrimSpace(string(out)))
}

func gitValue(args ...string) (string, error) {
	out, err := exec.Command("git", args...).Output()
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func initGate(ctx context.Context) error {
	p, d, err := openRuntime()
	if err != nil {
		return err
	}
	defer d.Close()
	root, err := gitRoot()
	if err != nil {
		return err
	}
	_, _, err = gate.Init(ctx, d, p, root)
	return err
}

func pidPath() (string, error) {
	p, err := home()
	if err != nil {
		return "", err
	}
	return p.PIDFile(), nil
}

func writePID(pid int) error {
	path, err := pidPath()
	if err != nil {
		return err
	}
	return os.WriteFile(path, []byte(fmt.Sprint(pid)), 0600)
}
