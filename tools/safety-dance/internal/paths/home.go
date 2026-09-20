package paths

import (
	"os"
	"path/filepath"
)

// Home resolves the Safety Dance runtime root from SD_HOME or the user's home directory.
func Home() (string, error) {
	if root := os.Getenv("SD_HOME"); root != "" {
		return filepath.Abs(root)
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".safety-dance"), nil
}
