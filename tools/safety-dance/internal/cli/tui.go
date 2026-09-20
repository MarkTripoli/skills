package cli

import (
	"fmt"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/tui"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/spf13/cobra"
)

func newTUI() *cobra.Command {
	return &cobra.Command{Use: "tui", Short: "show the terminal run view", RunE: renderTUI}
}

func renderTUI(cmd *cobra.Command, args []string) error {
	p, err := home()
	if err != nil {
		return err
	}
	database, err := openStatusDB(p)
	if err != nil {
		return err
	}
	defer database.Close()
	runs, err := database.GetActiveRuns()
	if err != nil {
		return err
	}
	if len(runs) == 0 {
		fmt.Fprintln(cmd.OutOrStdout(), tui.Plain(tui.Model{Status: types.RunCompleted}))
		return nil
	}
	run := runs[0]
	var runError string
	if run.Error != nil {
		runError = *run.Error
	}
	fmt.Fprintln(cmd.OutOrStdout(), tui.Plain(tui.Model{RunID: run.ID, Branch: run.Branch, Status: run.Status, Error: runError}))
	return nil
}
