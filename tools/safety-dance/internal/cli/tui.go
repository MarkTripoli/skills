package cli

import (
	"context"
	"fmt"
	"os"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/tui"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/charmbracelet/x/term"
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
	if !term.IsTerminal(os.Stdin.Fd()) {
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
	app := &tui.App{In: os.Stdin, Out: cmd.OutOrStdout(), Refresh: func() (tui.Model, error) {
		runs, err := database.GetActiveRuns()
		if err != nil {
			return tui.Model{}, err
		}
		if len(runs) == 0 {
			return tui.Model{Status: types.RunCompleted}, nil
		}
		run := runs[0]
		var runError string
		if run.Error != nil {
			runError = *run.Error
		}
		return tui.Model{RunID: run.ID, Branch: run.Branch, Status: run.Status, Error: runError}, nil
	}, Abort: func() error {
		runs, err := database.GetActiveRuns()
		if err != nil || len(runs) == 0 {
			return err
		}
		var out map[string]bool
		return callDaemon(ipc.MethodCancelRun, ipc.CancelRunParams{RunID: runs[0].ID}, &out)
	}}
	err = app.Run(cmd.Context())
	if err == context.Canceled {
		return nil
	}
	return err
}
