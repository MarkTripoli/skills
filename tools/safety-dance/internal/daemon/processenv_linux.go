//go:build linux

package daemon

import (
	"fmt"
	"os"
	"strconv"
)

func processEnvironment(pid int) ([]byte, error) {
	raw, err := os.ReadFile("/proc/" + strconv.Itoa(pid) + "/environ")
	if err != nil {
		return nil, fmt.Errorf("read process environment: %w", err)
	}
	return raw, nil
}
