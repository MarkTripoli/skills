//go:build darwin

package daemon

import (
	"fmt"
	"os/exec"
	"strconv"
)

func processEnvironment(pid int) ([]byte, error) {
	if pid <= 0 {
		return nil, fmt.Errorf("invalid pid")
	}
	// `ps eww -p` scopes output to the requested process and appends its environment.
	out, err := exec.Command("ps", "eww", "-p", strconv.Itoa(pid), "-o", "command=").Output()
	if err != nil {
		return nil, fmt.Errorf("read process environment for pid %d: %w", pid, err)
	}
	return out, nil
}
