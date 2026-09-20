package daemon

import (
	"context"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"sync"
)

type BranchKey struct{ RepositoryID, Ref string }
type RunHandle struct {
	Run    *db.Run
	cancel context.CancelFunc
	done   chan struct{}
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
	db   *db.DB
	mu   sync.Mutex
	keys map[BranchKey]*RunHandle
	run  func(context.Context, *db.Run)
}

func NewManager(database *db.DB, runner func(context.Context, *db.Run)) *Manager {
	return &Manager{db: database, keys: make(map[BranchKey]*RunHandle), run: runner}
}

// Replace serializes cancellation, joining, persistence, and assignment for one
// branch key. Different keys never share this lock and may execute concurrently.
func (m *Manager) Replace(ctx context.Context, key BranchKey, accepted db.AcceptedRef, worktree string) (*db.Run, error) {
	if key.RepositoryID == "" || key.Ref == "" {
		return nil, fmt.Errorf("branch key is required")
	}
	m.mu.Lock()
	prior := m.keys[key]
	if prior != nil {
		_ = m.db.CancelRun(prior.Run.ID, types.RunCancelReasonSuperseded)
		prior.Cancel()
		m.mu.Unlock()
		prior.Wait()
		m.mu.Lock()
		if m.keys[key] == prior {
			delete(m.keys, key)
		}
	}
	r, err := m.db.CreateRunFromAccepted(db.RunInput{Accepted: accepted, WorktreeDir: worktree})
	if err != nil {
		m.mu.Unlock()
		return nil, err
	}
	if err = m.db.TransitionRunStatus(r.ID, types.RunPending, types.RunRunning); err != nil {
		m.mu.Unlock()
		return nil, err
	}
	r.Status = types.RunRunning
	runctx, cancel := context.WithCancel(ctx)
	h := &RunHandle{Run: r, cancel: cancel, done: make(chan struct{})}
	m.keys[key] = h
	m.mu.Unlock()
	go func() {
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
	return r, nil
}
func (m *Manager) Active(key BranchKey) *RunHandle {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.keys[key]
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
