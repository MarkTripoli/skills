//go:build !windows

package daemon

import "golang.org/x/sys/unix"

// processSessionID returns the kernel-owned session identity on Unix. Unlike
// command lines and environments, a descendant cannot change this identity
// without creating a new session, which is rejected by mutation admission.
func processSessionID(pid int) (int64, bool) {
	if pid <= 0 {
		return 0, false
	}
	session, err := unix.Getsid(pid)
	return int64(session), err == nil && session > 0
}
