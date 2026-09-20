// Package custody owns the durable handoff between an accepted gate update and
// the run that validates it. The database remains the transaction boundary;
// this package keeps callers from reaching into storage for custody operations.
package custody

import (
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

// AcceptedRef is the immutable gate snapshot accepted for a run.
type AcceptedRef = db.AcceptedRef

// RunInput describes the run and worktree record to create with its accepted
// ref. Creation commits both records in one database transaction.
type RunInput = db.RunInput

// Store provides the custody operations used by the daemon.
type Store struct {
	db *db.DB
}

// New returns a custody store backed by database. A nil database is rejected so
// a missing persistence boundary cannot become an in-memory run.
func New(database *db.DB) (*Store, error) {
	if database == nil {
		return nil, fmt.Errorf("custody database is required")
	}
	return &Store{db: database}, nil
}

// CreateRun records the accepted ref and its run before execution can begin.
func (s *Store) CreateRun(input RunInput) (*db.Run, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("custody store is not initialized")
	}
	return s.db.CreateRunFromAccepted(input)
}

// TransitionRunStatus applies a guarded status transition. The expected prior
// status is part of the update, preventing stale cancellation paths from
// changing a newer owner.
func (s *Store) TransitionRunStatus(id string, from, to types.RunStatus) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("custody store is not initialized")
	}
	return s.db.TransitionRunStatus(id, from, to)
}

// CancelRun marks an active run cancelled and clears push ownership.
func (s *Store) CancelRun(id, reason string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("custody store is not initialized")
	}
	return s.db.CancelRun(id, reason)
}

// SupersedeRun records replacement without waiting for publication ownership.
func (s *Store) SupersedeRun(id, reason string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("custody store is not initialized")
	}
	return s.db.SupersedeRun(id, reason)
}

// RecoverableRuns returns records whose durable state permits restart recovery.
func (s *Store) RecoverableRuns() ([]*db.Run, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("custody store is not initialized")
	}
	return s.db.RecoverableRuns()
}
