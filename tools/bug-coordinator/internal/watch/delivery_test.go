package watch

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// deliveryServer models acceptance independently from receipt of the reply.
// It reads the actual state file at each external side-effect boundary.
type deliveryServer struct {
	t             *testing.T
	store         Store
	mu            sync.Mutex
	failMethod    string
	failure       appServerReply
	reject        bool
	failed        bool
	threadStarts  int
	turnStarts    int
	steers        int
	activeOwners  int
	currentThread string
}

func (f *deliveryServer) handle(req appServerRequest) appServerReply {
	f.mu.Lock()
	defer f.mu.Unlock()
	if req.Method == "thread/read" {
		status := "idle"
		var turns []map[string]string
		if f.activeOwners != 0 {
			status = "active"
			turns = []map[string]string{{"id": "turn-active", "status": "inProgress"}}
		}
		return appServerReply{result: map[string]any{"thread": map[string]any{"status": map[string]string{"type": status}, "turns": turns}}}
	}
	data, err := os.ReadFile(f.store.path())
	var s State
	if err != nil {
		f.t.Errorf("read write-ahead state: %v", err)
	} else if err := json.Unmarshal(data, &s); err != nil {
		f.t.Errorf("decode write-ahead state: %v", err)
	}
	d := s.DeliveryIntent
	if d == nil || d.ID == "" {
		f.t.Error("external operation sent without durable notification intent")
		return appServerReply{drop: true}
	}
	for _, key := range d.Keys {
		e := s.Pending[key]
		if e.Attempts < 1 || e.Attempts > maxNotifications || !e.LastNotified.Equal(d.CreatedAt) {
			f.t.Errorf("attempt not durably reserved before %s: %+v", req.Method, e)
		}
	}
	var p struct {
		ThreadID            string `json:"threadId"`
		ClientUserMessageID string `json:"clientUserMessageId"`
		Input               []struct {
			Text string `json:"text"`
		} `json:"input"`
	}
	if err := json.Unmarshal(req.Params, &p); err != nil {
		f.t.Errorf("decode operation params: %v", err)
	}
	if req.Method != "thread/start" {
		if p.ThreadID != s.ThreadID || p.ThreadID != d.ThreadID || p.ThreadID == "" {
			f.t.Errorf("thread not durably attached before %s: params=%+v state=%+v", req.Method, p, s)
		}
		for _, key := range d.Keys {
			if s.Pending[key].NotifiedThread != p.ThreadID {
				f.t.Errorf("ack ownership not saved before %s", req.Method)
			}
		}
		if len(p.Input) != 1 || !strings.Contains(p.Input[0].Text, d.ID) {
			f.t.Errorf("notification missing stable intent ID: %+v", p)
		}
	}
	if req.Method == "turn/start" && p.ClientUserMessageID != d.ID {
		f.t.Errorf("turn nonce = %q, durable intent = %q", p.ClientUserMessageID, d.ID)
	}
	fail := req.Method == f.failMethod && !f.failed
	if fail {
		f.failed = true
		if f.reject {
			return f.failure
		}
	}
	var result any = map[string]any{}
	switch req.Method {
	case "thread/start":
		if d.Phase != "thread-start" || d.ThreadID != "" {
			f.t.Errorf("thread creation checkpoint: %+v", d)
		}
		f.threadStarts++
		f.currentThread = fmt.Sprintf("thread-%d", f.threadStarts)
		result = map[string]any{"thread": map[string]string{"id": f.currentThread}}
	case "turn/start":
		if d.Phase != "turn-start" {
			f.t.Errorf("turn start checkpoint: %+v", d)
		}
		f.turnStarts++
		f.activeOwners++
		if f.activeOwners > 1 {
			f.t.Error("launched a second concurrent owner")
		}
	case "turn/steer":
		if d.Phase != "steer" {
			f.t.Errorf("steering checkpoint: %+v", d)
		}
		f.steers++
	default:
		f.t.Errorf("unexpected method %s", req.Method)
	}
	if fail {
		return f.failure
	}
	return appServerReply{result: result}
}

func (f *deliveryServer) counts() [4]int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return [4]int{f.threadStarts, f.turnStarts, f.steers, f.activeOwners}
}

