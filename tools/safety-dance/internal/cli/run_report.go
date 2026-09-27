package cli

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
)

func newRunReport() *cobra.Command {
	return &cobra.Command{Use: "run-report RUN_ID", Short: "show local outcome and measured usage for one run", Args: cobra.ExactArgs(1), RunE: runReportCommand}
}

func runReportCommand(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil { return err }
	d, err := openStatusDB(p)
	if err != nil { return err }
	defer d.Close()
	report, err := d.GetRunMetrics(args[0])
	if err != nil { return err }
	if report == nil { return fmt.Errorf("run %q not found", args[0]) }
	encoder := json.NewEncoder(cmd.OutOrStdout())
	encoder.SetIndent("", "  ")
	return encoder.Encode(report)
}


