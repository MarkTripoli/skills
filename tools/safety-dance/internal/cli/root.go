package cli

import (
	"errors"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/buildinfo"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/spf13/cobra"
	"io"
	"os"
	"strings"
)

var output io.Writer = os.Stdout

func SetOutput(w io.Writer) {
	if w != nil {
		output = w
	}
}
func Execute() int {
	if err := NewRoot().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		return 1
	}
	return 0
}
func NewRoot() *cobra.Command {
	root := &cobra.Command{Use: "safety-dance", SilenceUsage: true, SilenceErrors: true, RunE: func(cmd *cobra.Command, args []string) error { return statusCommand(cmd, args) }}
	root.SetOut(output)
	root.Version = buildinfo.CurrentVersion()
	root.AddCommand(newInit(), newRun(), newStatus(), newRespond(), newAbort(), newLogs(), newDaemon())
	return root
}
func home() (*paths.Paths, error) { return paths.New() }
func nestedMutation() error {
	if strings.TrimSpace(os.Getenv("SD_PARENT_RUN_ID")) != "" {
		return errors.New("nested Safety Dance run cannot mutate the parent run")
	}
	return nil
}
