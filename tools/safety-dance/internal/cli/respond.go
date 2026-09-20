package cli

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/spf13/cobra"
)

func newRespond() *cobra.Command {
	return &cobra.Command{Use: "respond <run-id>", Args: cobra.ExactArgs(1), Short: "respond to a validation prompt", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		var out ipc.RespondResult
		if err := callDaemon(ipc.MethodRespond, ipc.RespondParams{RunID: args[0]}, &out); err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), "response accepted")
		return nil
	}}
}
