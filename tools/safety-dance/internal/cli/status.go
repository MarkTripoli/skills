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
	active, err := d.GetActiveRuns()
	if err != nil {
		return err
	}
	// Keep one current record per repository/branch, then fill branches that
	// have no active run with their newest terminal outcome.
	runs := make([]*db.Run, 0, len(active))
	seen := make(map[string]bool)
	for _, run := range active {
		key := run.RepoID + "\x00" + run.Branch
		seen[key] = true
		runs = append(runs, run)
	}
	repos, repoErr := d.GetRepos()
	if repoErr != nil {
		return repoErr
	}
	for _, repo := range repos {
		history, historyErr := d.GetRunsByRepo(repo.ID)
		if historyErr != nil {
			return historyErr
		}
		for _, run := range history {
			key := run.RepoID + "\x00" + run.Branch
			if seen[key] {
				continue
			}
			seen[key] = true
			runs = append(runs, run)
		}
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
		steps, stepsErr := d.GetStepsByRun(run.ID)
		if stepsErr != nil {
			return stepsErr
		}
		for _, step := range steps {
			if step.Status == types.StepStatusAwaitingApproval || step.Status == types.StepStatusFixReview {
				fmt.Fprintf(cmd.OutOrStdout(), "prompt: run=%s step=%s step_id=%s generation=%d actions=approve,fix,skip,abort\n", run.ID, step.StepName, step.ID, step.PromptGeneration)
			}
		}
	}
	return nil
}

func openStatusDB(p *paths.Paths) (*db.DB, error) {
	if err := p.EnsureDirs(); err != nil {
		return nil, err
	}
	return db.Open(p.DB())
}
