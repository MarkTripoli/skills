// Command simview shows and drives Android emulators, iOS simulators and Chromium pages in a browser.
package main

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// exitError carries a process exit code through cobra.
type exitError struct {
	code int
	err  error
}

func (e *exitError) Error() string { return e.err.Error() }
func (e *exitError) Unwrap() error { return e.err }

func main() {
	root := &cobra.Command{
		Use:           "simview",
		Short:         "View and drive emulators and Chromium pages from a browser",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.AddCommand(listCmd(), inputCmd(), snapshotCmd(), webCmd(), urlCmd(), tokenCmd(), noteCmd(), serveCmd())
	if err := root.Execute(); err != nil {
		var ee *exitError
		code := 1
		if errors.As(err, &ee) {
			code = ee.code
		}
		fmt.Fprintln(os.Stderr, "simview:", err)
		os.Exit(code)
	}
}
