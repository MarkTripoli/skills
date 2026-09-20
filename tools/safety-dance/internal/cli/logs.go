package cli

import (
	"fmt"
	"github.com/spf13/cobra"
	"os"
)

func newLogs() *cobra.Command {
	return &cobra.Command{Use: "logs", Short: "read daemon logs", RunE: func(cmd *cobra.Command, args []string) error {
		p, err := home()
		if err != nil {
			return err
		}
		b, err := os.ReadFile(p.DaemonLog())
		if os.IsNotExist(err) {
			fmt.Fprintln(cmd.OutOrStdout(), "no daemon logs")
			return nil
		}
		if err != nil {
			return err
		}
		fmt.Fprint(cmd.OutOrStdout(), string(b))
		return nil
	}}
}
