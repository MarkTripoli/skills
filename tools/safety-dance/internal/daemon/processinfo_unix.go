//go:build !windows

package daemon

import (
	"errors"
	"os/exec"
	"strconv"
	"strings"
)

func processInfo(pid int) (int, string, error) {
	out, err := exec.Command("ps", "-p", strconv.Itoa(pid), "-o", "ppid=,command=").Output()
	if err != nil {
		return 0, "", err
	}
	fields := strings.Fields(string(out))
	if len(fields) < 2 {
		return 0, "", errors.New("process information is incomplete")
	}
	parent, err := strconv.Atoi(fields[0])
	if err != nil {
		return 0, "", err
	}
	return parent, strings.Join(fields[1:], " "), nil
}
