package cli

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

func newLogs() *cobra.Command {
	return &cobra.Command{Use: "logs [run-id]", Short: "read daemon or run logs", Args: cobra.MaximumNArgs(1), RunE: func(cmd *cobra.Command, args []string) error {
		p, err := home()
		if err != nil {
			return err
		}
		path := p.DaemonLog()
		if len(args) == 1 {
			path = filepath.Join(p.RunLogDir(args[0]), "run.log")
		}
		b, err := os.ReadFile(path)
		if os.IsNotExist(err) {
			fmt.Fprintln(cmd.OutOrStdout(), "no logs")
			return nil
		}
		if err != nil {
			return err
		}
		fmt.Fprint(cmd.OutOrStdout(), string(b))
		return nil
	}}
}
