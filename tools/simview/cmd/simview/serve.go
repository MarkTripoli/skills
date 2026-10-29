package main

import (
	"context"
	"errors"
	"io"
	"os"
	"os/signal"
	"syscall"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/simview/internal/backends"
	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/ios"
	"github.com/MarkTripoli/skills/tools/simview/internal/remote"
	"github.com/MarkTripoli/skills/tools/simview/internal/safety"
)

func serveCmd() *cobra.Command {
	var stdio bool
	cmd := &cobra.Command{
		Use:   "serve --stdio",
		Short: "Expose this host's devices over stdin/stdout (the remote end of a [[remotes]] entry)",
		Long: `Speak the simview remote protocol on stdin/stdout: a hello handshake, then list,
connect, input, budget and disconnect requests, answered with responses and JPEG frames.
It is meant to be started by another simview over SSH, see [[remotes]] in the README.
This host's SIMVIEW_INPUT_ALLOW applies to the input it receives.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !stdio {
				return errors.New("only --stdio is supported")
			}
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			ctx, stop := signal.NotifyContext(cmd.Context(), syscall.SIGINT, syscall.SIGTERM)
			defer stop()
			defer ios.KillAll()
			backend := backends.New(cfg)
			defer backend.Close()
			err = remote.Serve(ctx, os.Stdin, os.Stdout, backend, remote.ServeOptions{Allow: safety.InputAllowed})
			if errors.Is(err, io.EOF) || errors.Is(err, context.Canceled) {
				return nil
			}
			return err
		},
	}
	cmd.Flags().BoolVar(&stdio, "stdio", false, "serve on stdin/stdout")
	return cmd
}
