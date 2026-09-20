package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

type AcceptedRef struct {
	ID, RepoID, Branch, GateHead, PreviousReconciledHead, LaunchNonce, ValidationGeneration string
	RequestedOptions                                                                        []string
	AcceptedAt                                                                              int64
}
type RunInput struct {
	Accepted    AcceptedRef
	WorktreeDir string
	BaseSHA     string
}

// CreateRunFromAccepted commits accepted-ref custody, run creation, and worktree
// placement together. No caller can observe a run before its source head is durable.
func (d *DB) CreateRunFromAccepted(in RunInput) (*Run, error) {
	a := in.Accepted
	if a.RepoID == "" || a.Branch == "" || a.GateHead == "" || a.LaunchNonce == "" {
		return nil, fmt.Errorf("accepted ref requires repository, branch, head, and nonce")
	}
	tx, err := d.sql.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	ts := now()
	if a.ID == "" {
		a.ID = newID()
	}
	opts, _ := json.Marshal(a.RequestedOptions)
	_, err = tx.Exec(`INSERT INTO accepted_refs(id,repo_id,branch,gate_head,previous_reconciled_head,launch_nonce,validation_generation,requested_options,accepted_at) VALUES(?,?,?,?,?,?,?,?,?)`, a.ID, a.RepoID, a.Branch, a.GateHead, nullableString(a.PreviousReconciledHead), a.LaunchNonce, nullableString(a.ValidationGeneration), string(opts), ts)
	if err != nil {
		return nil, fmt.Errorf("accepted ref: %w", err)
	}
	id := newID()
	base := in.BaseSHA
	if base == "" {
		base = a.PreviousReconciledHead
	}
	_, err = tx.Exec(`INSERT INTO runs(id,repo_id,branch,head_sha,base_sha,submitted_head_sha,status,launch_nonce,launch_validation_generation,worktree_dir,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`, id, a.RepoID, a.Branch, a.GateHead, base, a.GateHead, types.RunPending, a.LaunchNonce, a.ValidationGeneration, nullableString(in.WorktreeDir), ts, ts)
	if err != nil {
		return nil, fmt.Errorf("run: %w", err)
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	return d.GetRun(id)
}

// TransitionRunStatus performs a compare-and-set transition. Terminal records
// cannot be reopened, and a superseded/cancelled run cannot report success.
func (d *DB) TransitionRunStatus(id string, from, to types.RunStatus) error {
	if from == to {
		return nil
	}
	if from.Terminal() {
		return fmt.Errorf("run %s is terminal", id)
	}
	if to == types.RunCompleted && from != types.RunRunning {
		return fmt.Errorf("completed run must be running")
	}
	r, err := d.sql.Exec(`UPDATE runs SET status=?,updated_at=? WHERE id=? AND status=?`, to, now(), id, from)
	if err != nil {
		return fmt.Errorf("transition run: %w", err)
	}
	n, _ := r.RowsAffected()
	if n != 1 {
		return fmt.Errorf("run %s transition conflict", id)
	}
	return nil
}
func (d *DB) CancelRun(id, reason string) error {
	if reason == "" {
		reason = types.RunCancelReasonSuperseded
	}
	result, err := d.sql.Exec(`UPDATE runs SET status=?,error=?,updated_at=? WHERE id=? AND status IN (?,?)`, types.RunCancelled, reason, now(), id, types.RunPending, types.RunRunning)
	if err != nil {
		return fmt.Errorf("cancel run: %w", err)
	}
	n, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cancel run rows affected: %w", err)
	}
	if n != 1 {
		return fmt.Errorf("run %s is no longer cancellable", id)
	}
	return nil
}

// SupersedeRun records replacement even while an older run owns publication.
// Publication checks the status again before the irreversible Git write.
func (d *DB) SupersedeRun(id, reason string) error {
	if reason == "" {
		reason = types.RunCancelReasonSuperseded
	}
	result, err := d.sql.Exec(`UPDATE runs SET status=?,error=?,push_active=0,updated_at=? WHERE id=? AND status IN (?,?,?,?)`, types.RunCancelled, reason, now(), id, types.RunPending, types.RunRunning, types.RunFailed, types.RunCancelled)
	if err != nil {
		return fmt.Errorf("supersede run: %w", err)
	}
	if n, _ := result.RowsAffected(); n != 1 {
		return fmt.Errorf("run %s is no longer supersedable", id)
	}
	return nil
}
func (d *DB) RecoverableRuns() ([]*Run, error) {
	rows, err := d.sql.Query(`SELECT `+runColumns+` FROM runs WHERE status IN (?,?,?) ORDER BY created_at`, types.RunPending, types.RunRunning, types.RunCancelled)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []*Run
	for rows.Next() {
		r := new(Run)
		if err := scanRun(rows, r); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
func (d *DB) SQLForTests() *sql.DB { return d.sql }
