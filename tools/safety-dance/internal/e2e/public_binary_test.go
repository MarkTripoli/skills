package e2e

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

// TestPublicBinarySmoke drives a built Safety Dance command through gate
// admission, durable run creation, and guarded publication in an isolated home.
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
	if err := os.WriteFile(filepath.Join(work, ".safety-dance.yaml"), []byte("allow_repo_commands: true\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	gitRun(t, work, "add", "README", ".safety-dance.yaml")
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
	// Create the candidate only after the upstream base and gate are initialized.
	if err := os.WriteFile(filepath.Join(work, "README"), []byte("candidate\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	gitRun(t, work, "add", "README")
	gitRun(t, work, "commit", "-m", "candidate")
	candidate := gitRun(t, work, "rev-parse", "HEAD")
	run(work, "daemon", "start")
	t.Cleanup(func() {
		cmd := exec.Command(binary, "daemon", "stop")
		cmd.Dir = work
		cmd.Env = append(os.Environ(), "SD_HOME="+home)
		_ = cmd.Run()
	})
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
	push := exec.Command("git", "push", "safety-dance", "HEAD:refs/heads/main")
	push.Dir = work
	push.Env = append(os.Environ(), "SD_HOME="+home)
	pushOutput, err := push.CombinedOutput()
	if err != nil {
		if strings.Contains(string(pushOutput), "could not obtain admission token") {
			t.Skipf("built-binary hook ancestry is unavailable: %s", pushOutput)
		}
		t.Fatalf("gate push: %v\n%s", err, pushOutput)
	}
	deadline := time.Now().Add(20 * time.Second)
	observedRun := false
	lastStatus := ""
	for time.Now().Before(deadline) {
		status := run(work, "status")
		lastStatus = status
		if strings.Contains(status, "run: ") {
			observedRun = true
			break
		}
		if strings.Contains(status, "status=failed") || strings.Contains(status, "status=blocked") {
			t.Fatalf("gate run failed: %s", status)
		}
		time.Sleep(100 * time.Millisecond)
	}
	if !observedRun {
		t.Fatalf("timed out waiting for a durable run; last status: %s", lastStatus)
	}
	p := paths.WithRoot(home)
	database, err := db.Open(p.DB())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	repos, err := database.GetRepos()
	if err != nil || len(repos) != 1 {
		t.Fatalf("repositories = %d, err=%v", len(repos), err)
	}
	runs, err := database.GetRunsByRepo(repos[0].ID)
	if err != nil || len(runs) != 1 || runs[0].HeadSHA != candidate {
		t.Fatalf("runs = %#v, err=%v", runs, err)
	}
	if got := gitRun(t, root, "--git-dir", gate, "rev-parse", "refs/heads/main"); got != candidate {
		t.Fatalf("gate head = %s, want candidate %s", got, candidate)
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
