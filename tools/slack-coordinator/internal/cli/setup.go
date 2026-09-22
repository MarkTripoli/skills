package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
)

func newSetup() *cobra.Command {
	var owner string
	var installService bool
	var jira config.Jira
	c := &cobra.Command{
		Use:   "setup --owner <U…> [--install-service] [--jira-base-url <url> --jira-email <email> --jira-field-id <customfield_N>]",
		Short: "Validate SLACK_BOT_TOKEN and SLACK_APP_TOKEN and write config.yaml",
		Long: `Reads SLACK_BOT_TOKEN and SLACK_APP_TOKEN from the environment, checks that the bot
token authenticates and the app token can open Socket Mode, then writes
$SLACK_COORDINATOR_HOME/config.yaml (default ~/.slack-coordinator). It never
reads a repository .env file. With --install-service it then installs the
launchd or systemd user service that supervises the daemon.

Jira backlinks are optional: give --jira-base-url, --jira-email, and
--jira-field-id together with JIRA_API_TOKEN in the environment, or none of
them.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			bot, app := os.Getenv("SLACK_BOT_TOKEN"), os.Getenv("SLACK_APP_TOKEN")
			if bot == "" || app == "" {
				return usageErr("SLACK_BOT_TOKEN and SLACK_APP_TOKEN must both be set in the environment")
			}
			cfg := &config.Config{Slack: config.Slack{BotToken: bot, AppToken: app, OwnerUserID: owner}}
			jira.APIToken = os.Getenv("JIRA_API_TOKEN")
			if jira != (config.Jira{}) {
				if jira.BaseURL == "" || jira.Email == "" || jira.FieldID == "" || jira.APIToken == "" {
					return usageErr("jira is all or none: --jira-base-url, --jira-email, --jira-field-id, and JIRA_API_TOKEN must all be set")
				}
				cfg.Jira = &jira
			}
			cfg.ApplyDefaults()
			if err := cfg.Validate(); err != nil {
				return usageErr("%w", err)
			}
			p, err := home()
			if err != nil {
				return err
			}
			// Resolve the service before any Slack call so an unsupported
			// platform fails with exit 2 and no side effects.
			var svc daemon.Service
			var servicePath string
			if installService {
				if svc, servicePath, err = service(); err != nil {
					return err
				}
			}
			client := newSlack(cfg.Slack)
			auth, err := client.AuthTest(cmd.Context())
			if err != nil {
				return usageErr("bot token rejected by auth.test: %w", err)
			}
			if err := client.ProbeSocketMode(cmd.Context()); err != nil {
				return usageErr("app token cannot open Socket Mode: %w", err)
			}
			if err := config.Save(p.ConfigFile(), cfg); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "authenticated as %s in %s; wrote %s\n", auth.User, auth.Team, p.ConfigFile())
			if !installService {
				return nil
			}
			if err := svc.Install(); err != nil {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "service installed at %s\n", servicePath)
			return nil
		},
	}
	c.Flags().StringVar(&owner, "owner", "", "Slack user ID of the person who owns runs started from this machine")
	c.Flags().BoolVar(&installService, "install-service", false, "install the daemon as a launchd or systemd user service after writing config.yaml")
	c.Flags().StringVar(&jira.BaseURL, "jira-base-url", "", "Jira Cloud site, for example https://acme.atlassian.net (requires the other jira flags and JIRA_API_TOKEN)")
	c.Flags().StringVar(&jira.Email, "jira-email", "", "Atlassian account email the API token belongs to")
	c.Flags().StringVar(&jira.FieldID, "jira-field-id", "", "custom field that receives the thread permalink, customfield_<digits>")
	return c
}
