//go:build darwin

package daemon

import (
	"fmt"
	"os/exec"
	"strconv"
)

func processEnvironment(pid int) ([]byte, error) {
	out, err := exec.Command("ps", "-eww", "-p", strconv.Itoa(pid), "-o", "command=").Output()
	if err != nil {
		return nil, fmt.Errorf("read process environment: %w", err)
	}
	return out, nil
}
