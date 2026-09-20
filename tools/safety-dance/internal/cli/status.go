package cli

import (
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/spf13/cobra"
)

func newStatus() *cobra.Command {
	return &cobra.Command{Use: "status", Short: "show daemon and run status", RunE: statusCommand}
}

func statusCommand(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	d, err := openStatusDB(p)
	if err != nil {
		return err
	}
	defer d.Close()
	fmt.Fprintf(cmd.OutOrStdout(), "home: %s\n", p.Root())
	runs, err := d.GetActiveRuns()
	if err != nil {
		return err
	}
	if len(runs) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), "runs: none")
		return nil
	}
	for _, run := range runs {
		status := run.Status
		if status == "" {
			status = types.RunFailed
		}
		fmt.Fprintf(cmd.OutOrStdout(), "run: %s branch=%s status=%s head=%s\n", run.ID, run.Branch, status, run.HeadSHA)
	}
	return nil
}

func openStatusDB(p *paths.Paths) (*db.DB, error) {
	if err := p.EnsureDirs(); err != nil {
		return nil, err
	}
	return db.Open(p.DB())
}
