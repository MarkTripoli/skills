//go:build !windows

package agent

import "os/exec"

func attachManagedProcess(*exec.Cmd) (func(), error) { return func() {}, nil }
