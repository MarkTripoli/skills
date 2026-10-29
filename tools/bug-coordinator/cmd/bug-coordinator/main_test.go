package main

import (
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/bug-coordinator/internal/watch"
)

func TestAckRequiresTheNotifiedThreadAndIsRepeatable(t *testing.T) {
	st := watch.Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	if err := st.With(func(s *watch.State) error {
		s.Pending["DEMO-2"] = watch.Event{Key: "DEMO-2", FirstSeen: time.Now(), NotifiedThread: "thread-right"}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	args := []string{"ack", "--epic", "DEMO-123", "--issue", "DEMO-2", "--state-dir", st.Dir, "--thread", "thread-wrong"}
	if err := run(args); err == nil || !strings.Contains(err.Error(), "not assigned") {
		t.Fatalf("wrong thread: %v", err)
	}
	args[len(args)-1] = "thread-right"
	if err := run(args); err != nil {
		t.Fatal(err)
	}
	if err := run(args); err != nil {
		t.Fatalf("repeated ack: %v", err)
	}
	s, err := st.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if len(s.Pending) != 0 {
		t.Fatalf("pending after ack: %v", s.Pending)
	}
}

func uncertainDelivery(t *testing.T, threadID string) (watch.Store, watch.DeliveryIntent) {
	t.Helper()
	st := watch.Store{Dir: t.TempDir(), Epic: "DEMO-123"}
	d := watch.DeliveryIntent{
		ID: "intent-durable", Phase: "turn-start", ThreadID: threadID,
		Keys: []string{"DEMO-2", "DEMO-3"}, CreatedAt: time.Unix(100, 0).UTC(),
	}
	if threadID == "" {
		d.Phase = "thread-start"
	}
	if err := st.With(func(s *watch.State) error {
		s.ThreadID = threadID
		s.DeliveryIntent = &d
		for _, key := range d.Keys {
			s.Pending[key] = watch.Event{Key: key, FirstSeen: d.CreatedAt.Add(-time.Hour), LastNotified: d.CreatedAt, Attempts: 2, NotifiedThread: threadID}
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	return st, d
}

func TestStatusExposesUnresolvedIntentEvenWithoutErrorAfterCrash(t *testing.T) {
	st, d := uncertainDelivery(t, "thread-right")
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	original := os.Stdout
	os.Stdout = writer
	defer func() { os.Stdout = original }()
	err = run([]string{"status", "--epic", st.Epic, "--state-dir", st.Dir})
	os.Stdout = original
	if closeErr := writer.Close(); closeErr != nil {
		t.Fatal(closeErr)
	}
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	var s watch.State
	if err := json.Unmarshal(data, &s); err != nil {
		t.Fatal(err)
	}
	if s.DeliveryIntent == nil || s.DeliveryIntent.ID != d.ID || s.DeliveryIntent.Phase != d.Phase || s.DeliveryIntent.ThreadID != d.ThreadID || s.DeliveryIntent.LastError != "" {
		t.Fatalf("status hid crash uncertainty: %s", data)
	}
	if s.Pending["DEMO-2"].Attempts != 2 || !s.Pending["DEMO-2"].LastNotified.Equal(d.CreatedAt) {
		t.Fatalf("status hid attempt policy: %s", data)
	}
}

func TestOwnerAckResolvesIntentOnlyAfterEveryPendingDisposition(t *testing.T) {
	st, _ := uncertainDelivery(t, "thread-right")
	args := []string{"ack", "--epic", st.Epic, "--state-dir", st.Dir, "--issue", "DEMO-2", "--thread", "thread-wrong"}
	if err := run(args); err == nil {
		t.Fatal("another owner acknowledged an uncertain delivery")
	}
	args[len(args)-1] = "thread-right"
	if err := run(args); err != nil {
		t.Fatal(err)
	}
	s, err := st.Snapshot()
	if err != nil || s.DeliveryIntent == nil || len(s.Pending) != 1 {
		t.Fatalf("partial ack released uncertainty: %+v, %v", s, err)
	}
	args[len(args)-3] = "DEMO-3"
	if err := run(args); err != nil {
		t.Fatal(err)
	}
	if err := run(args); err != nil {
		t.Fatalf("repeat ack: %v", err)
	}
	s, err = st.Snapshot()
	if err != nil || s.DeliveryIntent != nil || len(s.Pending) != 0 || s.ThreadID != "thread-right" {
		t.Fatalf("completed ledger ack did not resolve intent: %+v, %v", s, err)
	}
}

func TestAttachDetachReconcileExactIntentWithoutRefundingAttempts(t *testing.T) {
	for _, command := range []string{"attach", "detach"} {
		for _, knownThread := range []string{"thread-right", ""} {
			t.Run(command+"/"+knownThread, func(t *testing.T) {
				st, d := uncertainDelivery(t, knownThread)
				args := []string{command, "--epic", st.Epic, "--state-dir", st.Dir}
				if knownThread != "" || command == "attach" {
					args = append(args, "--thread", "thread-right")
				}
				if err := run(args); err == nil {
					t.Fatal("ordinary attachment command bypassed uncertain delivery")
				}
				if err := run(append(args, "--intent", "stale-intent")); err == nil {
					t.Fatal("stale intent reconciled another notification")
				}
				if knownThread != "" {
					wrongThread := append([]string(nil), args...)
					wrongThread[len(wrongThread)-1] = "thread-wrong"
					if err := run(append(wrongThread, "--intent", d.ID)); err == nil {
						t.Fatal("different owner replaced known uncertain owner")
					}
				}
				if err := run(append(args, "--intent", d.ID)); err != nil {
					t.Fatal(err)
				}
				s, err := st.Snapshot()
				if err != nil || s.DeliveryIntent != nil {
					t.Fatalf("reconciliation did not persist: %+v, %v", s, err)
				}
				for _, key := range d.Keys {
					e := s.Pending[key]
					if e.Attempts != 2 || !e.LastNotified.Equal(d.CreatedAt) {
						t.Fatalf("reconciliation refunded attempt history: %+v", e)
					}
					if command == "attach" {
						if e.NotifiedThread != "thread-right" || s.ThreadID != "thread-right" {
							t.Fatalf("reconciled owner cannot acknowledge exhausted key: %+v", s)
						}
						if err := run([]string{"ack", "--epic", st.Epic, "--state-dir", st.Dir, "--issue", key, "--thread", "thread-right"}); err != nil {
							t.Fatal(err)
						}
					}
				}
				if command == "detach" && s.ThreadID != "" {
					t.Fatalf("detached owner remains attached: %+v", s)
				}
			})
		}
	}
}
