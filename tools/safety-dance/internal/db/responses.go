package db

import (
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
