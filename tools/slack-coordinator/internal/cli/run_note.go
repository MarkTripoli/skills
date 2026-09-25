package cli

import (
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunNote() *cobra.Command {
	var e coordinator.WorkEvent
	c := &cobra.Command{
		Use:   "note --run-id <id> --text <s>",
		Short: "Save one sentence for the run's root message",
		Long: `Save one sentence as the run's latest status. The root is edited when
the run's routine cadence is due; an identical note is ignored. A finished
run is refused.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return callRunMethod(ipc.MethodRunEvent, e)
		},
	}
	c.Flags().StringVar(&e.RunID, "run-id", "", "run identifier printed by run start")
	c.Flags().StringVar(&e.Note, "text", "", "the sentence to post")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("text")
	return c
}
