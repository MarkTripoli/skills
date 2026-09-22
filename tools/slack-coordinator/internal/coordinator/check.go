package coordinator

import (
	"context"
	"errors"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// WriteGate kinds. Agents branch on Kind; the CLI maps each to an exit code.
const (
	GateReady         = "ready"
	GateUnavailable   = "unavailable"
	GateOwnerInput    = "owner_input"
	GateSlackDisabled = "slack_disabled"
)

// CheckParams names the run a run.check request asks about.
type CheckParams struct {
	RunID string `json:"run_id"`
}

// WriteGate is the answer to run check: whether the agent may take its next
// state-changing action. Run is set whenever the run exists; Input only for
// owner_input.
type WriteGate struct {
	Kind   string      `json:"kind"`
	Reason string      `json:"reason,omitempty"`
	Input  *OwnerInput `json:"input,omitempty"`
	Run    *RunSummary `json:"run,omitempty"`
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
// error; a run whose Slack was disabled by the break-glass is slack_disabled;
// a Socket Mode connection that is not connected is unavailable; a run whose
// last post failed is unavailable until a retry succeeds; the oldest
// unanswered owner reply is owner_input; otherwise ready.
func (c *Coordinator) CheckBeforeWrite(ctx context.Context, runID string) (WriteGate, error) {
	if runID == "" {
		return WriteGate{}, errors.New("run_id is required")
	}
	run, err := c.DB.GetRun(ctx, runID)
	if err != nil {
		return WriteGate{}, err
	}
	gate := WriteGate{Run: &RunSummary{RunID: run.RunID, ChannelID: run.ChannelID, Permalink: run.Permalink}}
	if run.SlackMode == db.SlackDisabled {
		gate.Kind = GateSlackDisabled
		return gate, nil
	}
	if state := c.health(); state != slackapi.SocketConnected {
		gate.Kind, gate.Reason = GateUnavailable, "socket_mode "+state
		return gate, nil
	}
	if run.LastDeliveryError.Valid {
		gate.Kind, gate.Reason = GateUnavailable, run.LastDeliveryError.String
		return gate, nil
	}
	in, pending, err := c.DB.OldestUnhandledInput(ctx, runID)
	if err != nil {
		return WriteGate{}, err
	}
	if pending {
		gate.Kind = GateOwnerInput
		gate.Input = &OwnerInput{
			RunID:     run.RunID,
			ChannelID: run.ChannelID,
			ThreadTS:  run.ThreadTS,
			MessageTS: in.MessageTS,
			Text:      in.Text,
		}
		return gate, nil
	}
	gate.Kind = GateReady
	return gate, nil
}
