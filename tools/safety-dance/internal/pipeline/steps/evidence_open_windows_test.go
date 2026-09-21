//go:build windows

package steps

import (
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
)

func TestReadConfinedEvidenceRejectsRootReplacementRace(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.Mkdir(filepath.Join(root, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	var once sync.Once
	beforeEvidenceCandidateOpen = func(_, _ string) error {
		once.Do(func() {
			managed := filepath.Join(root, "nested")
			backup := filepath.Join(root, "nested-original")
			if err := os.Rename(managed, backup); err != nil {
				t.Fatal(err)
			}
			out, err := exec.Command("cmd", "/c", "mklink", "/J", managed, outside).CombinedOutput()
			if err != nil {
				t.Fatalf("create replacement junction: %v (%s)", err, out)
			}
		})
		return nil
	}
	t.Cleanup(func() { beforeEvidenceCandidateOpen = nil })
	if _, _, err := readConfinedEvidence("nested\\secret.txt", root, ""); err == nil {
		t.Fatal("root replacement race selected an outside file")
	}
}
