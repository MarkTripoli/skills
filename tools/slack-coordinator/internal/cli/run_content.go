package cli

import (
	"encoding/json"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/spf13/cobra"
)

func newRunContent() *cobra.Command {
	var in coordinator.ContentParams
	c := &cobra.Command{Use: "content --run-id <id> [--page <n>]", Short: "List the run channel's files, bookmarks and canvas ID", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		var result coordinator.ContentResult
		if err := callDaemon(ipc.MethodRunContent, in, &result); err != nil {
			return daemonErr(err)
		}
		return json.NewEncoder(cmd.OutOrStdout()).Encode(result)
	}}
	c.Flags().StringVar(&in.RunID, "run-id", "", "active run identifier")
	c.Flags().IntVar(&in.Page, "page", 1, "file page, starting at 1")
	_ = c.MarkFlagRequired("run-id")
	return c
}

func newRunListItems() *cobra.Command {
	var in coordinator.ListItemsParams
	c := &cobra.Command{Use: "list-items --run-id <id> --list-id <F...> [--cursor <cursor>]", Short: "Read a page of items from a List shared in the run channel", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		var result json.RawMessage
		if err := callDaemon(ipc.MethodRunListItems, in, &result); err != nil {
			return daemonErr(err)
		}
		_, err := cmd.OutOrStdout().Write(append(result, '\n'))
		return err
	}}
	c.Flags().StringVar(&in.RunID, "run-id", "", "active run identifier")
	c.Flags().StringVar(&in.ListID, "list-id", "", "Slack List ID from the channel files or tabs")
	c.Flags().StringVar(&in.Cursor, "cursor", "", "next_cursor from the previous page")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("list-id")
	return c
}

func newRunUpload() *cobra.Command {
	var in coordinator.UploadParams
	c := &cobra.Command{Use: "upload --run-id <id> --path <file> [--title <title>]", Short: "Share a local file in the run thread", Args: cobra.NoArgs, RunE: func(cmd *cobra.Command, _ []string) error {
		var result coordinator.UploadResult
		if err := callDaemonWithin(cmd.Context(), 2*time.Minute, ipc.MethodRunUpload, in, &result); err != nil {
			return daemonErr(err)
		}
		return json.NewEncoder(cmd.OutOrStdout()).Encode(result)
	}}
	c.Flags().StringVar(&in.RunID, "run-id", "", "active run identifier")
	c.Flags().StringVar(&in.Path, "path", "", "local file path accessible to the daemon")
	c.Flags().StringVar(&in.Title, "title", "", "Slack file title")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("path")
	return c
}
