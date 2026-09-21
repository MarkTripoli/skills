package db

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

// TransitionStepStatus is the step-level compare-and-set primitive used by
// recovery and runners.
func (d *DB) TransitionStepStatus(id string, from, to types.StepStatus) error {
	if from == to {
		return nil
	}
	_, err := d.sql.Exec(`UPDATE step_results SET status=?,last_activity_at=?,last_activity=? WHERE id=? AND status=?`, to, now(), fmt.Sprintf("status: %s", to), id, from)
	if err != nil {
		return fmt.Errorf("transition step: %w", err)
	}
	s, err := d.GetStepResult(id)
	if err != nil {
		return err
	}
	if s == nil || s.Status != to {
		return fmt.Errorf("step %s transition conflict", id)
	}
	return nil
}
