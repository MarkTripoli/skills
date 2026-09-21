package steps

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConfinedEvidencePathRejectsHostAndSymlinkEscape(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.txt"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := confinedEvidencePath(filepath.Join(outside, "secret.txt"), root, filepath.Join(root, "evidence")); err == nil {
		t.Fatal("absolute host path was accepted")
	}
	link := filepath.Join(root, "link.txt")
	if err := os.Symlink(filepath.Join(outside, "secret.txt"), link); err != nil {
		t.Fatal(err)
	}
	if _, err := confinedEvidencePath("link.txt", root, filepath.Join(root, "evidence")); err == nil {
		t.Fatal("symlink escape was accepted")
	}
}

func TestMergeEvidenceBodyPreservesAuthoredText(t *testing.T) {
	got := mergeEvidenceBody("Authored text", "## Safety Dance evidence\n\n- item")
	if !strings.HasPrefix(got, "Authored text\n\n") || !strings.Contains(got, "<!-- safety-dance:evidence -->") {
		t.Fatalf("authored body was not preserved: %q", got)
	}
	updated := mergeEvidenceBody(got, "new evidence")
	if strings.Count(updated, "safety-dance:evidence") != 2 || strings.Contains(updated, "- item") {
		t.Fatalf("evidence section was not replaced: %q", updated)
	}
}
