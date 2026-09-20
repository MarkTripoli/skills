package daemon

import (
	"context"
	"fmt"
	"sync"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/custody"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/worktrees"
)

type BranchKey struct{ RepositoryID, Ref string }
type RunHandle struct {
	Run     *db.Run
	cancel  context.CancelFunc
	done    chan struct{}
	started chan struct{}
}

func (h *RunHandle) Cancel() {
	if h != nil && h.cancel != nil {
		h.cancel()
	}
}
func (h *RunHandle) Wait() {
	if h != nil {
		<-h.done
	}
}

type Manager struct {
	db    *db.DB
	store *custody.Store
	mu    sync.Mutex
	keys  map[BranchKey]*RunHandle
	run   func(context.Context, *db.Run)
}

func NewManager(database *db.DB, runner func(context.Context, *db.Run)) *Manager {
	store, _ := custody.New(database)
	return &Manager{db: database, store: store, keys: make(map[BranchKey]*RunHandle), run: runner}
}

// Replace serializes cancellation, joining, persistence, and assignment for one
// branch key. Different keys never share this lock and may execute concurrently.
func (m *Manager) Replace(ctx context.Context, key BranchKey, accepted db.AcceptedRef, worktree string) (*db.Run, error) {
	if key.RepositoryID == "" || key.Ref == "" {
		return nil, fmt.Errorf("branch key is required")
	}
	m.mu.Lock()
	if accepted.LaunchNonce != "" {
		existing, err := m.db.GetRunByLaunchNonce(key.RepositoryID, key.Ref, accepted.LaunchNonce)
		if err != nil {
			m.mu.Unlock()
			return nil, err
		}
		if existing != nil {
			m.mu.Unlock()
			return existing, nil
		}
	}
	prior := m.keys[key]
	if prior != nil {
		prior.Cancel()
		m.mu.Unlock()
		prior.Wait()
		m.mu.Lock()
		if current, exists := m.keys[key]; exists && current != prior {
			m.mu.Unlock()
			return nil, fmt.Errorf("branch %s was replaced concurrently", key.Ref)
		}
		if err := m.store.SupersedeRun(prior.Run.ID, types.RunCancelReasonSuperseded); err != nil {
			m.mu.Unlock()
			return nil, err
		}
		delete(m.keys, key)
	}
	r, err := m.store.CreateRun(db.RunInput{Accepted: accepted, WorktreeDir: worktree})
	if err != nil {
		m.mu.Unlock()
		return nil, err
	}
	if err = m.store.TransitionRunStatus(r.ID, types.RunPending, types.RunRunning); err != nil {
		m.mu.Unlock()
		return nil, err
	}
	// The creation journal is cleared only after the durable run owns the path.
	// Do this before exposing the run to the executor, closing the crash window
	// where a terminal run could race journal cleanup.
	if err = worktrees.CommitOwnership(worktree); err != nil {
		m.mu.Unlock()
		return nil, err
	}
	r.Status = types.RunRunning
	// A request only submits work. The daemon owns the run until it reaches a
	// durable terminal state, so an IPC disconnect must not cancel it.
	runctx, cancel := context.WithCancel(context.Background())
	h := &RunHandle{Run: r, cancel: cancel, done: make(chan struct{}), started: make(chan struct{})}
	m.keys[key] = h
	m.mu.Unlock()
	go func() {
		close(h.started)
		defer close(h.done)
		if m.run != nil {
			m.run(runctx, r)
		}
		m.mu.Lock()
		if m.keys[key] == h {
			delete(m.keys, key)
		}
		m.mu.Unlock()
	}()
	<-h.started
	return r, nil
}
func (m *Manager) Active(key BranchKey) *RunHandle {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.keys[key]
}

// Cancel stops only the currently registered handle for runID. It never
// follows a branch key to a replacement run.
func (m *Manager) Cancel(key BranchKey, runID string) bool {
	m.mu.Lock()
	h := m.keys[key]
	if h == nil || h.Run == nil || h.Run.ID != runID {
		m.mu.Unlock()
		return false
	}
	h.Cancel()
	m.mu.Unlock()
	return true
}

// Resume registers a durable pending/running run that has no live handle.
func (m *Manager) Resume(ctx context.Context, r *db.Run) error {
	if r == nil {
		return fmt.Errorf("run is required")
	}
	key := BranchKey{RepositoryID: r.RepoID, Ref: r.Branch}
	m.mu.Lock()
	defer m.mu.Unlock()
	if existing := m.keys[key]; existing != nil {
		return nil
	}
	runctx, cancel := context.WithCancel(ctx)
	h := &RunHandle{Run: r, cancel: cancel, done: make(chan struct{}), started: make(chan struct{})}
	m.keys[key] = h
	go func() {
		close(h.started)
		defer close(h.done)
		if m.run != nil {
			m.run(runctx, r)
		}
		m.mu.Lock()
		if m.keys[key] == h {
			delete(m.keys, key)
		}
		m.mu.Unlock()
	}()
	return nil
}

// Recover re-registers durable active runs after a daemon restart and resumes
// only runs whose persisted status permits execution.
func (m *Manager) Recover(ctx context.Context) error {
	runs, err := m.db.RecoverableRuns()
	if err != nil {
		return err
	}
	for _, r := range runs {
		if r.Status != types.RunPending && r.Status != types.RunRunning {
			continue
		}
		runctx, cancel := context.WithCancel(ctx)
		h := &RunHandle{Run: r, cancel: cancel, done: make(chan struct{})}
		key := BranchKey{RepositoryID: r.RepoID, Ref: r.Branch}
		m.mu.Lock()
		if _, exists := m.keys[key]; exists {
			m.mu.Unlock()
			cancel()
			continue
		}
		m.keys[key] = h
		m.mu.Unlock()
		go func(key BranchKey, handle *RunHandle) {
			defer close(handle.done)
			if m.run != nil {
				m.run(runctx, handle.Run)
			}
			m.mu.Lock()
			if m.keys[key] == handle {
				delete(m.keys, key)
			}
			m.mu.Unlock()
		}(key, h)
	}
	return nil
}
