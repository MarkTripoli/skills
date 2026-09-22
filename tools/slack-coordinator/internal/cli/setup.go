package cli

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

func newSetup() *cobra.Command {
	var owner string
	var installService bool
	c := &cobra.Command{
		Use:   "setup --owner <U…>",
		Short: "Validate SLACK_BOT_TOKEN and SLACK_APP_TOKEN and write config.yaml",
		Long: `Reads SLACK_BOT_TOKEN and SLACK_APP_TOKEN from the environment, checks that the bot
token authenticates and the app token can open Socket Mode, then writes
$SLACK_COORDINATOR_HOME/config.yaml (default ~/.slack-coordinator). It never
reads a repository .env file.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if installService {
				return usageErr("--install-service is not available yet; run `slack-coordinator daemon start` instead")
			}
			bot, app := os.Getenv("SLACK_BOT_TOKEN"), os.Getenv("SLACK_APP_TOKEN")
			if bot == "" || app == "" {
				return usageErr("SLACK_BOT_TOKEN and SLACK_APP_TOKEN must both be set in the environment")
			}
			cfg := &config.Config{Slack: config.Slack{BotToken: bot, AppToken: app, OwnerUserID: owner}}
			if err := cfg.Validate(); err != nil {
				return usageErr("%w", err)
			}
			p, err := home()
			if err != nil {
				return err
			}
			client := slackapi.New(cfg.Slack)
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
			return nil
		},
	}
	c.Flags().StringVar(&owner, "owner", "", "Slack user ID of the person who owns runs started from this machine")
	c.Flags().BoolVar(&installService, "install-service", false, "install the daemon as a launchd or systemd user service (not yet available)")
	return c
}
