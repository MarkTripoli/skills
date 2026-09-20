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
	model := func() (tui.Model, error) {
		runs, err := database.GetActiveRuns()
		if err != nil {
			return tui.Model{}, err
		}
		if len(runs) == 0 {
			return tui.Model{Status: types.RunCompleted}, nil
		}
		run := runs[0]
		m := tui.Model{RunID: run.ID, Branch: run.Branch, Status: run.Status}
		if run.Error != nil {
			m.Error = *run.Error
		}
		steps, err := database.GetStepsByRun(run.ID)
		if err != nil {
			return tui.Model{}, err
		}
		if len(steps) > 0 {
			step := steps[len(steps)-1]
			m.Step = string(step.StepName)
			if step.FindingsJSON != nil {
				m.Findings = []string{*step.FindingsJSON}
			}
			if step.Status == types.StepStatusAwaitingApproval {
				m.Prompt = "response required for " + string(step.StepName)
			}
		}
		return m, nil
	}
	var current tui.Model
	if !term.IsTerminal(os.Stdin.Fd()) {
		m, err := model()
		if err != nil {
			return err
		}
		fmt.Fprintln(cmd.OutOrStdout(), tui.Plain(m))
		return nil
	}
	app := &tui.App{In: os.Stdin, Out: cmd.OutOrStdout(), Refresh: func() (tui.Model, error) {
		m, err := model()
		if err == nil {
			current = m
		}
		return m, err
	}, Respond: func(action string) error {
		if current.RunID == "" || current.Step == "" || current.Prompt == "" {
			return fmt.Errorf("no durable prompt is available")
		}
		var selected types.ApprovalAction
		switch action {
		case "approve":
			selected = types.ActionApprove
		case "fix":
			selected = types.ActionFix
		case "skip":
			selected = types.ActionSkip
		default:
			return fmt.Errorf("unsupported response action %q", action)
		}
		var out ipc.RespondResult
		return callDaemon(ipc.MethodRespond, ipc.RespondParams{RunID: current.RunID, Step: types.StepName(current.Step), Action: selected}, &out)
	}, Abort: func() error {
		if current.RunID == "" {
			return fmt.Errorf("no active run")
		}
		var out map[string]bool
		return callDaemon(ipc.MethodCancelRun, ipc.CancelRunParams{RunID: current.RunID}, &out)
	}}
	err = app.Run(cmd.Context())
	if err == context.Canceled {
		return nil
	}
	return err
}
