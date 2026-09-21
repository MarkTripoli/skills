package daemon

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
)

// TestExecutableGateAdmission runs the generated hooks as Git executables. It
// deliberately builds the private helper instead of relying on a package-level
// function call, proving the process and authenticated IPC boundaries together.
func TestExecutableGateAdmission(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("generated hooks use /bin/sh and Unix IPC")
	}
	base := t.TempDir()
	home := filepath.Join(base, "home")
	if err := os.MkdirAll(home, 0o755); err != nil {
		t.Fatal(err)
	}
	helper := filepath.Join(base, "hook-helper")
	build := exec.Command("go", "build", "-o", helper, "./internal/git/testdata/hook-helper")
	build.Dir = filepath.Join("..", "..")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build hook helper: %v\n%s", err, out)
	}

	socket := filepath.Join(os.TempDir(), "sd-"+filepath.Base(base)+".sock")
	t.Cleanup(func() { _ = os.Remove(socket) })
	server := ipc.NewServer()
	var mu sync.Mutex
	var notifications []PushNotification
	admission := NewAdmission(server, func(_ context.Context, n PushNotification) error {
		mu.Lock()
		notifications = append(notifications, n)
		mu.Unlock()
		return nil
	})
	if err := server.Listen(socket); err != nil {
		t.Fatal(err)
	}
	serveDone := make(chan struct{})
	go func() { _ = server.ServeReady(); close(serveDone) }()
	defer func() {
		server.Close()
		<-serveDone
	}()

	gate := filepath.Join(base, "gate.git")
	gate2 := filepath.Join(base, "gate2.git")
	for _, path := range []string{gate, gate2} {
		runGitOrFatal(t, base, "init", "--bare", path)
		runGitOrFatal(t, path, "config", "receive.advertisePushOptions", "true")
	}
	// Install a user hook first. Refresh must preserve it behind the managed
	gate, _ = filepath.EvalSymlinks(gate)
	gate2, _ = filepath.EvalSymlinks(gate2)
	// wrapper, and Git must still provide it the original ref-update input.
	marker := filepath.Join(base, "preserved-input")
	custom := "#!/bin/sh\ncat > " + shellSingleQuote(marker) + "\n"
	if err := os.WriteFile(filepath.Join(gate, "hooks", "pre-receive"), []byte(custom), 0o755); err != nil {
		t.Fatal(err)
	}
	if _, err := git.RefreshManagedPreReceiveHook(gate); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(gate, "hooks", "pre-receive"), []byte(git.PreReceiveHookScriptForExecutable(helper)), 0o755); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{gate, gate2} {
		if err := os.WriteFile(filepath.Join(path, "hooks", "post-receive"), []byte(git.PostReceiveHookScriptForExecutable(helper)), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	work := filepath.Join(base, "work")
	runGitOrFatal(t, base, "init", work)
	runGitOrFatal(t, work, "config", "user.email", "test@example.com")
	runGitOrFatal(t, work, "config", "user.name", "Safety Dance")
	runGitOrFatal(t, work, "remote", "add", "gate", gate)
	runGitOrFatal(t, work, "remote", "add", "gate2", gate2)
	runGitOrFatal(t, work, "commit", "--allow-empty", "-m", "initial")

	env := append(os.Environ(), "SD_HOME="+home, "SD_SOCKET="+socket)
	push := func(remote, token string) ([]byte, error) {
		cmd := exec.Command("git", "-C", work, "-c", "receive.advertisePushOptions=true", "push", "-o", "safety-dance-token="+token, remote, "HEAD:refs/heads/main")
		cmd.Env = env
		return cmd.CombinedOutput()
	}
	// No token must reject before the ref is created.
	if out, err := push("gate", ""); err == nil {
		t.Fatalf("unauthenticated push unexpectedly succeeded: %s", out)
	}
	if refExists(gate) {
		t.Fatalf("unauthenticated push mutated gate")
	}

	ref := "refs/heads/main"
	token, err := admission.Issue(gate, ref)
	if err != nil {
		t.Fatal(err)
	}
	if out, err := push("gate", token); err != nil {
		t.Fatalf("authenticated push failed: %v\n%s", err, out)
	}
	if _, err := os.Stat(filepath.Join(gate, "hooks", "pre-receive.safety-dance-user")); err != nil {
		t.Fatalf("preserved hook missing: %v", err)
	}
	if got, err := os.ReadFile(marker); err != nil || !strings.Contains(string(got), ref) {
		t.Fatalf("preserved hook input missing ref %q: %v (%q)", ref, err, got)
	}
	waitFor(t, func() bool { mu.Lock(); defer mu.Unlock(); return len(notifications) == 1 })
	mu.Lock()
	n := notifications[0]
	mu.Unlock()
	if n.Gate != gate || n.Ref != ref || n.New == "" || len(n.Options) != 1 || n.Options[0] != "safety-dance-token="+token {
		t.Fatalf("notification = %#v", n)
	}

	// A consumed token cannot be replayed, and a token bound to another gate
	// cannot authorize that gate.
	runGitOrFatal(t, work, "commit", "--allow-empty", "-m", "second")
	if out, err := push("gate", token); err == nil {
		t.Fatalf("replayed token unexpectedly succeeded: %s", out)
	}
	mismatch, err := admission.Issue(gate2, ref)
	if err != nil {
		t.Fatal(err)
	}
	if out, err := push("gate", mismatch); err == nil {
		t.Fatalf("mismatched gate unexpectedly succeeded: %s", out)
	}
	if !refExists(gate2) {
		// gate2 remains untouched because the token was bound to it, while the
		// hook received gate as its authenticated gate identity.
		return
	}
	t.Fatalf("mismatched push unexpectedly changed gate2")
}

func waitFor(t *testing.T, condition func() bool) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if condition() {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for asynchronous notification")
}

func refExists(dir string) bool {
	cmd := exec.Command("git", "-C", dir, "show-ref", "--hash", "--heads", "main")
	return cmd.Run() == nil
}

func runGitOrFatal(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s: %v: %s", strings.Join(args, " "), err, out)
	}
	return string(out)
}

func shellSingleQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}
