package cli

import (
	"encoding/json"
	"strings"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunReply() *cobra.Command {
	var in coordinator.ReplyParams
	c := &cobra.Command{
		Use:   "reply --run-id <id> --text <s>",
		Short: "Post a progress reply in the run's thread",
		Long: `Post --text verbatim as a reply in the run's thread.

Slack renders the text as mrkdwn, so mentions in it notify. Use it for
routine progress when the owner asked for a running log. It never
edits the root or the status card and does not change the status cadence.
The daemon checks the run first and refuses the reply when an owner reply is
pending or Slack coordination is unavailable.

stdout holds one JSON object on success:
  {"run_id":"...","thread_ts":"...","message_ts":"..."}

Exit codes: 0 posted; 2 usage error (including text over 40,000
characters), unknown run, or finished run; 11 owner
input pending, coordination unavailable, or the post failed; 12 Slack is
disabled for the run (nothing posted).`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if strings.TrimSpace(in.Text) == "" {
				return usageErr("--text must not be empty")
			}
			var result coordinator.ReplyResult
			if err := callDaemon(ipc.MethodRunReply, in, &result); err != nil {
				return daemonErr(err)
			}
			return json.NewEncoder(cmd.OutOrStdout()).Encode(result)
		},
	}
	f := c.Flags()
	f.StringVar(&in.RunID, "run-id", "", "run identifier printed by run start")
	f.StringVar(&in.Text, "text", "", "reply text, posted verbatim")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("text")
	return c
}
