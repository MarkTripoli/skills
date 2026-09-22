package cli

import (
	"encoding/json"
	"errors"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunCheck() *cobra.Command {
	var params coordinator.CheckParams
	c := &cobra.Command{
		Use:   "check --run-id <id>",
		Short: "Ask whether the run may take its next state-changing action",
		Long: `Ask whether the run may take its next state-changing action.

stdout holds one JSON object with "kind" and the exit code follows it:
  {"kind":"ready"}                                              exit 0
  {"kind":"owner_input","input":{"message_ts":"...","text":"..."}} exit 10
  {"kind":"unavailable","reason":"..."}                         exit 11

owner_input means the run owner replied in the thread: read input.text, act
on it, then run resolve --message-ts <input.message_ts> before checking again.
A daemon that does not answer is reported as unavailable with the same shape.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			gate, err := checkRun(params)
			if err != nil {
				return err
			}
			if err := json.NewEncoder(cmd.OutOrStdout()).Encode(gate); err != nil {
				return err
			}
			return gateExit(gate)
		},
	}
	c.Flags().StringVar(&params.RunID, "run-id", "", "run identifier printed by run start")
	_ = c.MarkFlagRequired("run-id")
	return c
}

// checkRun asks the daemon for the gate. An unreachable daemon is itself an
// unavailable gate so agents parse one shape; a daemon refusal (unknown run)
// is a usage error.
func checkRun(params coordinator.CheckParams) (coordinator.WriteGate, error) {
	client, err := dialDaemon()
	if err != nil {
		var coded *ExitCodeError
		if errors.As(err, &coded) {
			return coordinator.WriteGate{}, err
		}
		return coordinator.WriteGate{Kind: coordinator.GateUnavailable, Reason: "daemon unreachable: " + err.Error()}, nil
	}
	defer client.Close()
	var gate coordinator.WriteGate
	if err := client.Call(ipc.MethodRunCheck, params, &gate); err != nil {
		return coordinator.WriteGate{}, daemonErr(err)
	}
	return gate, nil
}

// gateExit maps the gate kind to the process exit code.
func gateExit(gate coordinator.WriteGate) error {
	switch gate.Kind {
	case coordinator.GateReady:
		return nil
	case coordinator.GateOwnerInput:
		if gate.Input == nil {
			return fmt.Errorf("daemon returned owner_input without the input")
		}
		return &ExitCodeError{Code: ExitOwnerInput, Err: fmt.Errorf("owner input pending: %s", gate.Input.Text)}
	case coordinator.GateUnavailable:
		return &ExitCodeError{Code: ExitUnavailable, Err: errors.New(gate.Reason)}
	default:
		return fmt.Errorf("daemon returned unknown gate kind %q", gate.Kind)
	}
}
