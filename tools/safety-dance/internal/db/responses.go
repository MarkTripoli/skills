package db

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

// Response records an operator decision before the daemon acknowledges it.
type Response struct {
	RunID      string
	Step       string
	StepID     string
	Generation int
	Action     string
	Payload    any
}

func (d *DB) RecordResponse(r Response) error {
	if r.RunID == "" || r.Step == "" || r.StepID == "" || r.Action == "" || r.Generation <= 0 {
		return fmt.Errorf("response run, step, step id, generation, and action are required")
	}
	if !types.ResponseAllowed(types.StepName(r.Step), types.ApprovalAction(r.Action)) {
		return fmt.Errorf("response %s is not allowed for step %s", r.Action, r.Step)
	}
	payload, err := json.Marshal(r.Payload)
	if err != nil {
		return fmt.Errorf("marshal response: %w", err)
	}
	tx, err := d.sql.Begin()
	if err != nil {
		return fmt.Errorf("begin response: %w", err)
	}
	defer tx.Rollback()
	var generation int
	if err := tx.QueryRow(`SELECT prompt_generation FROM step_results WHERE id=? AND run_id=? AND step_name=? AND status IN (?, ?)`, r.StepID, r.RunID, r.Step, types.StepStatusAwaitingApproval, types.StepStatusFixReview).Scan(&generation); err != nil {
		return fmt.Errorf("response prompt is not parked: %w", err)
	}
	if r.Generation != generation {
		return fmt.Errorf("response prompt generation is stale")
	}
	if _, err := tx.Exec(`INSERT INTO responses(run_id,step,step_id,prompt_generation,action,payload,created_at) VALUES(?,?,?,?,?,?,?)`, r.RunID, r.Step, r.StepID, generation, r.Action, string(payload), now()); err != nil {
		return fmt.Errorf("record response: %w", err)
	}
	return tx.Commit()
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
	var generation int
	query := `SELECT rowid, action, payload, prompt_generation FROM responses WHERE run_id=? AND step=? ORDER BY created_at, rowid LIMIT 1`
	err = tx.QueryRow(query, runID, step).Scan(&id, &action, &payload, &generation)
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
	return &Response{RunID: runID, Step: step, Generation: generation, Action: action, Payload: decoded}, nil
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
	var generation int
	err = tx.QueryRow(`SELECT rowid, action, payload, prompt_generation FROM responses WHERE run_id=? AND step=? AND step_id=? AND prompt_generation=(SELECT prompt_generation FROM step_results WHERE id=? AND run_id=? AND step_name=? AND status IN (?, ?)) ORDER BY created_at, rowid LIMIT 1`, runID, step, stepID, stepID, runID, step, types.StepStatusAwaitingApproval, types.StepStatusFixReview).Scan(&rowID, &action, &payload, &generation)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find response: %w", err)
	}
	if !types.ResponseAllowed(types.StepName(step), types.ApprovalAction(action)) {
		return nil, fmt.Errorf("response %s is not allowed for step %s", action, step)
	}
	if action == string(types.ActionFix) {
		if _, err = tx.Exec(`UPDATE step_results SET status=?, last_activity_at=?, last_activity=? WHERE id=? AND run_id=? AND status IN (?, ?)`, types.StepStatusFixing, now(), "operator requested fix", stepID, runID, types.StepStatusAwaitingApproval, types.StepStatusFixReview); err != nil {
			return nil, fmt.Errorf("start response fix: %w", err)
		}
	} else if action == string(types.ActionAbort) {
		// Abort only consumes the response; the runner owns run cancellation.
	} else {
		status := types.StepStatusCompleted
		skipReason := ""
		if action == string(types.ActionSkip) {
			status = types.StepStatusSkipped
			skipReason = "operator skip"
		}
		ts := now()
		if _, err = tx.Exec(`UPDATE step_results SET status=?, completed_at=?, agent_pid=NULL, skip_reason=NULLIF(?, '') WHERE id=? AND run_id=?`, status, ts, skipReason, stepID, runID); err != nil {
			return nil, fmt.Errorf("complete response step: %w", err)
		}
		if headSHA != "" {
			approved := review && action == string(types.ActionApprove)
			if _, err = tx.Exec(`UPDATE runs SET head_sha=?, review_approved_head_sha=CASE WHEN ? THEN ? ELSE review_approved_head_sha END, updated_at=? WHERE id=?`, headSHA, approved, headSHA, ts, runID); err != nil {
				return nil, fmt.Errorf("record response checkpoint: %w", err)
			}
		}
	}
	if _, err = tx.Exec(`DELETE FROM responses WHERE rowid=?`, rowID); err != nil {
		return nil, fmt.Errorf("consume response: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit applied response: %w", err)
	}
	var decoded any
	if json.Unmarshal([]byte(payload), &decoded) != nil {
		decoded = payload
	}
	return &Response{RunID: runID, Step: step, StepID: stepID, Generation: generation, Action: action, Payload: decoded}, nil
}
