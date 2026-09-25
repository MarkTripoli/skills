package agent

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"
)

// fakeAdapter runs testdata/fake-agent.sh and reads stdout.log as the final
// text, like the pi and claude rows.
type fakeAdapter struct{ command string }

func (a fakeAdapter) Command() string                  { return a.command }
func (fakeAdapter) Args(RunSpec) []string              { return nil }
func (fakeAdapter) FinalTextPath(runDir string) string { return filepath.Join(runDir, "stdout.log") }

// fakeRun points PATH at testdata, selects a fake-agent.sh mode, and returns
// the runner plus a spec whose RunDir does not exist yet.
func fakeRun(t *testing.T, mode, text string, timeout time.Duration) (Runner, RunSpec) {
	t.Helper()
	testdata, err := filepath.Abs("testdata")
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", testdata+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("FAKE_MODE", mode)
	t.Setenv("FAKE_TEXT", text)
	spec := RunSpec{RunDir: filepath.Join(t.TempDir(), "runs", "RUN1"), Approval: "edits", Timeout: timeout}
	return NewRunner(fakeAdapter{command: "fake-agent.sh"}), spec
}

func readMeta(t *testing.T, dir string) map[string]any {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, "meta.json"))
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("meta.json: %v", err)
	}
	return m
}

func TestStartCreatesPrivateRunDirAndReadsResultFile(t *testing.T) {
	r, spec := fakeRun(t, "result", "the answer\n", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	if h.Pgid != h.Pid {
		t.Fatalf("Pgid = %d, Pid = %d; want the child to lead its own group", h.Pgid, h.Pid)
	}
	out := h.Wait()

	info, err := os.Stat(spec.RunDir)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("run dir mode = %o, want 700", got)
	}
	for _, name := range []string{"stdout.log", "stderr.log", "meta.json"} {
		info, err := os.Stat(filepath.Join(spec.RunDir, name))
		if err != nil {
			t.Fatal(err)
		}
		if got := info.Mode().Perm(); got != 0o600 {
			t.Errorf("%s mode = %o, want 600", name, got)
		}
	}

	if out.ExitCode != 0 || out.TimedOut {
		t.Errorf("ExitCode = %d, TimedOut = %v; want 0, false", out.ExitCode, out.TimedOut)
	}
	if out.Result != "the answer\n" || out.ResultSource != "result.md" {
		t.Errorf("Result = %q, ResultSource = %q; want result.md text", out.Result, out.ResultSource)
	}
	if out.Duration <= 0 {
		t.Errorf("Duration = %v, want positive", out.Duration)
	}

	m := readMeta(t, spec.RunDir)
	if m["exit_code"] != float64(0) || m["timed_out"] != false || m["result_source"] != "result.md" {
		t.Errorf("meta.json = %v", m)
	}
	if ms, ok := m["duration_ms"].(float64); !ok || ms < 0 {
		t.Errorf("meta.json duration_ms = %v", m["duration_ms"])
	}
}

func TestTimeoutKillsProcessGroup(t *testing.T) {
	r, spec := fakeRun(t, "sleep", "", 200*time.Millisecond)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	childPid := waitChildPid(t, spec.RunDir)

	out := h.Wait()
	if !out.TimedOut {
		t.Fatal("TimedOut = false after the 200ms timeout")
	}
	if out.ExitCode != -1 {
		t.Errorf("ExitCode = %d, want -1 for a killed process", out.ExitCode)
	}
	if out.Duration < 200*time.Millisecond {
		t.Errorf("Duration = %v, want at least the timeout", out.Duration)
	}
	waitGone(t, childPid)

	m := readMeta(t, spec.RunDir)
	if m["timed_out"] != true || m["exit_code"] != float64(-1) || m["result_source"] != "" {
		t.Errorf("meta.json = %v", m)
	}
}

func TestContextEndKillsProcessGroup(t *testing.T) {
	r, spec := fakeRun(t, "sleep", "", time.Minute)
	ctx, cancel := context.WithCancel(context.Background())
	h, err := r.Start(ctx, spec)
	if err != nil {
		t.Fatal(err)
	}
	childPid := waitChildPid(t, spec.RunDir)
	cancel()

	out := h.Wait()
	if !out.TimedOut || out.ExitCode != -1 {
		t.Errorf("TimedOut = %v, ExitCode = %d; want true, -1", out.TimedOut, out.ExitCode)
	}
	waitGone(t, childPid)
}

