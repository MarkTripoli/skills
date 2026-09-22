package paths

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWorkspacePathsHangOffRoot(t *testing.T) {
	root := filepath.Join(string(filepath.Separator), "srv", "sc")
	p := WithRoot(root)
	cases := []struct{ name, got, want string }{
		{"Workspace", p.Workspace(), filepath.Join(root, "workspace")},
		{"RunDir", p.RunDir("RUN1"), filepath.Join(root, "workspace", "runs", "RUN1")},
		{"OnboardCheckpoint", p.OnboardCheckpoint(), filepath.Join(root, "onboard.json")},
	}
	for _, tc := range cases {
		if tc.got != tc.want {
			t.Errorf("%s = %q, want %q", tc.name, tc.got, tc.want)
		}
	}
}

func TestEnsureWorkspaceCreatesOwnerOnlyRunsDir(t *testing.T) {
	p := WithRoot(t.TempDir())
	if err := p.EnsureWorkspace(); err != nil {
		t.Fatal(err)
	}
	for _, dir := range []string{p.Workspace(), filepath.Join(p.Workspace(), "runs")} {
		info, err := os.Stat(dir)
		if err != nil {
			t.Fatal(err)
		}
		if !info.IsDir() {
			t.Fatalf("%s is not a directory", dir)
		}
		if mode := info.Mode().Perm(); mode != 0o700 {
			t.Fatalf("%s mode %o, want 700", dir, mode)
		}
	}
	if err := p.EnsureWorkspace(); err != nil {
		t.Fatalf("second EnsureWorkspace: %v", err)
	}
}
