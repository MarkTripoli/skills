package agent

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
)

// Files the runner and the agent exchange inside one run directory.
const (
	resultFile   = "result.md"
	proposalFile = "proposal.json"
	stdoutFile   = "stdout.log"
	stderrFile   = "stderr.log"
	metaFile     = "meta.json"
)

// Create makes dir and its parents and forces mode 0700, so a wider umask or
// a pre-existing directory never leaves the run readable by other users.
func Create(dir string) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	return os.Chmod(dir, 0o700)
}

// ReadOutputs returns the agent's final text and where it came from:
// result.md when the agent wrote one (source "result.md"), else the trimmed
// content of finalTextPath (source "stdout"), else empty text with an empty
// source. A missing file is not an error; any other read failure is.
func ReadOutputs(dir, finalTextPath string) (result, source string, err error) {
	b, err := os.ReadFile(filepath.Join(dir, resultFile))
	if err == nil {
		return string(b), "result.md", nil
	}
	if !errors.Is(err, os.ErrNotExist) {
		return "", "", err
	}
	b, err = os.ReadFile(finalTextPath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", "", nil
		}
		return "", "", err
	}
	text := strings.TrimSpace(string(b))
	if text == "" {
		return "", "", nil
	}
	return text, "stdout", nil
}

// Remove deletes the run directory and everything in it.
func Remove(dir string) error {
	return os.RemoveAll(dir)
}
