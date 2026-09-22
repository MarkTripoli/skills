package coordinator

import (
	"context"
	"errors"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// WriteGate kinds. Agents branch on Kind; the CLI maps each to an exit code.
const (
	GateReady       = "ready"
	GateUnavailable = "unavailable"
)

// CheckParams names the run a run.check request asks about.
type CheckParams struct {
	RunID string `json:"run_id"`
}

// WriteGate is the answer to run check: whether the agent may take its next
// state-changing action.
type WriteGate struct {
	Kind   string `json:"kind"`
	Reason string `json:"reason,omitempty"`
}

// health reports the Socket Mode state, or not_started when the coordinator
// has no connection to ask.
func (c *Coordinator) health() string {
	if c.Health == nil {
		return slackapi.SocketNotStarted
	}
	return c.Health()
}

// CheckBeforeWrite decides whether runID may proceed. Order: unknown run is an
// error; a Socket Mode connection that is not connected is unavailable; a run
// whose last post failed is unavailable until a retry succeeds; otherwise ready.
func (c *Coordinator) CheckBeforeWrite(ctx context.Context, runID string) (WriteGate, error) {
	if runID == "" {
		return WriteGate{}, errors.New("run_id is required")
	}
	run, err := c.DB.GetRun(ctx, runID)
	if err != nil {
		return WriteGate{}, err
	}
	if state := c.health(); state != slackapi.SocketConnected {
		return WriteGate{Kind: GateUnavailable, Reason: "socket_mode " + state}, nil
	}
	if run.LastDeliveryError.Valid {
		return WriteGate{Kind: GateUnavailable, Reason: run.LastDeliveryError.String}, nil
	}
	return WriteGate{Kind: GateReady}, nil
}
