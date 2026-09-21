package cli

import (
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/spf13/cobra"
)

func newRun() *cobra.Command {
	return &cobra.Command{Use: "run", Short: "start a validation run", RunE: func(cmd *cobra.Command, args []string) error {
		if err := nestedMutation(); err != nil {
			return err
		}
		root, err := gitRoot()
		if err != nil {
			return err
		}
		p, d, err := openRuntime()
		if err != nil {
			return err
		}
		defer d.Close()
		repo, err := d.GetRepoByPath(root)
		if err != nil {
			return err
		}
		if repo == nil {
			return fmt.Errorf("repository is not initialized")
		}
		branch, err := gitValue("symbolic-ref", "--short", "HEAD")
		if err != nil {
			return err
		}
		head, err := gitValue("rev-parse", "HEAD")
		if err != nil {
			return err
		}
		var out ipc.StartFreshRunResult
		if err := callDaemon(ipc.MethodStartFreshRun, ipc.StartFreshRunParams{RepoID: repo.ID, Branch: branch, HeadSHA: head}, &out); err != nil {
			return err
		}
		fmt.Fprintf(cmd.OutOrStdout(), "run %s started\n", out.Receipt.RunID)
		_ = p
		return nil
	}}
}
