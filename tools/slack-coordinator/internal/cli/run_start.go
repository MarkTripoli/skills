package cli

import (
	"encoding/json"
	"errors"

	"github.com/oklog/ulid/v2"
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

func newRunStart() *cobra.Command {
	var in coordinator.StartRunInput
	c := &cobra.Command{
		Use:   "start --channel <C…> --work <s> --goal <s> --scope <s> [--link <url>]... [--owner <U…>] [--run-id <id>]",
		Short: "Open the run's Slack thread with one root message",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if in.ChannelID == "" {
				return usageErr("--channel is required")
			}
			if in.RunID == "" {
				in.RunID = ulid.Make().String()
			}
			if in.OwnerUserID == "" {
				p, err := home()
				if err != nil {
					return err
				}
				cfg, err := loadConfig(p)
				if err != nil {
					return err
				}
				in.OwnerUserID = cfg.Slack.OwnerUserID
			}
			var ref coordinator.SlackRunRef
			if err := callDaemon(ipc.MethodRunStart, in, &ref); err != nil {
				var rpcErr *ipc.RPCError
				if errors.As(err, &rpcErr) {
					return usageErr("%s", rpcErr.Message)
				}
				return err
			}
			return json.NewEncoder(cmd.OutOrStdout()).Encode(ref)
		},
	}
	f := c.Flags()
	f.StringVar(&in.ChannelID, "channel", "", "Slack channel ID to post in")
	f.StringVar(&in.Work, "work", "", "what the run is doing")
	f.StringVar(&in.Goal, "goal", "", "what done looks like")
	f.StringVar(&in.Scope, "scope", "", "what the run touches and leaves alone")
	f.StringArrayVar(&in.Links, "link", nil, "related URL (repeatable)")
	f.StringVar(&in.OwnerUserID, "owner", "", "Slack user ID of the run owner (default: slack.owner_user_id from config)")
	f.StringVar(&in.RunID, "run-id", "", "run identifier (default: a new ULID)")
	return c
}
