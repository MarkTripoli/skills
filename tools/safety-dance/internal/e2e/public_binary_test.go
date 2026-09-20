package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestPublicBinarySmoke exercises the built command against an isolated runtime
// home, including init, the daemon lifecycle, generated receive hooks, and
// durable post-receive reconciliation.
func TestPublicBinarySmoke(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("generated git hooks use /bin/sh")
	}
	binary := strings.TrimSpace(os.Getenv("SD_E2E_BINARY"))
	if binary == "" {
		t.Skip("SD_E2E_BINARY is not set")
	}
	home := t.TempDir()
	root := t.TempDir()
	work := filepath.Join(root, "work")
	upstream := filepath.Join(root, "upstream.git")
	gitRun(t, root, "init", "--bare", upstream)
	gitRun(t, root, "init", "-b", "main", work)
	gitRun(t, work, "config", "user.email", "e2e@example.com")
	gitRun(t, work, "config", "user.name", "Safety Dance E2E")
	if err := os.WriteFile(filepath.Join(work, "README"), []byte("initial\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	gitRun(t, work, "add", "README")
	gitRun(t, work, "commit", "-m", "initial")
	gitRun(t, work, "remote", "add", "origin", upstream)
	gitRun(t, work, "push", "origin", "HEAD:refs/heads/main")

	run := func(dir string, args ...string) string {
		cmd := exec.Command(binary, args...)
		cmd.Dir = dir
		cmd.Env = append(os.Environ(), "SD_HOME="+home)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("%s %v: %v\n%s", binary, args, err, out)
		}
		return string(out)
	}
	run(work, "init")
	run(work, "daemon", "start")
	t.Cleanup(func() { _ = exec.Command(binary, "daemon", "stop").Run() })
	if status := run(work, "status"); !strings.Contains(status, "runs: none") {
		t.Fatalf("initial status = %q", status)
	}
	gate := gitRun(t, work, "remote", "get-url", "safety-dance")
	for _, hook := range []string{"pre-receive", "post-receive"} {
		content, err := os.ReadFile(filepath.Join(gate, "hooks", hook))
		if err != nil {
			t.Fatalf("read generated %s hook: %v", hook, err)
		}
		if !strings.Contains(string(content), "safety-dance") {
			t.Fatalf("generated %s hook does not invoke Safety Dance", hook)
		}
	}
	run(work, "daemon", "restart")
	if status := run(work, "daemon", "status"); !strings.Contains(status, "ok") {
		t.Fatalf("restarted daemon status = %q", status)
	}
	run(work, "daemon", "stop")
}

func gitRun(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}
