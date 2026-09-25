package cli

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunCadence() *cobra.Command {
	var runID string
	var every time.Duration
	c := &cobra.Command{
		Use:   "cadence --run-id <id> --every <duration>",
		Short: "Change the run's routine root-update cadence (default 3h)",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if every < time.Second || every%time.Second != 0 {
				return usageErr("--every must be a whole number of seconds (at least 1s)")
			}
			if runID == "" {
				return usageErr("--run-id is required")
			}
			if err := callRunMethod(ipc.MethodRunCadence, coordinator.StatusCadenceInput{RunID: runID, Seconds: int64(every / time.Second)}); err != nil {
				return fmt.Errorf("set run cadence: %w", err)
			}
			return nil
		},
	}
	c.Flags().StringVar(&runID, "run-id", "", "active run identifier")
	c.Flags().DurationVar(&every, "every", 0, "routine root-update interval, e.g. 30m or 3h")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("every")
	return c
}
