package coordinator

import (
	"context"
	"errors"
	"time"

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

// WaitBeforeWrite returns a changed gate promptly, or rechecks it at the
// deadline. It never holds a database transaction while waiting.
func (c *Coordinator) WaitBeforeWrite(ctx context.Context, runID string) (WriteGate, error) {
	deadline := time.NewTimer(20 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		gate, err := c.CheckBeforeWrite(ctx, runID)
		if err != nil || gate.Kind != GateReady {
			return gate, err
		}
		select {
		case <-ctx.Done():
			return WriteGate{}, ctx.Err()
		case <-deadline.C:
			return c.CheckBeforeWrite(ctx, runID)
		case <-ticker.C:
		}
	}
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
	gate, _, err := c.checkBeforeWrite(ctx, runID)
	return gate, err
}

// checkBeforeWrite is CheckBeforeWrite that also returns the run it loaded, so
// a gated write posts to the run the gate checked without reading it again.
func (c *Coordinator) checkBeforeWrite(ctx context.Context, runID string) (WriteGate, db.Run, error) {
	if runID == "" {
		return WriteGate{}, db.Run{}, errors.New("run_id is required")
	}
	run, err := c.activeRun(ctx, runID)
	if err != nil {
		return WriteGate{}, db.Run{}, err
	}
	gate := WriteGate{Run: &RunSummary{RunID: run.RunID, ChannelID: run.ChannelID, Permalink: run.Permalink}}
	if run.SlackMode == db.SlackDisabled {
		gate.Kind = GateSlackDisabled
		return gate, run, nil
	}
	if state := c.health(); state != slackapi.SocketConnected {
		gate.Kind, gate.Reason = GateUnavailable, "socket_mode "+state
		return gate, run, nil
	}
	if run.LastDeliveryError.Valid {
		gate.Kind, gate.Reason = GateUnavailable, run.LastDeliveryError.String
		return gate, run, nil
	}
	if messageTS, err := c.DB.ClaimedOwnerInput(ctx, runID); err != nil {
		return WriteGate{}, db.Run{}, err
	} else if messageTS != "" {
		gate.Kind, gate.Reason = GateUnavailable, "owner input "+messageTS+" has an unresolved reply delivery; reconcile before continuing"
		return gate, run, nil
	}
	in, pending, err := c.DB.OldestUnhandledInput(ctx, runID)
	if err != nil {
		return WriteGate{}, db.Run{}, err
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
		return gate, run, nil
	}
	gate.Kind = GateReady
	return gate, run, nil
}

// requireWriteReady runs the write gate before a gated Slack write and returns
// the run to post to. Any answer other than ready is a ContentGateError; a
// pending owner input names the reply to answer with run resolve.
func (c *Coordinator) requireWriteReady(ctx context.Context, runID string) (db.Run, error) {
	gate, run, err := c.checkBeforeWrite(ctx, runID)
	if err != nil {
		return db.Run{}, err
	}
	if gate.Kind == GateReady {
		return run, nil
	}
	reason := gate.Reason
	if gate.Kind == GateOwnerInput && gate.Input != nil {
		reason = "owner input " + gate.Input.MessageTS + " is pending; answer it with run resolve first"
	}
	return db.Run{}, &ContentGateError{Kind: gate.Kind, Reason: reason}
}
