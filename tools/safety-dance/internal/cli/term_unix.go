//go:build !windows

package cli

import "syscall"

func terminationSignal() syscall.Signal { return syscall.SIGTERM }
