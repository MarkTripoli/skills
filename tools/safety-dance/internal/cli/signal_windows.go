//go:build windows

package cli

import (
	"time"

	"golang.org/x/sys/windows"
)

// Windows has no SIGTERM equivalent. Delay termination long enough for the
// IPC response to flush, then terminate the daemon process explicitly.
func signalProcess(pid int) error {
	process, err := windows.OpenProcess(windows.PROCESS_TERMINATE, false, uint32(pid))
	if err != nil {
		return err
	}
	defer windows.CloseHandle(process)
	time.Sleep(100 * time.Millisecond)
	return windows.TerminateProcess(process, 0)
}
