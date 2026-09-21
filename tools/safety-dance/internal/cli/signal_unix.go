//go:build !windows

package cli

import "syscall"

func signalProcess(pid int) error { return syscall.Kill(pid, syscall.SIGTERM) }
