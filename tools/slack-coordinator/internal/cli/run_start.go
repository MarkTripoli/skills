package cli

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"

	"github.com/oklog/ulid/v2"
	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/channel"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// jiraIssuePattern is the issue key shape --jira-issue accepts.
var jiraIssuePattern = regexp.MustCompile(`^[A-Z][A-Z0-9_]+-\d+$`)

func newRunStart() *cobra.Command {
	var in coordinator.StartRunInput
	var channelFlag, repo string
	c := &cobra.Command{
		Use:   "start [--channel <C…|#name>] [--repo <path>] --work <s> --goal <s> --scope <s> [--link <url>]... [--run-id <id>] [--jira-issue <KEY>]",
		Short: "Open the run's Slack thread with one root message",
		Long: `Open the run's Slack thread with one root message.

The channel comes from --channel, or from the single "Slack default channel:"
line in the repository root AGENTS.md (--repo, default: the git root of the
current directory). Either source is resolved through Slack to a channel the
bot is a member of and that is not archived before the daemon is called.

With --jira-issue the daemon writes the thread permalink to the Jira custom
field named by setup --jira-field-id; a failed write is retried in the
background and never blocks the run.`,
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
			if in.JiraIssue != "" {
				if !jiraIssuePattern.MatchString(in.JiraIssue) {
					return usageErr("--jira-issue %q must look like PROJ-123", in.JiraIssue)
				}
				if !cfg.JiraEnabled() {
					return usageErr("--jira-issue given but jira is not configured; rerun `slack-coordinator setup` with --jira-base-url, --jira-email, --jira-field-id and JIRA_API_TOKEN")
				}
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
	f.StringVar(&in.RunID, "run-id", "", "run identifier (default: a new ULID)")
	f.StringVar(&in.JiraIssue, "jira-issue", "", "Jira issue key (PROJ-123) whose configured field receives the thread permalink")
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
