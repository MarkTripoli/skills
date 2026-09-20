package cli

import "github.com/spf13/cobra"

func launchDefault(cmd *cobra.Command, args []string) error {
	root, err := gitRoot()
	if err != nil {
		return statusCommand(cmd, args)
	}
	p, database, err := openRuntime()
	if err != nil {
		return err
	}
	repo, err := database.GetRepoByPath(root)
	if err != nil {
		database.Close()
		return err
	}
	runs, runsErr := database.GetActiveRuns()
	database.Close()
	if runsErr != nil {
		return runsErr
	}
	if repo == nil {
		return runWizard(cmd, args)
	}
	if len(runs) > 0 {
		return renderTUI(cmd, args)
	}
	_ = p
	return statusCommand(cmd, args)
}
