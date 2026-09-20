package cli

import (
	"fmt"
	"github.com/spf13/cobra"
)

func newStatus() *cobra.Command {
	return &cobra.Command{Use: "status", Short: "show daemon status", RunE: statusCommand}
}
func statusCommand(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	fmt.Fprintf(cmd.OutOrStdout(), "home: %s\n", p.Root())
	return nil
}
