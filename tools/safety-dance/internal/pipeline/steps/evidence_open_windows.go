//go:build windows

package steps

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/sys/windows"
)

const maxEvidenceBytes = 16 << 20

// beforeEvidenceCandidateOpen is a native-test seam. It runs after the
// managed root handle is pinned and immediately before resolving the candidate
// path, allowing tests to replace a root or intermediate component at the
// exact reparse-point race boundary.
var beforeEvidenceCandidateOpen func(root, candidate string) error

func readConfinedEvidence(raw, worktreeRoot, evidenceRoot string) ([]byte, os.FileInfo, error) {
	if strings.TrimSpace(raw) == "" || filepath.IsAbs(raw) {
		return nil, nil, fmt.Errorf("evidence file path must be relative to a managed root")
	}
	for _, root := range []string{worktreeRoot, evidenceRoot} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		rootHandle, rootOpenErr := os.Open(root)
		if rootOpenErr != nil {
			continue
		}
		rootOpened, rootPathErr := finalHandlePath(windows.Handle(rootHandle.Fd()))
		if rootPathErr != nil {
			rootHandle.Close()
			continue
		}
		candidate := filepath.Join(root, raw)
		if beforeEvidenceCandidateOpen != nil {
			if err := beforeEvidenceCandidateOpen(rootOpened, candidate); err != nil {
				rootHandle.Close()
				continue
			}
		}
		f, openErr := os.Open(candidate)
		if openErr != nil {
			rootHandle.Close()
			continue
		}
		info, statErr := f.Stat()
		if statErr != nil {
			f.Close()
			rootHandle.Close()
			return nil, nil, statErr
		}
		opened, openedErr := finalHandlePath(windows.Handle(f.Fd()))
		if openedErr != nil {
			f.Close()
			rootHandle.Close()
			continue
		}
		rel, relErr := filepath.Rel(rootOpened, opened)
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			f.Close()
			rootHandle.Close()
			continue
		}
		if !info.Mode().IsRegular() {
			f.Close()
			rootHandle.Close()
			return nil, info, fmt.Errorf("evidence file is not a regular file")
		}
		data, readErr := io.ReadAll(io.LimitReader(f, maxEvidenceBytes+1))
		f.Close()
		rootHandle.Close()
		if readErr != nil {
			return nil, info, readErr
		}
		if int64(len(data)) > maxEvidenceBytes {
			return nil, info, fmt.Errorf("evidence file exceeds %d-byte limit", maxEvidenceBytes)
		}
		return data, info, nil
	}
	return nil, nil, fmt.Errorf("evidence file is outside managed roots")
}

func finalHandlePath(handle windows.Handle) (string, error) {
	buf := make([]uint16, 32768)
	n, err := windows.GetFinalPathNameByHandle(handle, &buf[0], uint32(len(buf)), 0)
	if err != nil {
		return "", err
	}
	return filepath.Clean(string(windows.UTF16ToString(buf[:n]))), nil
}
