//go:build windows

package steps

import (
	"io"
	"os"
)

func readConfinedEvidence(path string) ([]byte, os.FileInfo, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, info, os.ErrInvalid
	}
	raw, err := io.ReadAll(f)
	return raw, info, err
}
