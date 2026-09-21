//go:build !windows

package daemon

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// processSessionID reads the kernel-owned session identity. A daemonized
// descendant that creates a fresh session cannot impersonate the operator's
// original shell ancestry with caller-controlled environment or arguments.
func processSessionID(pid int) (int64, bool) {
	if pid <= 0 {
		return 0, false
	}
	raw, err := os.ReadFile(fmt.Sprintf("/proc/%d/stat", pid))
	if err != nil {
		return 0, false
	}
	text := string(raw)
	close := strings.LastIndex(text, ")")
	if close < 0 {
		return 0, false
	}
	fields := strings.Fields(text[close+1:])
	// After comm, state is field 3; session is field 6, index 3 here.
	if len(fields) <= 3 {
		return 0, false
	}
	session, err := strconv.ParseInt(fields[3], 10, 64)
	return session, err == nil && session > 0
}
