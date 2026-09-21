package cli

import (
	"errors"
	"fmt"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/buildinfo"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
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

type ExitCodeError struct {
	Code int
	Err  error
}

func (e *ExitCodeError) Error() string { return e.Err.Error() }
func (e *ExitCodeError) Unwrap() error { return e.Err }

func Execute() int {
	if err := NewRoot().Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		var coded *ExitCodeError
		if errors.As(err, &coded) && coded.Code > 0 {
			return coded.Code
		}
		var parseErr *pflag.NotExistError
		var valueErr *pflag.ValueRequiredError
		var invalidErr *pflag.InvalidValueError
		var syntaxErr *pflag.InvalidSyntaxError
		switch {
		case errors.As(err, &parseErr), errors.As(err, &valueErr), errors.As(err, &invalidErr), errors.As(err, &syntaxErr):
			return 2
		}
		message := strings.ToLower(err.Error())
		switch {
		case strings.Contains(message, "usage") || strings.Contains(message, "unknown command") || strings.Contains(message, "accepts ") || strings.Contains(message, "requires ") || strings.Contains(message, "unknown flag") || strings.Contains(message, "invalid argument"):
			return 2
		case strings.Contains(message, "daemon") && strings.Contains(message, "unavailable"):
			return 3
		case strings.Contains(message, "reject") || strings.Contains(message, "unauthor"):
			return 4
		case strings.Contains(message, "blocked"):
			return 6
		default:
			return 5
		}
	}
	return 0
}
func NewRoot() *cobra.Command {
	root := &cobra.Command{Use: "safety-dance", SilenceUsage: true, SilenceErrors: true, RunE: launchDefault}
	root.SetOut(output)
	root.Version = buildinfo.CurrentVersion()
	root.AddCommand(newInit(), newRun(), newStatus(), newRespond(), newAbort(), newLogs(), newDaemon(), newWizard(), newTUI())
	return root

}
func home() (*paths.Paths, error) { return paths.New() }
func nestedMutation() error {
	if strings.TrimSpace(os.Getenv("SD_PARENT_RUN_ID")) != "" {
		return &ExitCodeError{Code: 6, Err: errors.New("nested Safety Dance run cannot mutate the parent run")}
	}
	return nil
}
