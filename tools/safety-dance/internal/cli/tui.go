package cli

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/git"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/tui"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/types"
	"github.com/charmbracelet/x/term"
	"github.com/spf13/cobra"
)

func newTUI() *cobra.Command {
	c := &cobra.Command{Use: "tui", Short: "show the terminal run view", RunE: renderTUI}
	c.Flags().Bool("plain", false, "force ANSI-free one-shot output")
	return c
}
func terminalWriter(w interface{}) bool {
	file, ok := w.(*os.File)
	return ok && term.IsTerminal(file.Fd())
}

func renderTUI(cmd *cobra.Command, args []string) error {
	plain, _ := cmd.Flags().GetBool("plain")
	p, err := home()
	if err != nil {
		return err
	}
	database, err := openStatusDB(p)
	if err != nil {
		return err
	}
	defer database.Close()
	root, err := gitRoot()
	if err != nil {
		return err
	}
	repo, err := database.GetRepoByPath(root)
	if err != nil {
		return err
	}
	if repo == nil {
		return fmt.Errorf("repository is not registered")
	}
	branchRaw, err := git.Run(context.Background(), root, "symbolic-ref", "HEAD")
	if err != nil {
		return err
	}
	branch := canonicalRef(strings.TrimSpace(branchRaw))
	if branch == "" {
		return fmt.Errorf("current checkout is detached")
	}
	model := func() (tui.Model, error) {
		run, err := database.GetActiveRun(repo.ID, branch)
		if err != nil {
			return tui.Model{}, err
		}
		if run == nil {
			run, err = database.GetLatestRun(repo.ID, branch)
			if err != nil {
				return tui.Model{}, err
			}
			if run == nil {
				return tui.Model{}, nil
			}
		}
		m := tui.Model{RunID: run.ID, Branch: run.Branch, Status: run.Status, KeyHint: "approve, fix, skip, abort"}
		if run.LastPushedSHA != nil {
			m.Publication = "published " + *run.LastPushedSHA
		} else if run.PushActive {
			m.Publication = "publishing"
		} else {
			m.Publication = "not published"
		}
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
			if step.Status == types.StepStatusAwaitingApproval || step.Status == types.StepStatusFixReview {
				m.Prompt = "response required for " + string(step.StepName)
			}
		}
		return m, nil
	}
	var current tui.Model
	if plain || !term.IsTerminal(os.Stdin.Fd()) || !terminalWriter(cmd.OutOrStdout()) {
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
