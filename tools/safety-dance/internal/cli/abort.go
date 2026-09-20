package cli

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/spf13/cobra"
)

func newAbort() *cobra.Command {
	return &cobra.Command{Use: "abort <run-id>", Args: cobra.ExactArgs(1), Short: "abort a validation run", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		var out ipc.CancelRunResult
		if err := callDaemon(ipc.MethodCancelRun, ipc.CancelRunParams{RunID: args[0]}, &out); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "run cancelled")
		return nil
	}}
}
