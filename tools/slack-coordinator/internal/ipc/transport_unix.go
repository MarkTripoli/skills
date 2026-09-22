//go:build !windows

package ipc

import (
	"fmt"
	"net"
	"os"
	"syscall"
	"time"
)

// listen binds a Unix domain socket at endpoint. A path with a live listener
// belongs to a running daemon, so listen fails instead of unlinking it; only a
// proven-stale path (nothing answers) is removed before binding.
func listen(endpoint string) (net.Listener, error) {
	if conn, err := net.DialTimeout("unix", endpoint, 200*time.Millisecond); err == nil {
		conn.Close()
		return nil, fmt.Errorf("ipc socket %s is already in use by a live listener", endpoint)
	}
	_ = os.Remove(endpoint)
	oldMask := syscall.Umask(0o077)
	ln, err := net.Listen("unix", endpoint)
	syscall.Umask(oldMask)
	return ln, err
}

func dial(endpoint string, timeout time.Duration) (net.Conn, error) {
	return (&net.Dialer{Timeout: timeout}).Dial("unix", endpoint)
}
