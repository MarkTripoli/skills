package watch

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"syscall"
	"time"
)

var issueKey = regexp.MustCompile(`^[A-Z][A-Z0-9]*-[0-9]+$`)

type Event struct {
	Key            string    `json:"key"`
	FirstSeen      time.Time `json:"first_seen"`
	NotifiedThread string    `json:"notified_thread,omitempty"`
	LastNotified   time.Time `json:"last_notified,omitempty"`
	Attempts       int       `json:"attempts,omitempty"`
}

// A saved intent is unresolved until the external operation replies or an
// operator reconciles it. A crash before sending is indistinguishable from a
// lost reply, so neither case is automatically replayed.
type DeliveryIntent struct {
	ID        string    `json:"id"`
	Phase     string    `json:"phase"`
	Keys      []string  `json:"keys"`
	ThreadID  string    `json:"thread_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	LastError string    `json:"last_error,omitempty"`
}

type State struct {
	Epic           string           `json:"epic"`
	ThreadID       string           `json:"thread_id,omitempty"`
	Initialized    bool             `json:"initialized"`
	Seen           map[string]bool  `json:"seen"`
	Pending        map[string]Event `json:"pending"`
	LastPoll       time.Time        `json:"last_poll,omitempty"`
	LastError      string           `json:"last_error,omitempty"`
	DeliveryIntent *DeliveryIntent  `json:"delivery_intent,omitempty"`
}

func ValidKey(key string) bool { return issueKey.MatchString(key) }

func (s *State) Normalize(epic string) error {
	if !ValidKey(epic) {
		return fmt.Errorf("invalid epic key %q", epic)
	}
	if s.Epic != "" && s.Epic != epic {
		return fmt.Errorf("state belongs to %s, not %s", s.Epic, epic)
	}
	s.Epic = epic
	if s.Seen == nil {
		s.Seen = make(map[string]bool)
	}
	if s.Pending == nil {
		s.Pending = make(map[string]Event)
	}
	return nil
}

func (s State) PendingKeys() []string {
	keys := make([]string, 0, len(s.Pending))
	for key := range s.Pending {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// Observe establishes a baseline once, then records newly eligible Bugs. An
// explicit On Hold status removes an event and lets a later return to an
// eligible status be discovered again. Other absent issues remain pending so
// the orchestrator can reconcile changed membership or a different status.
func (s *State) Observe(keys, onHold []string, now time.Time) (int, error) {
	if s.Seen == nil {
		s.Seen = make(map[string]bool)
	}
	if s.Pending == nil {
		s.Pending = make(map[string]Event)
	}
	for _, key := range append(append([]string{}, keys...), onHold...) {
		if !ValidKey(key) {
			return 0, fmt.Errorf("invalid Jira issue key %q", key)
		}
	}
	for _, key := range onHold {
		delete(s.Seen, key)
		delete(s.Pending, key)
	}
	added := 0
	for _, key := range keys {
		if !s.Seen[key] && s.Initialized {
			s.Pending[key] = Event{Key: key, FirstSeen: now}
			added++
		}
		s.Seen[key] = true
	}
	s.Initialized = true
	s.LastPoll = now
	s.LastError = ""
	return added, nil
}

func (s *State) checkIntent(intentID string) error {
	if s.DeliveryIntent == nil {
		if intentID != "" {
			return errors.New("no unresolved delivery intent")
		}
		return nil
	}
	if intentID != s.DeliveryIntent.ID {
		return fmt.Errorf("delivery intent %s requires reconciliation with --intent", s.DeliveryIntent.ID)
	}
	return nil
}

func (s *State) Attach(threadID, intentID string) error {
	if threadID == "" {
		return errors.New("--thread is required")
	}
	if err := s.checkIntent(intentID); err != nil {
		return err
	}
	if d := s.DeliveryIntent; d != nil && d.ThreadID != "" && d.ThreadID != threadID {
		return fmt.Errorf("reconcile original thread %s before attaching another owner", d.ThreadID)
	}
	if d := s.DeliveryIntent; d != nil && d.ThreadID == "" {
		// No owner turn was sent. The explicit reconciliation hands these
		// reserved keys to the operator-selected owner for intake and ack.
		for _, key := range d.Keys {
			if e, ok := s.Pending[key]; ok && e.LastNotified.Equal(d.CreatedAt) {
				e.NotifiedThread = threadID
				s.Pending[key] = e
			}
		}
	}
	s.ThreadID = threadID
	s.DeliveryIntent = nil
	return nil
}

func (s *State) Detach(threadID, intentID string) error {
	if err := s.checkIntent(intentID); err != nil {
		return err
	}
	if threadID == "" && s.DeliveryIntent == nil {
		return errors.New("--thread is required")
	}
	if s.ThreadID != threadID {
		return fmt.Errorf("thread %s is not attached", threadID)
	}
	// Supplying the exact intent is an operator assertion that the possible
	// owner has been reconciled and stopped. Attempt history is never reset.
	s.ThreadID = ""
	s.DeliveryIntent = nil
	return nil
}

func (s *State) Acknowledge(key, threadID string) error {
	e, ok := s.Pending[key]
	if !ok {
		return nil
	}
	if threadID == "" || e.NotifiedThread != threadID {
		return fmt.Errorf("%s was not assigned to thread %s", key, threadID)
	}
	delete(s.Pending, key)
	if d := s.DeliveryIntent; d != nil && d.ThreadID == threadID {
		for _, key := range d.Keys {
			if _, pending := s.Pending[key]; pending {
				return nil
			}
		}
		s.DeliveryIntent = nil
	}
	return nil
}

type Store struct{ Dir, Epic string }

func (st Store) path() string     { return filepath.Join(st.Dir, st.Epic+".json") }
func (st Store) lockPath() string { return filepath.Join(st.Dir, st.Epic+".lock") }

func (st Store) With(fn func(*State) error) error {
	return st.withCheckpoint(func(s *State, _ func() error) error { return fn(s) })
}

// withCheckpoint keeps the state lock across write-ahead saves and delivery so
// another poller or an operator cannot race an in-flight owner launch.
func (st Store) withCheckpoint(fn func(*State, func() error) error) error {
	if !ValidKey(st.Epic) {
		return fmt.Errorf("invalid epic key %q", st.Epic)
	}
	if err := os.MkdirAll(st.Dir, 0700); err != nil {
		return err
	}
	lock, err := os.OpenFile(st.lockPath(), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return err
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	var s State
	data, err := os.ReadFile(st.path())
	if err == nil {
		if err := json.Unmarshal(data, &s); err != nil {
			return fmt.Errorf("decode state: %w", err)
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := s.Normalize(st.Epic); err != nil {
		return err
	}
	checkpoint := func() error { return st.save(&s) }
	if err := fn(&s, checkpoint); err != nil {
		return err
	}
	return checkpoint()
}

func (st Store) save(s *State) error {
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(st.Dir, st.Epic+"-*.tmp")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), st.path()); err != nil {
		return err
	}
	dir, err := os.Open(st.Dir)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func (st Store) Snapshot() (State, error) {
	var copy State
	err := st.With(func(s *State) error {
		data, err := json.Marshal(s)
		if err != nil {
			return err
		}
		return json.Unmarshal(data, &copy)
	})
	return copy, err
}

// ServeLock prevents two pollers for one epic while normal state commands
// retain their separate short-lived lock.
func (st Store) ServeLock() (*os.File, error) {
	if err := os.MkdirAll(st.Dir, 0700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(st.Dir, st.Epic+".serve.lock"), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("watcher already running for %s: %w", st.Epic, err)
	}
	return f, nil
}