func TestEnvironmentDropsSecretsAndHome(t *testing.T) {
	names := []string{"SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "SLACK_COORDINATOR_HOME"}
	for _, name := range names {
		t.Setenv(name, "secret-"+name)
	}
	t.Setenv("KEEP_ME", "kept")
	r, spec := fakeRun(t, "env", "", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.ResultSource != "result.md" {
		t.Fatalf("ResultSource = %q, want result.md", out.ResultSource)
	}
	for _, name := range names {
		if strings.Contains(out.Result, name+"=") {
			t.Errorf("agent environment still carries %s", name)
		}
	}
	if !strings.Contains(out.Result, "KEEP_ME=kept") {
		t.Errorf("agent environment lost an unrelated variable:\n%s", out.Result)
	}
}

func TestResultFallsBackToTrimmedStdout(t *testing.T) {
	r, spec := fakeRun(t, "stdout", "  from stdout  ", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.Result != "from stdout" || out.ResultSource != "stdout" {
		t.Errorf("Result = %q, ResultSource = %q; want trimmed stdout", out.Result, out.ResultSource)
	}
	if m := readMeta(t, spec.RunDir); m["result_source"] != "stdout" {
		t.Errorf("meta.json result_source = %v", m["result_source"])
	}
}

func TestProposalIsValidatedAlongsideResult(t *testing.T) {
	r, spec := fakeRun(t, "proposal", "the report\n", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.ProposalErr != nil {
		t.Fatalf("ProposalErr = %v", out.ProposalErr)
	}
	if out.Proposal == nil {
		t.Fatal("Proposal = nil for a valid proposal.json")
	}
	if out.Proposal.Trigger.Kind != TriggerSchedule || out.Proposal.Trigger.Daily != "09:00" || !out.Proposal.DeliverTo.DM {
		t.Errorf("Proposal = %+v", *out.Proposal)
	}
	if out.Result != "the report\n" || out.ResultSource != "result.md" {
		t.Errorf("Result = %q, ResultSource = %q; want result.md text beside the proposal", out.Result, out.ResultSource)
	}
}

func TestInvalidProposalSetsProposalErr(t *testing.T) {
	r, spec := fakeRun(t, "result", "the report\n", 5*time.Second)
	if err := Create(spec.RunDir); err != nil {
		t.Fatal(err)
	}
	writeProposalFile(t, spec.RunDir, `{"watch": ["C123"], "trigger": {"kind": "schedule"}, "instruction": "x", "deliver_to": {"dm": true}}`)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.Proposal != nil || out.ProposalErr == nil || !strings.Contains(out.ProposalErr.Error(), "trigger: schedule needs exactly one of daily or every_hours") {
		t.Errorf("Proposal = %+v, ProposalErr = %v; want nil and a trigger error", out.Proposal, out.ProposalErr)
	}
	if out.Result != "the report\n" {
		t.Errorf("Result = %q, want result.md text despite the bad proposal", out.Result)
	}
}

func TestNoOutputYieldsEmptySource(t *testing.T) {
	r, spec := fakeRun(t, "empty", "", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.ExitCode != 0 || out.Result != "" || out.ResultSource != "" || out.StderrTail != "" {
		t.Errorf("outcome = %+v; want exit 0 and no output", out)
	}
}

func TestFailureKeepsExitCodeAndLastTwentyStderrLines(t *testing.T) {
	r, spec := fakeRun(t, "fail", "", 5*time.Second)
	h, err := r.Start(context.Background(), spec)
	if err != nil {
		t.Fatal(err)
	}
	out := h.Wait()
	if out.ExitCode != 3 || out.TimedOut {
		t.Errorf("ExitCode = %d, TimedOut = %v; want 3, false", out.ExitCode, out.TimedOut)
	}
	lines := strings.Split(out.StderrTail, "\n")
	if len(lines) != 20 || lines[0] != "line 6" || lines[19] != "line 25" {
		t.Errorf("StderrTail has %d lines, first %q, last %q; want 20 from line 6 to line 25", len(lines), lines[0], lines[len(lines)-1])
	}
}

func TestStartReportsMissingBinaryBeforeCreatingAnything(t *testing.T) {
	_, spec := fakeRun(t, "result", "", 5*time.Second)
	r := NewRunner(fakeAdapter{command: "no-such-agent-binary"})
	h, err := r.Start(context.Background(), spec)
	if h != nil {
		t.Fatalf("Start returned handle %+v for a missing binary", h)
	}
	var missing ErrBinaryMissing
	if !errors.As(err, &missing) || missing.Name != "no-such-agent-binary" {
		t.Fatalf("err = %v, want ErrBinaryMissing naming the command", err)
	}
	if want := (ErrBinaryMissing{Name: "no-such-agent-binary"}).Error(); err.Error() != want {
		t.Errorf("error = %q, want %q", err.Error(), want)
	}
	if _, statErr := os.Stat(spec.RunDir); !errors.Is(statErr, os.ErrNotExist) {
		t.Errorf("run dir exists after a missing-binary failure: %v", statErr)
	}
}

func TestTailLinesReadsAcrossChunkBoundary(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stderr.log")
	var b strings.Builder
	for i := 1; i <= 3000; i++ {
		b.WriteString("line ")
		b.WriteString(strconv.Itoa(i))
		b.WriteString(" ")
		b.WriteString(strings.Repeat("x", 40))
		b.WriteByte('\n')
	}
	if err := os.WriteFile(path, []byte(b.String()), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := tailLines(path, 300)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(got, "\n")
	if len(lines) != 300 || !strings.HasPrefix(lines[0], "line 2701 ") || !strings.HasPrefix(lines[299], "line 3000 ") {
		t.Errorf("tail has %d lines, first %q, last %q", len(lines), lines[0], lines[len(lines)-1])
	}
}

// waitChildPid polls for child.pid, which fake-agent.sh writes after forking
// its sleep.
func waitChildPid(t *testing.T, runDir string) int {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		b, err := os.ReadFile(filepath.Join(runDir, "child.pid"))
		if err == nil {
			if pid, err := strconv.Atoi(strings.TrimSpace(string(b))); err == nil && pid > 0 {
				return pid
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("fake agent never wrote child.pid")
	return 0
}

// waitGone asserts the forked child is gone within one second of the group
// kill: kill(pid, 0) answers ESRCH once it is dead and reaped.
func waitGone(t *testing.T, pid int) {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("forked child %d still alive one second after the group kill", pid)
}
