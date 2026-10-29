package main

import (
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
