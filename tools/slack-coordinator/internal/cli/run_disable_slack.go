package cli

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
)

const disableSlackPrompt = "Slack gating stops for this run only. Type yes to continue: "

func newRunDisableSlack() *cobra.Command {
	var params coordinator.CheckParams
	c := &cobra.Command{
		Use:   "disable-slack --run-id <id>",
		Short: "Break glass: stop Slack posts and gating for one run",
		Long: `Break glass: stop Slack posts and gating for one run.

The run's id, channel, and permalink are printed, then a confirmation is read
from stdin. Only the exact answer "yes" disables Slack; anything else exits 1
and changes nothing. Afterwards run check answers {"kind":"slack_disabled"}
with exit 12, run event and run finish keep recording in SQLite without
posting, and every other run is untouched.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			var gate coordinator.WriteGate
			if err := callDaemon(ipc.MethodRunCheck, params, &gate); err != nil {
				return daemonErr(err)
			}
			if gate.Run == nil {
				return fmt.Errorf("daemon returned no run summary for %s", params.RunID)
			}
			out := cmd.OutOrStdout()
			fmt.Fprintf(out, "run_id: %s\nchannel_id: %s\npermalink: %s\n", gate.Run.RunID, gate.Run.ChannelID, gate.Run.Permalink)
			fmt.Fprint(out, disableSlackPrompt)
			answer, err := readAnswer(bufio.NewReader(cmd.InOrStdin()))
			if err != nil {
				if !errors.Is(err, io.EOF) {
					return err
				}
				fmt.Fprintln(out) // stdin closed without a line; end the prompt line
			}
			if answer != "yes" {
				return &ExitCodeError{Code: ExitRefused, Err: errors.New("not confirmed; Slack stays enabled for " + params.RunID)}
			}
			return callRunMethod(ipc.MethodRunDisableSlack, coordinator.DisableSlackParams{RunID: params.RunID})
		},
	}
	c.Flags().StringVar(&params.RunID, "run-id", "", "run identifier printed by run start")
	_ = c.MarkFlagRequired("run-id")
	return c
}

// readAnswer reads one line and trims it. EOF with no text is returned as the
// error so the caller can treat an empty stdin as a refusal.
func readAnswer(r *bufio.Reader) (string, error) {
	line, err := r.ReadString('\n')
	if err != nil && len(line) == 0 {
		return "", err
	}
	return strings.TrimSpace(line), nil
}
