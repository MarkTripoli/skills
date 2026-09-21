//go:build windows

package steps

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

func readConfinedEvidence(raw, worktreeRoot, evidenceRoot string) ([]byte, os.FileInfo, error) {
	if strings.TrimSpace(raw) == "" || filepath.IsAbs(raw) {
		return nil, nil, fmt.Errorf("evidence file path must be relative to a managed root")
	}
	for _, root := range []string{worktreeRoot, evidenceRoot} {
		if strings.TrimSpace(root) == "" {
			continue
		}
		candidate := filepath.Join(root, raw)
		resolved, err := filepath.EvalSymlinks(candidate)
		if err != nil {
			continue
		}
		rootResolved, rootErr := filepath.EvalSymlinks(root)
		if rootErr != nil {
			continue
		}
		rel, relErr := filepath.Rel(rootResolved, resolved)
		if relErr != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		f, openErr := os.Open(resolved)
		if openErr != nil {
			continue
		}
		defer f.Close()
		info, statErr := f.Stat()
		if statErr != nil {
			return nil, nil, statErr
		}
		if !info.Mode().IsRegular() {
			return nil, info, fmt.Errorf("evidence file is not a regular file")
		}
		data, readErr := io.ReadAll(f)
		return data, info, readErr
	}
	return nil, nil, fmt.Errorf("evidence file is outside managed roots")
}
