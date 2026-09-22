package cli

import (
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunResolve() *cobra.Command {
	var in coordinator.OwnerInputResolution
	c := &cobra.Command{
		Use:   "resolve --run-id <id> --message-ts <ts> --outcome applied|rejected|answered --reply <s>",
		Short: "Answer the owner's reply that run check reported",
		Long: `Answer the owner's reply that run check reported as owner_input.

The reply is posted in the run's thread and the input is marked handled with
the outcome, so the next run check moves past it. An input that is not pending
is refused before anything is posted.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			switch in.Outcome {
			case "applied", "rejected", "answered":
			default:
				return usageErr("--outcome must be applied, rejected, or answered, got %q", in.Outcome)
			}
			return callRunMethod(ipc.MethodRunResolve, in)
		},
	}
	f := c.Flags()
	f.StringVar(&in.RunID, "run-id", "", "run identifier printed by run start")
	f.StringVar(&in.MessageTS, "message-ts", "", "input.message_ts printed by run check")
	f.StringVar(&in.Outcome, "outcome", "", "applied, rejected, or answered")
	f.StringVar(&in.Reply, "reply", "", "acknowledgement posted in the thread")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("message-ts")
	_ = c.MarkFlagRequired("outcome")
	_ = c.MarkFlagRequired("reply")
	return c
}