func TestLostDeliveryReplySurvivesReloadAndRequiresReconciliation(t *testing.T) {
	for _, method := range []string{"thread/start", "turn/start", "turn/steer"} {
		t.Run(method, func(t *testing.T) {
			st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
			fake := &deliveryServer{t: t, store: st, failMethod: method, failure: appServerReply{drop: true}}
			if method == "turn/steer" {
				fake.activeOwners = 1
			}
			app := fakeAppServer(t, fake.handle)
			bugs := &fakeBugs{keys: []string{"DEMO-2"}}
			now := time.Unix(100, 0).UTC()
			r := Runner{Store: st, Jira: bugs, Codex: app, IncludeExisting: true, Now: func() time.Time { return now }}
			ctx := context.Background()
			if n, err := r.PollOnce(ctx); err != nil || n != 1 {
				t.Fatalf("initial discovery: %d, %v", n, err)
			}
			if method == "turn/steer" {
				if err := st.With(func(s *State) error { return s.Attach("thread-existing", "") }); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := r.DeliverOnce(ctx); err == nil || hasNoEffect(err) {
				t.Fatalf("lost accepted reply must be ambiguous: %v", err)
			}
			s, err := st.Snapshot()
			if err != nil {
				t.Fatal(err)
			}
			d := s.DeliveryIntent
			e := s.Pending["DEMO-2"]
			if d == nil || d.LastError == "" || e.Attempts != 1 || !e.LastNotified.Equal(now) {
				t.Fatalf("missing durable uncertainty/attempts: %+v, %+v", d, e)
			}
			if method != "thread/start" && (d.ThreadID == "" || e.NotifiedThread != d.ThreadID || s.ThreadID != d.ThreadID) {
				t.Fatalf("lost durable owner identity: state=%+v intent=%+v", s, d)
			}
			before := fake.counts()
			// Recreate the runner and store, then perform ordinary discovery again.
			r = Runner{Store: Store{Dir: st.Dir, Epic: st.Epic}, Jira: bugs, Codex: app, Now: func() time.Time { return now }}
			for _, delay := range []time.Duration{0, 15 * time.Minute, 2 * retryDelay} {
				now = e.LastNotified.Add(delay)
				if _, err := r.PollOnce(ctx); err != nil {
					t.Fatal(err)
				}
				if _, err := r.DeliverOnce(ctx); err == nil || !strings.Contains(err.Error(), d.ID) {
					t.Fatalf("unresolved delivery did not fail closed after reload: %v", err)
				}
			}
			if got := fake.counts(); got != before {
				t.Fatalf("replayed ambiguous operation: before=%v after=%v", before, got)
			}
			s, err = r.Store.Snapshot()
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(s.DeliveryIntent, d) || s.Pending["DEMO-2"] != e {
				t.Fatalf("poll/restart changed uncertain attempt: %+v", s)
			}
			if method == "turn/steer" {
				// The original owner can resolve a lost steering reply by ledger ack.
				if err := r.Store.With(func(s *State) error { return s.Acknowledge("DEMO-2", d.ThreadID) }); err != nil {
					t.Fatal(err)
				}
			} else {
				// Simulate the operator stopping the possible owner before detach.
				fake.mu.Lock()
				fake.activeOwners = 0
				fake.mu.Unlock()
				if err := r.Store.With(func(s *State) error { return s.Detach(s.ThreadID, d.ID) }); err != nil {
					t.Fatal(err)
				}
				if result, err := r.DeliverOnce(ctx); err != nil || result != "started" {
					t.Fatalf("reconciled retry: %q, %v", result, err)
				}
				s, err = r.Store.Snapshot()
				if err != nil {
					t.Fatal(err)
				}
				if s.Pending["DEMO-2"].Attempts != 2 || !s.Pending["DEMO-2"].LastNotified.Equal(now) || s.DeliveryIntent != nil {
					t.Fatalf("retry lost bounded history: %+v", s)
				}
				now = now.Add(2 * retryDelay)
				if result, err := r.DeliverOnce(ctx); err != nil || result != "none" {
					t.Fatalf("attempt cap: %q, %v", result, err)
				}
				if err := r.Store.With(func(s *State) error { return s.Acknowledge("DEMO-2", s.ThreadID) }); err != nil {
					t.Fatal(err)
				}
			}
			s, err = r.Store.Snapshot()
			if err != nil || len(s.Pending) != 0 || s.DeliveryIntent != nil {
				t.Fatalf("recovery/ack left work stranded: %+v, %v", s, err)
			}
		})
	}
}

func TestDefiniteRejectionRestoresAttemptAndAllowsImmediateRetry(t *testing.T) {
	for _, method := range []string{"thread/start", "turn/start", "turn/steer"} {
		t.Run(method, func(t *testing.T) {
			st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
			fake := &deliveryServer{t: t, store: st, failMethod: method, reject: true,
				failure: appServerReply{err: map[string]any{"code": -32602, "message": "invalid params"}}}
			if method == "turn/steer" {
				fake.activeOwners = 1
			}
			app := fakeAppServer(t, fake.handle)
			now := time.Unix(10000, 0).UTC()
			previous := Event{Key: "DEMO-2", FirstSeen: now.Add(-2 * retryDelay), Attempts: 1, LastNotified: now.Add(-retryDelay), NotifiedThread: "thread-earlier"}
			if err := st.With(func(s *State) error {
				s.Pending[previous.Key] = previous
				s.ThreadID = "thread-attached"
				return nil
			}); err != nil {
				t.Fatal(err)
			}
			r := Runner{Store: st, Codex: app, Now: func() time.Time { return now }}
			if _, err := r.DeliverOnce(context.Background()); err == nil || !hasNoEffect(err) {
				t.Fatalf("explicit rejection not classified: %v", err)
			}
			s, err := st.Snapshot()
			if err != nil {
				t.Fatal(err)
			}
			if s.DeliveryIntent != nil || s.ThreadID != "thread-attached" || s.Pending[previous.Key] != previous {
				t.Fatalf("definite rejection consumed or changed delivery: %+v", s)
			}
			if _, err := r.DeliverOnce(context.Background()); err != nil {
				t.Fatalf("immediate retry of no-effect failure: %v", err)
			}
			s, err = st.Snapshot()
			if err != nil || s.DeliveryIntent != nil || s.Pending[previous.Key].Attempts != 2 {
				t.Fatalf("successful retry state: %+v, %v", s, err)
			}
		})
	}
}

func TestConnectionFailureDoesNotConsumeNotification(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	if err := st.With(func(s *State) error {
		s.Pending["DEMO-2"] = Event{Key: "DEMO-2"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	r := Runner{Store: st, Codex: AppServer{}}
	if _, err := r.DeliverOnce(context.Background()); err == nil || !hasNoEffect(err) {
		t.Fatalf("connection setup failure: %v", err)
	}
	s, err := st.Snapshot()
	if err != nil || s.DeliveryIntent != nil || s.Pending["DEMO-2"].Attempts != 0 {
		t.Fatalf("no-effect failure changed attempt policy: %+v, %v", s, err)
	}
	fake := &deliveryServer{t: t, store: st}
	r.Codex = fakeAppServer(t, fake.handle)
	if result, err := r.DeliverOnce(context.Background()); err != nil || result != "started" {
		t.Fatalf("retry after connection recovery: %q, %v", result, err)
	}
}

func TestInternalServerErrorRemainsAmbiguousAndOnHoldDoesNotReleaseOwner(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	fake := &deliveryServer{t: t, store: st, failMethod: "turn/start",
		failure: appServerReply{err: map[string]any{"code": -32603, "message": "internal error after acceptance"}}}
	bugs := &fakeBugs{keys: []string{"DEMO-2"}}
	r := Runner{Store: st, Codex: fakeAppServer(t, fake.handle), Jira: bugs, IncludeExisting: true}
	if _, err := r.PollOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := r.DeliverOnce(context.Background()); err == nil || hasNoEffect(err) {
		t.Fatalf("internal error incorrectly treated as no-effect: %v", err)
	}
	bugs.keys = nil
	bugs.onHold = []string{"DEMO-2"}
	if _, err := r.PollOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	s, err := st.Snapshot()
	if err != nil || len(s.Pending) != 0 || s.DeliveryIntent == nil || s.DeliveryIntent.LastError == "" {
		t.Fatalf("On Hold must remove pending key without erasing uncertain owner: %+v, %v", s, err)
	}
	before := fake.counts()
	bugs.onHold = nil
	bugs.keys = []string{"DEMO-2", "DEMO-3"}
	if _, err := r.PollOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := r.DeliverOnce(context.Background()); err == nil {
		t.Fatal("held/reactivated or newly discovered keys bypassed uncertain owner")
	}
	if got := fake.counts(); got != before {
		t.Fatalf("new discovery launched another owner: before=%v after=%v", before, got)
	}
}

func TestReconciledAmbiguityRetainsRetryDelay(t *testing.T) {
	st := Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	fake := &deliveryServer{t: t, store: st, failMethod: "turn/start", failure: appServerReply{drop: true}}
	now := time.Unix(100, 0).UTC()
	r := Runner{Store: st, Codex: fakeAppServer(t, fake.handle), Jira: &fakeBugs{keys: []string{"DEMO-2"}}, IncludeExisting: true, Now: func() time.Time { return now }}
	if _, err := r.PollOnce(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := r.DeliverOnce(context.Background()); err == nil {
		t.Fatal("expected lost reply")
	}
	fake.mu.Lock()
	fake.activeOwners = 0
	fake.mu.Unlock()
	if err := st.With(func(s *State) error { return s.Detach(s.ThreadID, s.DeliveryIntent.ID) }); err != nil {
		t.Fatal(err)
	}
	for _, delay := range []time.Duration{0, retryDelay - time.Nanosecond, retryDelay} {
		now = time.Unix(100, 0).UTC().Add(delay)
		result, err := r.DeliverOnce(context.Background())
		expected := "none"
		if delay == retryDelay {
			expected = "started"
		}
		if err != nil || result != expected {
			t.Fatalf("retry at %s: %q, %v", delay, result, err)
		}
	}
	s, err := st.Snapshot()
	if err != nil || s.Pending["DEMO-2"].Attempts != 2 {
		t.Fatalf("reconciliation refunded ambiguous attempt: %+v, %v", s, err)
	}
}
