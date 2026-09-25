package cli

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunWait() *cobra.Command {
	var params coordinator.CheckParams
	c := &cobra.Command{
		Use:   "wait --run-id <id>",
		Short: "Wait up to 20 seconds for owner input on an idle run",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			client, err := dialDaemon()
			var gate coordinator.WriteGate
			if err != nil {
				var coded *ExitCodeError
				if errors.As(err, &coded) {
					return err
				}
				gate = coordinator.WriteGate{Kind: coordinator.GateUnavailable, Reason: "daemon unreachable: " + err.Error()}
			} else {
				defer client.Close()
				if err := client.CallWithContext(cmd.Context(), ipc.MethodRunWait, params, &gate, 22*time.Second); err != nil {
					gate, err = gateCallError(err)
					if err != nil {
						return err
					}
				}
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
