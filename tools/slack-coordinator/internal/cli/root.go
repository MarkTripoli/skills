// Package cli is the slack-coordinator command tree.
package cli

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"
)

var output io.Writer = os.Stdout

// SetOutput redirects command stdout (for testing).
func SetOutput(w io.Writer) {
	if w != nil {
		output = w
	}
}

// Execute runs the CLI with os.Args and returns the process exit code.
func Execute() int {
	err := NewRoot().Execute()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	return exitCode(err)
}

// NewRoot builds the command tree.
func NewRoot() *cobra.Command {
	root := &cobra.Command{
		Use:           "slack-coordinator",
		Short:         "Post agent runs to Slack threads and read the owner's replies",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.SetOut(output)
	root.AddCommand(newSetup(), newDaemon(), newRun())
	return root
}
