package cli

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/oklog/ulid/v2"
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/channel"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

func newRunStart() *cobra.Command {
	var in coordinator.StartRunInput
	var channelFlag, repo string
	c := &cobra.Command{
		Use:   "start [--channel <C…|#name>] [--repo <path>] --work <s> --goal <s> --scope <s> [--link <url>]... [--owner <U…>] [--run-id <id>]",
		Short: "Open the run's Slack thread with one root message",
		Long: `Open the run's Slack thread with one root message.

The channel comes from --channel, or from the single "Slack default channel:"
line in the repository root AGENTS.md (--repo, default: the git root of the
current directory). Either source is resolved through Slack to a channel the
bot is a member of and that is not archived before the daemon is called.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			p, err := home()
			if err != nil {
				return err
			}
			cfg, err := loadConfig(p)
			if err != nil {
				return err
			}
			ref, err := refFromFlagsOrAgentsMD(channelFlag, repo)
			if err != nil {
				return err
			}
			id, err := channel.Resolve(cmd.Context(), slackapi.New(cfg.Slack), ref)
			if err != nil {
				return usageErr("%w", err)
			}
			in.ChannelID = id
			if in.RunID == "" {
				in.RunID = ulid.Make().String()
			}
			if in.OwnerUserID == "" {
				in.OwnerUserID = cfg.Slack.OwnerUserID
			}
			var runRef coordinator.SlackRunRef
			if err := callDaemon(ipc.MethodRunStart, in, &runRef); err != nil {
				return daemonErr(err)
			}
			return json.NewEncoder(cmd.OutOrStdout()).Encode(runRef)
		},
	}
	f := c.Flags()
	f.StringVar(&channelFlag, "channel", "", "Slack channel ID or #name to post in (default: the AGENTS.md directive)")
	f.StringVar(&repo, "repo", "", "repository root holding AGENTS.md (default: git root of the current directory)")
	f.StringVar(&in.Work, "work", "", "what the run is doing")
	f.StringVar(&in.Goal, "goal", "", "what done looks like")
	f.StringVar(&in.Scope, "scope", "", "what the run touches and leaves alone")
	f.StringArrayVar(&in.Links, "link", nil, "related URL (repeatable)")
	f.StringVar(&in.OwnerUserID, "owner", "", "Slack user ID of the run owner (default: slack.owner_user_id from config)")
	f.StringVar(&in.RunID, "run-id", "", "run identifier (default: a new ULID)")
	return c
}

// refFromFlagsOrAgentsMD parses --channel when given; otherwise it reads the
// one directive from <repo>/AGENTS.md. Every failure is a usage or repository
// error (exit 2).
func refFromFlagsOrAgentsMD(channelFlag, repo string) (channel.Ref, error) {
	if channelFlag != "" {
		ref, err := channel.ParseRef(channelFlag)
		if err != nil {
			return channel.Ref{}, usageErr("--channel: %w", err)
		}
		return ref, nil
	}
	if repo == "" {
		root, err := gitRoot()
		if err != nil {
			return channel.Ref{}, usageErr("--channel not given and --repo could not default: %w", err)
		}
		repo = root
	}
	agentsMD := filepath.Join(repo, "AGENTS.md")
	data, err := os.ReadFile(agentsMD)
	if err != nil {
		return channel.Ref{}, usageErr("--channel not given: read %s: %w", agentsMD, err)
	}
	ref, err := channel.ParseDefault(data)
	if err != nil {
		return channel.Ref{}, usageErr("--channel not given: %s: %w", agentsMD, err)
	}
	return ref, nil
}
