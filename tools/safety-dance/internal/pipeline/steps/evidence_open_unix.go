//go:build !windows

package steps

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/unix"
)

const maxEvidenceBytes = 16 << 20

func readConfinedEvidence(raw, worktreeRoot, evidenceRoot string) ([]byte, os.FileInfo, error) {
	if strings.TrimSpace(raw) == "" || filepath.IsAbs(raw) {
		return nil, nil, fmt.Errorf("evidence file path must be relative to a managed root")
	}
	for _, root := range []string{worktreeRoot, evidenceRoot} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		f, err := openNoFollow(root, raw)
		if err != nil {
			continue
		}
		defer f.Close()
		info, err := f.Stat()
		if err != nil || !info.Mode().IsRegular() {
			if err == nil {
				err = fmt.Errorf("evidence file is not a regular file")
			}
			return nil, info, err
		}
		data, err := io.ReadAll(io.LimitReader(f, maxEvidenceBytes+1))
		if err != nil {
			return nil, info, err
		}
		if int64(len(data)) > maxEvidenceBytes {
			return nil, info, fmt.Errorf("evidence file exceeds %d-byte limit", maxEvidenceBytes)
		}
		return data, info, nil
	}
	return nil, nil, fmt.Errorf("evidence file is outside managed roots")
}

func openNoFollow(root, raw string) (*os.File, error) {
	parts := strings.Split(filepath.ToSlash(raw), "/")
	fd, err := unix.Open(root, unix.O_RDONLY|unix.O_CLOEXEC|unix.O_NOFOLLOW|unix.O_DIRECTORY, 0)
	if err != nil {
		return nil, err
	}
	for i, part := range parts {
		if part == "" || part == "." || part == ".." {
			unix.Close(fd)
			return nil, fmt.Errorf("invalid evidence path")
		}
		flags := unix.O_RDONLY | unix.O_CLOEXEC | unix.O_NOFOLLOW
		if i < len(parts)-1 {
			flags |= unix.O_DIRECTORY
		}
		next, openErr := unix.Openat(fd, part, flags, 0)
		unix.Close(fd)
		if openErr != nil {
			return nil, openErr
		}
		fd = next
	}
	return os.NewFile(uintptr(fd), filepath.Join(root, raw)), nil
}
