package e2e

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// TestPublicBinarySmoke ensures the e2e target executes the shipped command
// rather than only calling internal packages.
func TestPublicBinarySmoke(t *testing.T) {
	binary := strings.TrimSpace(os.Getenv("SD_E2E_BINARY"))
	if binary == "" {
		t.Skip("SD_E2E_BINARY is not set")
	}
	for _, args := range [][]string{{"--help"}, {"daemon", "--help"}, {"status", "--help"}} {
		cmd := exec.Command(binary, args...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("%s %v: %v\n%s", binary, args, err, out)
		}
	}
}
