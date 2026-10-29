package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDefaultsApplyToEmptyFile(t *testing.T) {
	c, err := Parse("")
	if err != nil {
		t.Fatal(err)
	}
	if c.MaxFPS != 15 || len(c.CDPPorts) != 1 || c.CDPPorts[0] != 9222 {
		t.Fatalf("%+v", c)
	}
}

func TestRemotesAndLabels(t *testing.T) {
	c, err := Parse("host_label = \"box\"\nmax_fps = 5\n[[remotes]]\nname = \"mac\"\nlabel = \"Mac mini\"\ncommand = [\"ssh\", \"-T\", \"host\"]\n")
	if err != nil {
		t.Fatal(err)
	}
	if c.Host() != "box" || c.MaxFPS != 5 || c.Remotes[0].Label != "Mac mini" || c.Remotes[0].Command[0] != "ssh" {
		t.Fatalf("%+v", c)
	}
	if h := Default().Host(); h == "" || strings.Contains(h, ".") {
		t.Fatalf("host %q", h)
	}
}

func TestRemoteValidation(t *testing.T) {
	for _, bad := range []string{
		"[[remotes]]\nname = \"a/b\"\ncommand = [\"x\"]\n",
		"[[remotes]]\nname = \"a\"\n",
		"max_fps = \"fast\"\n",
	} {
		if _, err := Parse(bad); err == nil {
			t.Errorf("accepted %q", bad)
		}
	}
}

func TestLoadUsesEnvPathAndMissingIsDefault(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("SIMVIEW_CONFIG", filepath.Join(dir, "none.toml"))
	if c, err := Load(); err != nil || c.MaxFPS != 15 {
		t.Fatalf("%v %+v", err, c)
	}
	p := filepath.Join(dir, "c.toml")
	os.WriteFile(p, []byte("max_fps = 7\n"), 0o600)
	t.Setenv("SIMVIEW_CONFIG", p)
	if c, err := Load(); err != nil || c.MaxFPS != 7 {
		t.Fatalf("%v %+v", err, c)
	}
	os.WriteFile(p, []byte("max_fps = ["), 0o600)
	if _, err := Load(); err == nil {
		t.Fatal("broken file accepted")
	}
}
