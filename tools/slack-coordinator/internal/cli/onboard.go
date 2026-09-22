package cli

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/onboard"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// onboardAPIURL points the manifest calls at a fake Slack. Tests only; empty
// uses the SDK default.
var onboardAPIURL string

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
		Short: "Create the Slack app and collect its tokens step by step",
		Long: `Walks through first-run setup in the terminal: creates the app from the
embedded manifest with an app configuration token, opens the install page for
the bot token, and opens Basic Information for the app-level token. Progress
is checkpointed in $SLACK_COORDINATOR_HOME/onboard.json (mode 0600) after
every step, so an interrupted run resumes where it stopped. The configuration
token is never written to disk.`,
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
			deps := onboardDeps(cmd)
			if err := onboard.Run(cmd.Context(), deps, cp, cpPath, flags); err != nil {
				return usageErr("%w", err)
			}
			fmt.Fprintln(cmd.OutOrStdout(), "Tokens saved to onboard.json; the remaining steps arrive in a later change.")
			return nil
		},
	}
	c.Flags().BoolVar(&flags.NoService, "no-service", false, "start the daemon in the foreground instead of installing a launchd or systemd user service")
	c.Flags().BoolVar(&flags.Existing, "existing", false, "update an installed app's manifest instead of creating a new app")
	return c
}

// onboardDeps binds the walkthrough to the command's stdin and stdout, the
// platform browser, and a Slack client for the manifest calls.
func onboardDeps(cmd *cobra.Command) onboard.Deps {
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
		Slack:        slackapi.New(config.Slack{APIURL: onboardAPIURL}),
		Out:          out,
	}
}
