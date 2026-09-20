package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
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
