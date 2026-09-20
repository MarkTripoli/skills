package db

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

// Response records an operator decision before the daemon acknowledges it.
type Response struct {
	RunID   string
	Step    string
	Action  string
	Payload any
}

func (d *DB) RecordResponse(r Response) error {
	if r.RunID == "" || r.Step == "" || r.Action == "" {
		return fmt.Errorf("response run, step, and action are required")
	}
	payload, err := json.Marshal(r.Payload)
	if err != nil {
		return fmt.Errorf("marshal response: %w", err)
	}
	_, err = d.sql.Exec(`INSERT INTO responses(run_id,step,action,payload,created_at) VALUES(?,?,?,?,?)`, r.RunID, r.Step, r.Action, string(payload), now())
	if err != nil {
		return fmt.Errorf("record response: %w", err)
	}
	return nil
}

// ConsumeResponse atomically returns and removes the oldest response bound to
// a parked run step. A restart can therefore resume the exact parked step.
func (d *DB) ConsumeResponse(runID, step string) (*Response, error) {
	tx, err := d.sql.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var id int64
	var action, payload string
	err = tx.QueryRow(`SELECT rowid, action, payload FROM responses WHERE run_id=? AND step=? ORDER BY created_at, rowid LIMIT 1`, runID, step).Scan(&id, &action, &payload)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(`DELETE FROM responses WHERE rowid=?`, id); err != nil {
		return nil, err
	}
	if err = tx.Commit(); err != nil {
		return nil, err
	}
	var decoded any
	if json.Unmarshal([]byte(payload), &decoded) != nil {
		decoded = payload
	}
	return &Response{RunID: runID, Step: step, Action: action, Payload: decoded}, nil
}

// ApplyResponse consumes an operator response and completes the parked step in
// one transaction. The worktree checkpoint and review authority therefore
// cannot become visible without the response being durably applied.
func (d *DB) ApplyResponse(runID, step, stepID, headSHA string, review bool) (*Response, error) {
	tx, err := d.sql.Begin()
	if err != nil {
		return nil, fmt.Errorf("begin apply response: %w", err)
	}
	defer tx.Rollback()
	var rowID int64
	var action, payload string
	err = tx.QueryRow(`SELECT rowid, action, payload FROM responses WHERE run_id=? AND step=? ORDER BY created_at, rowid LIMIT 1`, runID, step).Scan(&rowID, &action, &payload)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find response: %w", err)
	}
	if _, err = tx.Exec(`DELETE FROM responses WHERE rowid=?`, rowID); err != nil {
		return nil, fmt.Errorf("consume response: %w", err)
	}
	if action == string(types.ActionAbort) {
		if err := tx.Commit(); err != nil {
			return nil, fmt.Errorf("commit aborted response: %w", err)
		}
		var decoded any
		if json.Unmarshal([]byte(payload), &decoded) != nil {
			decoded = payload
		}
		return &Response{RunID: runID, Step: step, Action: action, Payload: decoded}, nil
	}
	status := types.StepStatusCompleted
	skipReason := ""
	if action == string(types.ActionSkip) {
		status = types.StepStatusSkipped
		skipReason = "operator skip"
	}
	ts := now()
	if _, err = tx.Exec(`UPDATE step_results SET status=?, completed_at=?, last_activity_at=?, last_activity=?, agent_pid=NULL, skip_reason=NULLIF(?, '') WHERE id=?`, status, ts, ts, fmt.Sprintf("status: %s", status), skipReason, stepID); err != nil {
		return nil, fmt.Errorf("complete response step: %w", err)
	}
	if headSHA != "" {
		approved := review && action == string(types.ActionApprove)
		if _, err = tx.Exec(`UPDATE runs SET head_sha=?, review_approved_head_sha=CASE WHEN ? THEN ? ELSE review_approved_head_sha END, updated_at=? WHERE id=?`, headSHA, approved, headSHA, ts, runID); err != nil {
			return nil, fmt.Errorf("record response checkpoint: %w", err)
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit applied response: %w", err)
	}
	var decoded any
	if json.Unmarshal([]byte(payload), &decoded) != nil {
		decoded = payload
	}
	return &Response{RunID: runID, Step: step, Action: action, Payload: decoded}, nil
}
