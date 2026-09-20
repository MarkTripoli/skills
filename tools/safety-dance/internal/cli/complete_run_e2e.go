//go:build safety_dance_e2e

package cli

import (
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
)

func completeRunInTest(database *db.DB, runID string) {
	_ = database.TransitionRunStatus(runID, types.RunRunning, types.RunCompleted)
}
