//go:build unix && !linux

package procreap

import (
	"fmt"
	"os"
)

// processCWDs resolves each pid's working directory. Outside Linux there is no
// /proc to read, so one batched lsof call answers for the whole candidate set.
func processCWDs(pids []int) map[int]string {
	if len(pids) == 0 {
		return nil
	}
	return lsofCWDs(pids)
}

func processCWDsStrict(pids []int) (map[int]string, error) {
	if len(pids) == 0 {
		return nil, nil
	}
	if _, err := os.Stat("/dev/null"); err != nil {
		return nil, err
	}
	if got := lsofCWDs(pids); got == nil {
		return nil, fmt.Errorf("cwd inspection unavailable")
	}
	return lsofCWDs(pids), nil
}
