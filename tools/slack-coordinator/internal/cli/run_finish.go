package cli

import (
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunFinish() *cobra.Command {
	var in coordinator.FinishRunInput
	c := &cobra.Command{
		Use:   "finish --run-id <id> --outcome completed|failed|cancelled [--completed <s>]... [--decision <s>]... [--unresolved <s>]... [--evidence <s>]... [--link <url>]...",
		Short: "Post the completion message and close the run",
		Long: `Post the completion message and close the run.

The outcome becomes the run's terminal lifecycle; later run event or run finish
calls for the same run are refused.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			switch in.Outcome {
			case "completed", "failed", "cancelled":
			default:
				return usageErr("--outcome must be completed, failed, or cancelled, got %q", in.Outcome)
			}
			return callRunMethod(ipc.MethodRunFinish, in)
		},
	}
	f := c.Flags()
	f.StringVar(&in.RunID, "run-id", "", "run identifier printed by run start")
	f.StringVar(&in.Outcome, "outcome", "", "completed, failed, or cancelled")
	f.StringArrayVar(&in.Completed, "completed", nil, "work completed (repeatable)")
	f.StringArrayVar(&in.Decisions, "decision", nil, "decision made (repeatable)")
	f.StringArrayVar(&in.Unresolved, "unresolved", nil, "item left unresolved (repeatable)")
	f.StringArrayVar(&in.Evidence, "evidence", nil, "evidence of the outcome (repeatable)")
	f.StringArrayVar(&in.Links, "link", nil, "related URL (repeatable)")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("outcome")
	return c
}
