package cli

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunWait() *cobra.Command {
	var params coordinator.CheckParams
	var wait time.Duration
	c := &cobra.Command{
		Use:   "wait --run-id <id> [--for <duration>]",
		Short: "Wait for owner input on an idle run",
		Long: `Wait for owner input on an idle run.

Returns as soon as the gate is not ready, with the same JSON and exit code as
run check. The daemon answers each wait within 20 seconds; --for repeats those
waits until the duration has passed, so one call can cover a longer idle stretch.
Keep --for below the command timeout of the tool that runs it.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			deadline := time.Now().Add(wait)
			for {
				gate, err := waitRun(cmd.Context(), params)
				if err != nil {
					return err
				}
				if gate.Kind != coordinator.GateReady || !time.Now().Before(deadline) {
					if err := json.NewEncoder(cmd.OutOrStdout()).Encode(gate); err != nil {
						return err
					}
					return gateExit(gate)
				}
			}
		},
	}
	c.Flags().StringVar(&params.RunID, "run-id", "", "run identifier printed by run start")
	c.Flags().DurationVar(&wait, "for", 0, "keep waiting up to this long, for example 1m or 9m (default: one 20-second wait)")
	_ = c.MarkFlagRequired("run-id")
	return c
}

// waitRun asks the daemon for one bounded wait. An unreachable daemon is an
// unavailable gate, matching checkRun.
func waitRun(ctx context.Context, params coordinator.CheckParams) (coordinator.WriteGate, error) {
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
	if err := client.CallWithContext(ctx, ipc.MethodRunWait, params, &gate, 22*time.Second); err != nil {
		return gateCallError(err)
	}
	return gate, nil
}
