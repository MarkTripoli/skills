package cli

import (
	"errors"
	"fmt"
	"strings"

	"github.com/spf13/pflag"
)

// Process exit codes. Agents branch on these; they never change meaning.
const (
	ExitOK            = 0
	ExitRefused       = 1
	ExitUsage         = 2
	ExitOwnerInput    = 10
	ExitUnavailable   = 11
	ExitSlackDisabled = 12
)

// ExitCodeError carries the process exit code for err.
type ExitCodeError struct {
	Code int
	Err  error
}

func (e *ExitCodeError) Error() string { return e.Err.Error() }
func (e *ExitCodeError) Unwrap() error { return e.Err }

// usageErr is a usage, config, or repository error: exit 2.
func usageErr(format string, a ...any) error {
	return &ExitCodeError{Code: ExitUsage, Err: fmt.Errorf(format, a...)}
}

// unavailableErr wraps a failure to reach the daemon: exit 11.
func unavailableErr(err error) error {
	return &ExitCodeError{Code: ExitUnavailable, Err: fmt.Errorf("daemon unavailable: %w", err)}
}

// exitCode maps a command error to the process exit code: a coded error keeps
// its code, flag and usage errors are 2, anything else is 1.
func exitCode(err error) int {
	if err == nil {
		return ExitOK
	}
	var coded *ExitCodeError
	if errors.As(err, &coded) && coded.Code > 0 {
		return coded.Code
	}
	var parseErr *pflag.NotExistError
	var valueErr *pflag.ValueRequiredError
	var invalidErr *pflag.InvalidValueError
	var syntaxErr *pflag.InvalidSyntaxError
	if errors.As(err, &parseErr) || errors.As(err, &valueErr) || errors.As(err, &invalidErr) || errors.As(err, &syntaxErr) {
		return ExitUsage
	}
	message := strings.ToLower(err.Error())
	for _, marker := range []string{"usage", "unknown command", "unknown flag", "unknown shorthand", "accepts ", "requires ", "required flag", "invalid argument"} {
		if strings.Contains(message, marker) {
			return ExitUsage
		}
	}
	return ExitRefused
}
