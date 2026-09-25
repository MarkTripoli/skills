package cli

import "github.com/spf13/cobra"

func newRun() *cobra.Command {
	r := &cobra.Command{Use: "run", Short: "Report one agent run to its Slack thread"}
	r.AddCommand(newRunStart(), newRunEvent(), newRunNote(), newRunCadence(), newRunCheck(), newRunWait(), newRunResolve(), newRunFinish(), newRunReact(), newRunContent(), newRunListItems(), newRunUpload(), newRunDisableSlack())
	return r
}
