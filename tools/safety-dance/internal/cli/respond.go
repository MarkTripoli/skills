package cli

import (
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/spf13/cobra"
)

func newRespond() *cobra.Command {
	var step, action string
	c := &cobra.Command{Use: "respond <run-id>", Args: cobra.ExactArgs(1), Short: "respond to a validation prompt", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		if step == "" || action == "" {
			return fmt.Errorf("--step and --action are required")
		}
		var out ipc.RespondResult
		if err := callDaemon(ipc.MethodRespond, ipc.RespondParams{RunID: args[0], Step: types.StepName(step), Action: types.ApprovalAction(action)}, &out); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "response accepted")
		return nil
	}}
	c.Flags().StringVar(&step, "step", "", "pipeline step")
	c.Flags().StringVar(&action, "action", "", "approval action")
	return c
}
