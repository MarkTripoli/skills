package coordinator

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

// Register binds the IPC methods to the use cases. health reports the daemon's
// state; shutdown asks the daemon to stop after the reply is written.
func Register(s *ipc.Server, c *Coordinator, health func() ipc.HealthResult, shutdown func()) {
	s.Handle(ipc.MethodRunStart, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in StartRunInput
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		ref, err := c.StartRun(ctx, in)
		if err != nil {
			return nil, rpcError(err)
		}
		return ref, nil
	})
	s.Handle(ipc.MethodRunEvent, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var e WorkEvent
		if err := decode(params, &e); err != nil {
			return nil, err
		}
		if err := c.RecordWorkEvent(ctx, e); err != nil {
			return nil, rpcError(err)
		}
		return ipc.EmptyResult{}, nil
	})
	s.Handle(ipc.MethodRunFinish, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in FinishRunInput
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		if err := c.FinishRun(ctx, in); err != nil {
			return nil, rpcError(err)
		}
		return ipc.EmptyResult{}, nil
	})
	s.Handle(ipc.MethodRunCheck, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in CheckParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		return c.CheckBeforeWrite(ctx, in.RunID)
	})
	s.Handle(ipc.MethodDaemonHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return health(), nil
	})
	s.Handle(ipc.MethodDaemonShutdown, func(context.Context, json.RawMessage) (interface{}, error) {
		shutdown()
		return ipc.ShutdownResult{OK: true}, nil
	})
}

// rpcError gives a failed Slack post the ErrUnavailable code so the CLI exits
// 11; every other failure keeps the default internal code (exit 2).
func rpcError(err error) error {
	var delivery *DeliveryError
	if errors.As(err, &delivery) {
		return &ipc.RPCError{Code: ipc.ErrUnavailable, Message: err.Error()}
	}
	return err
}

func decode(params json.RawMessage, into interface{}) error {
	if len(params) == 0 {
		return fmt.Errorf("params are required")
	}
	if err := json.Unmarshal(params, into); err != nil {
		return fmt.Errorf("invalid params: %w", err)
	}
	return nil
}
