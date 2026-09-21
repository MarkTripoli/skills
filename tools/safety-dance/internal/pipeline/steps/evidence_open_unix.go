//go:build !windows

package steps

import (
	"fmt"
	"io"
	"os"

	"golang.org/x/sys/unix"
)

func readConfinedEvidence(path string) ([]byte, os.FileInfo, error) {
	fd, err := unix.Open(path, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW, 0)
	if err != nil {
		return nil, nil, err
	}
	f := os.NewFile(uintptr(fd), path)
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, info, fmt.Errorf("evidence file is not a regular file: %s", path)
	}
	raw, err := io.ReadAll(f)
	return raw, info, err
}
