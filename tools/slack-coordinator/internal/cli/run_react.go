package cli

import (
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunReact() *cobra.Command {
	var in coordinator.ReactRunInput
	c := &cobra.Command{
		Use:   "react --run-id <id> --emoji <name>",
		Short: "Add an emoji reaction to the run's main message",
		Args:  cobra.NoArgs,
		RunE: func(_ *cobra.Command, _ []string) error {
			return callRunMethod(ipc.MethodRunReact, in)
		},
	}
	f := c.Flags()
	f.StringVar(&in.RunID, "run-id", "", "run identifier printed by run start")
	f.StringVar(&in.Emoji, "emoji", "", "Slack emoji name, with or without colons")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("emoji")
	return c
}
