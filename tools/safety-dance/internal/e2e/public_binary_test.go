package e2e

import (
	"os"
	"os/exec"
	"strings"
	"testing"
)

// TestPublicBinarySmoke exercises the built command against an isolated runtime
// home, not only Cobra help rendering. Full gate journeys remain in e2e_test.go.
func TestPublicBinarySmoke(t *testing.T) {
	binary := strings.TrimSpace(os.Getenv("SD_E2E_BINARY"))
	if binary == "" {
		t.Skip("SD_E2E_BINARY is not set")
	}
	home := t.TempDir()
	run := func(args ...string) string {
		cmd := exec.Command(binary, args...)
		cmd.Env = append(os.Environ(), "SD_HOME="+home)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("%s %v: %v\n%s", binary, args, err, out)
		}
		return string(out)
	}
	if output := run("status"); !strings.Contains(output, "runs: none") {
		t.Fatalf("status output = %q", output)
	}
	for _, args := range [][]string{{"--help"}, {"daemon", "--help"}, {"status", "--help"}} {
		run(args...)
	}
}
