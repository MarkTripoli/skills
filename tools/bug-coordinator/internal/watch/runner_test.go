package watch

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"testing"
	"time"
)

type fakeBugs struct {
	keys   []string
	onHold []string
	err    error
}

func (f *fakeBugs) ScanBugs(context.Context, string) (BugScan, error) {
	return BugScan{Eligible: f.keys, OnHold: f.onHold}, f.err
}

type fakeCodex struct {
	turn    string
	steered []string
	started []string
	err     error
}

func (f *fakeCodex) ActiveTurn(context.Context, string) (string, error) { return f.turn, f.err }
func (f *fakeCodex) Steer(_ context.Context, _, _, message string) error {
	f.steered = append(f.steered, message)
	return f.err
}
func (f *fakeCodex) StartThread(context.Context, string) (string, error) {
	if f.err != nil {
		return "", &noEffectError{f.err}
	}
	return "thread-new", nil
}
func (f *fakeCodex) StartTurn(_ context.Context, _, _, message string) error {
	f.started = append(f.started, message)
	return f.err
}

func TestRunnerSteersActiveOrStartsFresh(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	bugs := &fakeBugs{keys: []string{"DEMO-1"}}
	codex := &fakeCodex{turn: "turn-active"}
	now := time.Unix(1, 0)
	r := Runner{Store: st, Jira: bugs, Codex: codex, Workspace: filepath.Dir(st.Dir), SkillFile: "/skills/video/SKILL.md", BinPath: "/bin/bug-coordinator", Now: func() time.Time { return now }}
	ctx := context.Background()
	if n, err := r.PollOnce(ctx); err != nil || n != 0 {
		t.Fatalf("baseline: %d, %v", n, err)
	}
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
		t.Fatalf("baseline delivery: %q, %v", result, err)
	}
	if err := st.With(func(s *State) error { s.ThreadID = "thread-running"; return nil }); err != nil {
		t.Fatal(err)
	}
	bugs.keys = []string{"DEMO-1", "DEMO-2"}
	if n, err := r.PollOnce(ctx); err != nil || n != 1 {
		t.Fatalf("new Bug: %d, %v", n, err)
	}
	if result, err := r.DeliverOnce(ctx); err != nil || result != "steered" {
		t.Fatalf("active: %q, %v", result, err)
	}
	if len(codex.steered) != 1 || len(codex.started) != 0 {
		t.Fatalf("unexpected Codex calls: %+v", codex)
	}
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
		t.Fatalf("duplicate steering: %q, %v", result, err)
	}
	codex.turn = ""
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
		t.Fatalf("immediate idle retry: %q, %v", result, err)
	}
	now = now.Add(retryDelay)
	if result, err := r.DeliverOnce(ctx); err != nil || result != "started" {
		t.Fatalf("idle: %q, %v", result, err)
	}
	if len(codex.started) != 1 {
		t.Fatalf("new session count = %d", len(codex.started))
	}
	now = now.Add(2 * retryDelay)
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
		t.Fatalf("exhausted retry: %q, %v", result, err)
	}
	if len(codex.started) != 1 {
		t.Fatalf("repeated session count = %d", len(codex.started))
	}
	s, err := st.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if s.ThreadID != "thread-new" || s.Pending["DEMO-2"].NotifiedThread != "thread-new" {
		t.Fatalf("fresh session state: %+v", s)
	}
	if s.Pending["DEMO-2"].Attempts != 2 {
		t.Fatalf("notification attempts = %d", s.Pending["DEMO-2"].Attempts)
	}
	if err := st.With(func(s *State) error { delete(s.Pending, "DEMO-2"); return nil }); err != nil {
		t.Fatal(err)
	}
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
		t.Fatalf("acknowledged: %q, %v", result, err)
	}
}

func TestPollKeepsPendingOnJiraFailure(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	bugs := &fakeBugs{keys: []string{"DEMO-1"}}
	r := Runner{Store: st, Jira: bugs, Codex: &fakeCodex{}}
	_, _ = r.PollOnce(context.Background())
	bugs.keys = []string{"DEMO-1", "DEMO-2"}
	_, _ = r.PollOnce(context.Background())
	bugs.err = errors.New("temporary Jira outage")
	if _, err := r.PollOnce(context.Background()); err == nil {
		t.Fatal("Jira failure was not reported")
	}
	s, err := st.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(s.PendingKeys(), []string{"DEMO-2"}) {
		t.Fatalf("pending after failure: %v", s.PendingKeys())
	}
	if s.LastError == "" {
		t.Fatal("missing diagnostic")
	}
}

func TestIncludeExistingQueuesInitialBugsOnce(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	r := Runner{Store: st, Jira: &fakeBugs{keys: []string{"DEMO-1"}}, Codex: &fakeCodex{}, IncludeExisting: true}
	if n, err := r.PollOnce(context.Background()); err != nil || n != 1 {
		t.Fatalf("first poll: %d, %v", n, err)
	}
	if n, err := r.PollOnce(context.Background()); err != nil || n != 0 {
		t.Fatalf("second poll: %d, %v", n, err)
	}
}

func TestOnHoldCancelsPendingAndReactivationIsNew(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	bugs := &fakeBugs{keys: []string{"DEMO-1"}, onHold: []string{"DEMO-2"}}
	codex := &fakeCodex{}
	r := Runner{Store: st, Jira: bugs, Codex: codex}
	ctx := context.Background()
	if n, err := r.PollOnce(ctx); err != nil || n != 0 {
		t.Fatalf("baseline: %d, %v", n, err)
	}
	bugs.keys = []string{"DEMO-1", "DEMO-2", "DEMO-3"}
	bugs.onHold = nil
	if n, err := r.PollOnce(ctx); err != nil || n != 2 {
		t.Fatalf("reactivation: %d, %v", n, err)
	}
	bugs.keys = []string{"DEMO-1", "DEMO-3"}
	bugs.onHold = []string{"DEMO-2"}
	if n, err := r.PollOnce(ctx); err != nil || n != 0 {
		t.Fatalf("on hold: %d, %v", n, err)
	}
	s, err := st.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(s.PendingKeys(), []string{"DEMO-3"}) || s.Seen["DEMO-2"] {
		t.Fatalf("on hold state: pending=%v seen=%v", s.PendingKeys(), s.Seen)
	}
	if err := st.With(func(s *State) error { delete(s.Pending, "DEMO-3"); return nil }); err != nil {
		t.Fatal(err)
	}
	if result, err := r.DeliverOnce(ctx); err != nil || result != "none" || len(codex.started) != 0 {
		t.Fatalf("held Bug caused a session: result=%q err=%v starts=%d", result, err, len(codex.started))
	}
	bugs.keys = []string{"DEMO-1", "DEMO-2", "DEMO-3"}
	bugs.onHold = nil
	if n, err := r.PollOnce(ctx); err != nil || n != 1 {
		t.Fatalf("eligible again: %d, %v", n, err)
	}
}
