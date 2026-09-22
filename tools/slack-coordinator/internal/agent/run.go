package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Runner starts one agent process per RunSpec.
type Runner interface {
	Start(ctx context.Context, spec RunSpec) (*Handle, error)
}

// Handle is a started run. Wait blocks until the process exits, the ctx
// passed to Start ends, or spec.Timeout elapses; the latter two kill the
// whole process group first. Kill sends SIGKILL to the group at any time.
type Handle struct {
	Pid, Pgid int
	Wait      func() RunOutcome
	Kill      func()
}

// RunOutcome is what a finished run left behind.
type RunOutcome struct {
	ExitCode     int           // -1 when the process was killed
	TimedOut     bool          // group killed on spec.Timeout or ctx end
	Duration     time.Duration // Start to exit
	Proposal     *Proposal     // proposal.json present and valid
	ProposalErr  error         // proposal.json present but invalid
	Result       string        // result.md text, or the trimmed final text file
	ResultSource string        // "result.md" | "stdout" | ""
	StderrTail   string        // last 20 lines of stderr.log
}

// ErrBinaryMissing reports that the adapter's command is not on PATH.
type ErrBinaryMissing struct{ Name string }

func (e ErrBinaryMissing) Error() string {
	return fmt.Sprintf("agent binary %q not found on PATH", e.Name)
}

// stderrTailLines is how many trailing stderr lines an outcome keeps.
const stderrTailLines = 20

// NewRunner returns a Runner that spawns adapter's binary.
func NewRunner(adapter Adapter) Runner {
	return runner{adapter: adapter}
}

type runner struct{ adapter Adapter }

// Start resolves the binary, prepares the run directory, and spawns the agent
// in its own process group with stdout and stderr captured to files. It
// returns ErrBinaryMissing before touching the file system when PATH lacks
// the command.
func (r runner) Start(ctx context.Context, spec RunSpec) (*Handle, error) {
	bin, err := exec.LookPath(r.adapter.Command())
	if err != nil {
		return nil, ErrBinaryMissing{Name: r.adapter.Command()}
	}
	if err := Create(spec.RunDir); err != nil {
		return nil, fmt.Errorf("create run dir: %w", err)
	}
	stdout, err := createLog(spec.RunDir, stdoutFile)
	if err != nil {
		return nil, err
	}
	defer stdout.Close()
	stderr, err := createLog(spec.RunDir, stderrFile)
	if err != nil {
		return nil, err
	}
	defer stderr.Close()

	cmd := exec.Command(bin, r.adapter.Args(spec)...)
	cmd.Dir = spec.RunDir
	// A nil Stdin makes exec open os.DevNull for the child; same effect as
	// opening /dev/null here without a descriptor to manage.
	cmd.Stdout = stdout
	cmd.Stderr = stderr
	cmd.Env = scrubEnv(os.Environ())
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	started := time.Now()
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start %s: %w", r.adapter.Command(), err)
	}
	pid := cmd.Process.Pid
	pgid, err := syscall.Getpgid(pid)
	if err != nil {
		pgid = pid // Setpgid made the child its own group leader
	}
	kill := func() { _ = syscall.Kill(-pgid, syscall.SIGKILL) }

	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	var (
		once    sync.Once
		outcome RunOutcome
	)
	wait := func() RunOutcome {
		once.Do(func() {
			outcome = r.wait(ctx, spec, cmd, exited, kill, started)
		})
		return outcome
	}
	return &Handle{Pid: pid, Pgid: pgid, Wait: wait, Kill: kill}, nil
}

// wait blocks for exit, ctx end, or timeout; then collects outputs and writes
// meta.json. Output read or meta write failures leave the corresponding
// fields empty: the outcome has no error slot, and the process result is
// still worth returning.
func (r runner) wait(ctx context.Context, spec RunSpec, cmd *exec.Cmd, exited <-chan error, kill func(), started time.Time) RunOutcome {
	var timeout <-chan time.Time
	if spec.Timeout > 0 {
		t := time.NewTimer(spec.Timeout)
		defer t.Stop()
		timeout = t.C
	}

	var out RunOutcome
	select {
	case <-exited:
	case <-ctx.Done():
		kill()
		<-exited
		out.TimedOut = true
	case <-timeout:
		kill()
		<-exited
		out.TimedOut = true
	}
	out.Duration = time.Since(started)
	out.ExitCode = -1
	if cmd.ProcessState != nil {
		out.ExitCode = cmd.ProcessState.ExitCode()
	}

	out.Result, out.ResultSource, _ = ReadOutputs(spec.RunDir, r.adapter.FinalTextPath(spec.RunDir))
	out.Proposal, out.ProposalErr = ReadProposal(spec.RunDir)
	out.StderrTail, _ = tailLines(filepath.Join(spec.RunDir, stderrFile), stderrTailLines)
	_ = writeMeta(spec.RunDir, out)
	return out
}

// meta is the meta.json shape a purge or !show reads later.
type meta struct {
	ExitCode     int    `json:"exit_code"`
	DurationMS   int64  `json:"duration_ms"`
	TimedOut     bool   `json:"timed_out"`
	ResultSource string `json:"result_source"`
}

func writeMeta(dir string, out RunOutcome) error {
	b, err := json.Marshal(meta{
		ExitCode:     out.ExitCode,
		DurationMS:   out.Duration.Milliseconds(),
		TimedOut:     out.TimedOut,
		ResultSource: out.ResultSource,
	})
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, metaFile), b, 0o600)
}

func createLog(dir, name string) (*os.File, error) {
	f, err := os.OpenFile(filepath.Join(dir, name), os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return nil, fmt.Errorf("create %s: %w", name, err)
	}
	return f, nil
}

// scrubEnv drops the daemon's secrets and its home from the agent's
// environment so a run can neither post as the bot nor read config.yaml.
func scrubEnv(env []string) []string {
	out := make([]string, 0, len(env))
	for _, kv := range env {
		name, _, _ := strings.Cut(kv, "=")
		switch name {
		case "SLACK_BOT_TOKEN", "SLACK_APP_TOKEN", "JIRA_API_TOKEN", "SLACK_COORDINATOR_HOME":
			continue
		}
		out = append(out, kv)
	}
	return out
}

// tailLines returns the last n lines of the file at path, reading backwards
// in fixed chunks so a large log is not loaded whole. A missing file yields
// an empty string and no error.
func tailLines(path string, n int) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return "", nil
		}
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return "", err
	}

	const chunk = 8 << 10
	var buf []byte
	for end := info.Size(); end > 0; {
		start := max(end-chunk, 0)
		part := make([]byte, end-start)
		if _, err := f.ReadAt(part, start); err != nil && err != io.EOF {
			return "", err
		}
		buf = append(part, buf...)
		// n+1 newlines guarantee n complete lines even when the file ends
		// with a newline.
		if bytes.Count(buf, []byte{'\n'}) > n {
			break
		}
		end = start
	}
	buf = bytes.TrimSuffix(buf, []byte{'\n'})
	if len(buf) == 0 {
		return "", nil
	}
	lines := bytes.Split(buf, []byte{'\n'})
	if len(lines) > n {
		lines = lines[len(lines)-n:]
	}
	return string(bytes.Join(lines, []byte{'\n'})), nil
}
