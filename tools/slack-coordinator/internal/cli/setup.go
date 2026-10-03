package cli

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
)

func newSetup() *cobra.Command {
	var owner string
	var installService bool
	var botStdin, appStdin bool
	var jira config.Jira
	c := &cobra.Command{
		Use:   "setup --owner <member-id> [--install-service] [--jira-base-url <url> --jira-email <email> --jira-field-id <customfield_N>]",
		Short: "Validate SLACK_BOT_TOKEN and SLACK_APP_TOKEN and write config.yaml",
		Long: `Reads the bot token and the app-level token from the environment, or from
stdin with --bot-token-stdin and --app-token-stdin. Do not put the tokens in
the command line: a shell records that line in its history. Checks that the
bot token authenticates and the app token can open Socket Mode, then writes
$SLACK_COORDINATOR_HOME/config.yaml (default ~/.slack-coordinator). It never
reads a repository .env file. With --install-service it installs the
launchd or systemd user service and waits until the daemon socket answers.

Jira backlinks are optional: give --jira-base-url, --jira-email, and
--jira-field-id together with JIRA_API_TOKEN in the environment, or none of
them.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			bot, app := os.Getenv("SLACK_BOT_TOKEN"), os.Getenv("SLACK_APP_TOKEN")
			stdin := bufio.NewReader(cmd.InOrStdin())
			var err error
			if botStdin {
				if bot, err = readTokenLine(stdin); err != nil {
					return err
				}
			}
			if appStdin {
				if app, err = readTokenLine(stdin); err != nil {
					return err
				}
			}
			if bot == "" || app == "" {
				return usageErr("set SLACK_BOT_TOKEN and SLACK_APP_TOKEN, or pass --bot-token-stdin and --app-token-stdin")
			}
			cfg := &config.Config{Slack: config.Slack{BotToken: bot, AppToken: app, OwnerUserID: owner}}
			jira.APIToken = os.Getenv("JIRA_API_TOKEN")
			if jira != (config.Jira{}) {
				if jira.BaseURL == "" || jira.Email == "" || jira.FieldID == "" || jira.APIToken == "" {
					return usageErr("jira is all or none: --jira-base-url, --jira-email, --jira-field-id, and JIRA_API_TOKEN must all be set")
				}
				cfg.Jira = &jira
			}
			p, err := home()
			if err != nil {
				return err
			}
			existing, err := config.Read(p.ConfigFile())
			if err != nil {
				return err
			}
			keepExistingBlocks(cfg, existing)

			if err := cfg.Validate(); err != nil {
				return usageErr("%w", err)
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
			ownerUser, err := client.UserInfo(cmd.Context(), cfg.Slack.OwnerUserID)
			if err != nil {
				return usageErr("owner %s was not found by users.info; copy your member ID from your Slack profile menu: %w", cfg.Slack.OwnerUserID, err)
			}
			if err := config.Save(p.ConfigFile(), cfg); err != nil {
				return err
			}
			if err := os.Remove(p.OnboardCheckpoint()); err != nil && !os.IsNotExist(err) {
				return err
			}
			fmt.Fprintf(cmd.OutOrStdout(), "authenticated as %s in %s; owner %s (%s); wrote %s\n", auth.User, auth.Team, ownerUser.DisplayName, ownerUser.ID, p.ConfigFile())
			if installService {
				if err := svc.Install(); err != nil {
					return err
				}
				fmt.Fprintf(cmd.OutOrStdout(), "service installed at %s\n", servicePath)
				if err := waitForDaemonReady(); err != nil {
					return fmt.Errorf("service installed but the daemon socket did not answer (see %s): %w", p.DaemonLog(), err)
				}
				fmt.Fprintln(cmd.OutOrStdout(), "daemon is ready")
				return nil
			}
			if health() == nil {
				if err := restartDaemon(cmd.OutOrStdout()); err != nil {
					return err
				}
				fmt.Fprintln(cmd.OutOrStdout(), "restarted the daemon so it loads this config")
				return nil
			}
			fmt.Fprintln(cmd.OutOrStdout(), "daemon is not running; this config takes effect when the daemon next starts")
			return nil
		},
	}
	c.Flags().StringVar(&owner, "owner", "", "your Slack member ID (profile menu, Copy member ID), not the bot")
	c.Flags().BoolVar(&installService, "install-service", false, "install the daemon as a launchd or systemd user service and wait until its socket answers")
	c.Flags().BoolVar(&botStdin, "bot-token-stdin", false, "read the bot token from stdin instead of SLACK_BOT_TOKEN")
	c.Flags().BoolVar(&appStdin, "app-token-stdin", false, "read the app-level token from stdin instead of SLACK_APP_TOKEN; when both stdin flags are set, the bot token is the first line")
	c.Flags().StringVar(&jira.BaseURL, "jira-base-url", "", "Jira Cloud site, for example https://acme.atlassian.net (requires the other jira flags and JIRA_API_TOKEN)")
	c.Flags().StringVar(&jira.Email, "jira-email", "", "Atlassian account email the API token belongs to")
	c.Flags().StringVar(&jira.FieldID, "jira-field-id", "", "custom field that receives the thread permalink, customfield_<digits>")
	return c
}

// keepExistingBlocks preserves optional Jira settings when setup replaces tokens.
func keepExistingBlocks(cfg, existing *config.Config) {
	if existing != nil && cfg.Jira == nil {
		cfg.Jira = existing.Jira
	}
}
func readTokenLine(in *bufio.Reader) (string, error) {
	line, err := in.ReadString('\n')
	if err != nil && !errors.Is(err, io.EOF) {
		return "", err
	}
	return strings.TrimSpace(line), nil
}
