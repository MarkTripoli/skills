//go:build !linux && !darwin && !windows

package daemon

import "errors"

func processEnvironment(pid int) ([]byte, error) {
	return nil, errors.New("process environment inspection is unsupported")
}
