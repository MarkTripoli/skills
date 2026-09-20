package cli

import "github.com/spf13/cobra"

func launchDefault(cmd *cobra.Command, args []string) error {
	root, err := gitRoot()
	if err != nil {
		return statusCommand(cmd, args)
	}
	_, database, err := openRuntime()
	if err != nil {
		return err
	}
	repo, err := database.GetRepoByPath(root)
	if err != nil {
		database.Close()
		return err
	}
	if repo == nil {
		database.Close()
		return runWizard(cmd, args)
	}
	run, err := database.GetActiveRun(repo.ID, "")
	database.Close()
	if err != nil {
		return err
	}
	if run != nil {
		return renderTUI(cmd, args)
	}
	return statusCommand(cmd, args)
}
