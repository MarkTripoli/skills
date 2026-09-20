package cli

import (
	"context"
	"fmt"
	"github.com/spf13/cobra"
)

func newInit() *cobra.Command {
	return &cobra.Command{Use: "init", Short: "initialize Safety Dance", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		if err := initGate(context.Background()); err != nil {
			return err
		}
		p, d, err := openRuntime()
		if err != nil {
			return err
		}
		defer d.Close()
		fmt.Fprintln(cmd.OutOrStdout(), "initialized", p.Root())
		return nil
	}}
}
