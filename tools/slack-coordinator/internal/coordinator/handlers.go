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
	s.Handle(ipc.MethodRunCadence, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in StatusCadenceInput
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		if err := c.SetStatusCadence(ctx, in); err != nil {
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
	s.Handle(ipc.MethodRunReact, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in ReactRunInput
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		if err := c.ReactRun(ctx, in); err != nil {
			return nil, rpcError(err)
		}
		return ipc.EmptyResult{}, nil
	})
	s.Handle(ipc.MethodRunContent, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in ContentParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		result, err := c.ListContent(ctx, in)
		if err != nil {
			return nil, rpcError(err)
		}
		return result, nil
	})
	s.Handle(ipc.MethodRunListItems, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in ListItemsParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		return c.ListItems(ctx, in)
	})
	s.Handle(ipc.MethodRunUpload, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in UploadParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		result, err := c.UploadContent(ctx, in)
		if err != nil {
			return nil, rpcError(err)
		}
		return result, nil
	})
	s.Handle(ipc.MethodRunCheck, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in CheckParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		return c.CheckBeforeWrite(ctx, in.RunID)
	})
	s.Handle(ipc.MethodRunWait, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in CheckParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		return c.WaitBeforeWrite(ctx, in.RunID)
	})
	s.Handle(ipc.MethodRunResolve, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in OwnerInputResolution
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		if err := c.ResolveOwnerInput(ctx, in); err != nil {
			return nil, rpcError(err)
		}
		return ipc.EmptyResult{}, nil
	})
	s.Handle(ipc.MethodRunDisableSlack, func(ctx context.Context, params json.RawMessage) (interface{}, error) {
		var in DisableSlackParams
		if err := decode(params, &in); err != nil {
			return nil, err
		}
		if err := c.DisableSlackForRun(ctx, in.RunID); err != nil {
			return nil, rpcError(err)
		}
		return ipc.EmptyResult{}, nil
	})
	s.Handle(ipc.MethodDaemonHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return health(), nil
	})
	s.Handle(ipc.MethodDaemonShutdown, func(context.Context, json.RawMessage) (interface{}, error) {
		shutdown()
		return ipc.ShutdownResult{OK: true}, nil
	})
}

// rpcError maps failed Slack delivery to exit 11, a disabled reaction to
// exit 12, and all other failures to exit 2.
func rpcError(err error) error {
	var delivery *DeliveryError
	var gate *ContentGateError
	if errors.As(err, &gate) {
		if gate.Kind == GateSlackDisabled {
			return &ipc.RPCError{Code: ipc.ErrSlackDisabled, Message: err.Error()}
		}
		return &ipc.RPCError{Code: ipc.ErrUnavailable, Message: err.Error()}
	}
	if errors.Is(err, ErrRunSlackDisabled) {
		return &ipc.RPCError{Code: ipc.ErrSlackDisabled, Message: err.Error()}
	}
	if errors.Is(err, ErrResolveUnavailable) {
		return &ipc.RPCError{Code: ipc.ErrUnavailable, Message: err.Error()}
	}
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
