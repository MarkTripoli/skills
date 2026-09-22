package cli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/daemon"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/onboard"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// slackAPIURL points setup's and onboard's Slack calls at a fake server.
// Tests only; empty uses the SDK default.
var slackAPIURL string

// newSlack builds the Slack client for s, redirected to slackAPIURL when set.
func newSlack(s config.Slack) *slackapi.Client {
	if slackAPIURL != "" {
		s.APIURL = slackAPIURL
	}
	return slackapi.New(s)
}

// openBrowser opens url with the platform opener. Tests replace it.
var openBrowser = func(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "linux":
		cmd = exec.Command("xdg-open", url)
	default:
		return fmt.Errorf("no browser opener on %s; visit the URL by hand", runtime.GOOS)
	}
	if out, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("%s: %w: %s", cmd.Path, err, strings.TrimSpace(string(out)))
	}
	return nil
}

func newOnboard() *cobra.Command {
	var flags onboard.Flags
	c := &cobra.Command{
		Use:   "onboard [--no-service] [--existing]",
		Short: "Create the Slack app, collect its tokens, and start the daemon step by step",
		Long: `Walks through first-run setup in the terminal: creates the app from the
embedded manifest with an app configuration token, opens the install page for
the bot token, opens Basic Information for the app-level token, resolves the
owner by email or user id, checks both tokens against Slack, writes
$SLACK_COORDINATOR_HOME/config.yaml (mode 0600, keeping any agent, retention,
and jira settings already there), and installs the launchd or systemd user
service. Progress is checkpointed in $SLACK_COORDINATOR_HOME/onboard.json
(mode 0600) after every step, so an interrupted run resumes where it stopped.
The configuration token is never written to disk.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if flags.Existing {
				return usageErr("not implemented yet")
			}
			p, err := home()
			if err != nil {
				return err
			}
			if err := p.EnsureDirs(); err != nil {
				return err
			}
			cpPath := p.OnboardCheckpoint()
			cp, err := onboard.LoadCheckpoint(cpPath)
			if err != nil {
				return usageErr("%w", err)
			}
			deps := onboardDeps(cmd, p)
			if err := onboard.Run(cmd.Context(), deps, cp, cpPath, flags); err != nil {
				return usageErr("%w", err)
			}
			fmt.Fprintln(cmd.OutOrStdout(), "Setup written; verification arrives in a later change.")
			return nil
		},
	}
	c.Flags().BoolVar(&flags.NoService, "no-service", false, "start the daemon detached until logout instead of installing a launchd or systemd user service")
	c.Flags().BoolVar(&flags.Existing, "existing", false, "update an installed app's manifest instead of creating a new app")
	return c
}

// onboardDeps binds the walkthrough to the command's stdin and stdout, the
// platform browser, Slack clients built from the tokens each call carries,
// config.yaml under p, and the service install and daemon start paths.
func onboardDeps(cmd *cobra.Command, p *paths.Paths) onboard.Deps {
	in := bufio.NewReader(cmd.InOrStdin())
	out := cmd.OutOrStdout()
	prompt := func(label string) (string, error) {
		fmt.Fprintf(out, "%s: ", label)
		line, err := in.ReadString('\n')
		if err != nil && (err != io.EOF || line == "") {
			return "", err
		}
		return strings.TrimSpace(line), nil
	}
	secret := prompt
	if f, ok := cmd.InOrStdin().(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		secret = func(label string) (string, error) {
			fmt.Fprintf(out, "%s: ", label)
			raw, err := term.ReadPassword(int(f.Fd()))
			fmt.Fprintln(out)
			if err != nil {
				return "", err
			}
			return strings.TrimSpace(string(raw)), nil
		}
	}
	return onboard.Deps{
		Prompt:       prompt,
		PromptSecret: secret,
		OpenURL:      openBrowser,
		Slack:        newSlack(config.Slack{}),
		Out:          out,
		LookupUserByEmail: func(ctx context.Context, botToken, email string) (slackapi.User, error) {
			return newSlack(config.Slack{BotToken: botToken}).LookupUserByEmail(ctx, email)
		},
		UserInfo: func(ctx context.Context, botToken, id string) (slackapi.User, error) {
			return newSlack(config.Slack{BotToken: botToken}).UserInfo(ctx, id)
		},
		AuthTest: func(ctx context.Context, botToken string) error {
			_, err := newSlack(config.Slack{BotToken: botToken}).AuthTest(ctx)
			return err
		},
		ProbeSocketMode: func(ctx context.Context, appToken string) error {
			return newSlack(config.Slack{AppToken: appToken}).ProbeSocketMode(ctx)
		},
		LoadConfig: func() (*config.Config, error) { return config.Read(p.ConfigFile()) },
		SaveConfig: func(cfg *config.Config) error {
			if err := config.Save(p.ConfigFile(), cfg); err != nil {
				return err
			}
			fmt.Fprintf(out, "wrote %s\n", p.ConfigFile())
			return nil
		},
		InstallService: func() error {
			s, path, err := service()
			if err != nil {
				return err
			}
			if err := s.Install(); err != nil {
				return err
			}
			fmt.Fprintf(out, "service installed at %s\n", path)
			return nil
		},
		StartDaemon: func() error { return startDetachedDaemon(out, daemon.DefaultStatusInterval) },
	}
}
