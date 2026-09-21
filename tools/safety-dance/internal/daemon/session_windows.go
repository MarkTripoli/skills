//go:build windows

package daemon

// Windows process ancestry does not expose a portable session identity through
// the standard library. The Windows IPC transport supplies the OS-authenticated
// peer and ancestry checks remain fail-closed when session identity is absent.
func processSessionID(pid int) (int64, bool) { return 0, false }
