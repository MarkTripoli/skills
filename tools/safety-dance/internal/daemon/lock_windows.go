//go:build windows

package daemon

import (
	"golang.org/x/sys/windows"
	"os"
)

func lockRuntimeFile(f *os.File) error {
	overlap := new(windows.Overlapped)
	return windows.LockFileEx(windows.Handle(f.Fd()), windows.LOCKFILE_EXCLUSIVE_LOCK|windows.LOCKFILE_FAIL_IMMEDIATELY, 0, 1, 0, overlap)
}

func unlockRuntimeFile(f *os.File) error {
	overlap := new(windows.Overlapped)
	return windows.UnlockFileEx(windows.Handle(f.Fd()), 0, 1, 0, overlap)
}
