package cli

import (
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunEvent() *cobra.Command {
	var e coordinator.WorkEvent
	c := &cobra.Command{
		Use:   "event --run-id <id> --current <s> [--completed <s>]... [--decision <s>]... [--blocker <s>]... [--next <s>]...",
		Short: "Post a status update to the run's thread",
		Long: `Post a status update to the run's thread.

The update is stored as the run's last status and reposted after one quiet
interval with no further events. A run that has finished is refused.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return callRunMethod(ipc.MethodRunEvent, e)
		},
	}
	f := c.Flags()
	f.StringVar(&e.RunID, "run-id", "", "run identifier printed by run start")
	f.StringVar(&e.Current, "current", "", "what the run is doing now")
	f.StringArrayVar(&e.Completed, "completed", nil, "work completed since the last update (repeatable)")
	f.StringArrayVar(&e.Decisions, "decision", nil, "decision made (repeatable)")
	f.StringArrayVar(&e.Blockers, "blocker", nil, "current blocker (repeatable)")
	f.StringArrayVar(&e.Next, "next", nil, "work up next (repeatable)")
	_ = c.MarkFlagRequired("run-id")
	_ = c.MarkFlagRequired("current")
	return c
}

// callRunMethod sends one run.* request that returns no data and maps the
// failure through daemonErr.
func callRunMethod(method string, params interface{}) error {
	var out ipc.EmptyResult
	if err := callDaemon(method, params, &out); err != nil {
		return daemonErr(err)
	}
	return nil
}
