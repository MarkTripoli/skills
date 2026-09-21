//go:build windows

package steps

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func TestReadConfinedEvidenceRejectsJunctionEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	junction := filepath.Join(root, "nested")
	if out, err := exec.Command("cmd", "/c", "mklink", "/J", junction, outside).CombinedOutput(); err != nil {
		t.Skipf("junction creation unavailable: %v (%s)", err, out)
	}
	defer os.Remove(junction)
	if _, _, err := readConfinedEvidence("nested\\secret.txt", root, ""); err == nil {
		t.Fatal("junction escape was accepted")
	}
}
