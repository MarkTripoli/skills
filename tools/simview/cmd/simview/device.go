package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/simview/internal/backends"
	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/remote"
	"github.com/MarkTripoli/skills/tools/simview/internal/safety"
	"github.com/MarkTripoli/skills/tools/simview/internal/web"
)

func newBackend() (*backends.Combined, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}
	return backends.New(cfg, remotes(cfg)...), nil
}

// remotes builds one backend per configured [[remotes]] entry.
func remotes(cfg config.Config) []backends.Named {
	var out []backends.Named
	for _, r := range cfg.Remotes {
		out = append(out, remote.New(r))
	}
	return out
}

func listCmd() *cobra.Command {
	var asJSON bool
	cmd := &cobra.Command{
		Use:   "list",
		Short: "List running devices",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			b, err := newBackend()
			if err != nil {
				return err
			}
			defer b.Close()
			devices, err := b.List(cmd.Context())
			if err != nil {
				return err
			}
			if devices == nil {
				devices = []device.Info{}
			}
			if asJSON {
				return json.NewEncoder(os.Stdout).Encode(devices)
			}
			for _, d := range devices {
				fmt.Printf("%s\t%s\t%s\t%s\n", d.Kind, d.Name, d.ID, d.Backend)
			}
			return nil
		},
	}
	cmd.Flags().BoolVar(&asJSON, "json", false, "print JSON")
	return cmd
}

func coords(args []string) ([]float32, error) {
	out := make([]float32, len(args))
	for i, a := range args {
		v, err := strconv.ParseFloat(a, 32)
		if err != nil {
			return nil, fmt.Errorf("bad coordinate %q", a)
		}
		out[i] = float32(v)
	}
	return out, nil
}

// swipeSteps is the number of Move events and the pause between them for a swipe of ms.
func swipeSteps(ms int) (steps int, pause time.Duration) {
	ms = max(ms, 1)
	steps = max(ms/16, 8)
	return steps, time.Duration(ms/steps) * time.Millisecond
}

func inputCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "input <id> <action>",
		Short: "Send input to a device (normalized 0..1 coordinates)",
		Long: `Send input to a device. Coordinates are normalized: 0,0 is the top left, 1,1 the bottom right.

  simview input <id> tap X Y
  simview input <id> swipe X1 Y1 X2 Y2 [MS]
  simview input <id> wheel CLICKS        (positive = wheel down)
  simview input <id> text STRING
  simview input <id> key NAME            (enter, back, home, esc, tab, up, ...)

SIMVIEW_INPUT_ALLOW (comma list of ids, a trailing * makes a prefix) restricts which
devices accept input; a refused device exits 3 before any connection is made.`,
		Args: cobra.MinimumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			id, action, rest := args[0], args[1], args[2:]
			plan, err := planInput(action, rest)
			if err != nil {
				return err
			}
			b, err := newBackend()
			if err != nil {
				return err
			}
			defer b.Close()
			// The guard runs before any connection is made.
			var allow *string
			if v, ok := os.LookupEnv(safety.Env); ok {
				allow = &v
			}
			sess, err := safety.Guarded(allow, id, func() func() (device.Session, error) {
				return func() (device.Session, error) { return b.Connect(cmd.Context(), id) }
			})
			if err != nil {
				return &exitError{3, err}
			}
			s, err := sess()
			if err != nil {
				return err
			}
			defer s.Close()
			return plan(cmd.Context(), s)
		},
	}
	return cmd
}

type inputPlan func(ctx context.Context, s device.Session) error

func send(ctx context.Context, s device.Session, in device.Input) error {
	select {
	case err := <-s.Send(in):
		return err
	case <-time.After(web.InputTimeout):
		return fmt.Errorf("no answer from the device within %s", web.InputTimeout)
	case <-ctx.Done():
		return ctx.Err()
	}
}

func planInput(action string, rest []string) (inputPlan, error) {
	need := func(n int, usage string) error {
		if len(rest) != n {
			return fmt.Errorf("usage: simview input <id> %s", usage)
		}
		return nil
	}
	switch action {
	case "tap":
		if err := need(2, "tap X Y"); err != nil {
			return nil, err
		}
		c, err := coords(rest)
		if err != nil {
			return nil, err
		}
		return func(ctx context.Context, s device.Session) error {
			if err := send(ctx, s, device.Input{Kind: device.Down, X: c[0], Y: c[1]}); err != nil {
				return err
			}
			time.Sleep(50 * time.Millisecond)
			return send(ctx, s, device.Input{Kind: device.Up, X: c[0], Y: c[1]})
		}, nil
	case "swipe":
		if len(rest) != 4 && len(rest) != 5 {
			return nil, fmt.Errorf("usage: simview input <id> swipe X1 Y1 X2 Y2 [MS]")
		}
		c, err := coords(rest[:4])
		if err != nil {
			return nil, err
		}
		ms := 300
		if len(rest) == 5 {
			if ms, err = strconv.Atoi(rest[4]); err != nil || ms < 0 {
				return nil, fmt.Errorf("bad duration %q", rest[4])
			}
		}
		return func(ctx context.Context, s device.Session) error {
			steps, pause := swipeSteps(ms)
			if err := send(ctx, s, device.Input{Kind: device.Down, X: c[0], Y: c[1]}); err != nil {
				return err
			}
			for i := 1; i <= steps; i++ {
				t := float32(i) / float32(steps)
				time.Sleep(pause)
				in := device.Input{Kind: device.Move, X: c[0] + (c[2]-c[0])*t, Y: c[1] + (c[3]-c[1])*t}
				if err := send(ctx, s, in); err != nil {
					return err
				}
			}
			return send(ctx, s, device.Input{Kind: device.Up, X: c[2], Y: c[3]})
		}, nil
	case "wheel":
		if err := need(1, "wheel CLICKS"); err != nil {
			return nil, err
		}
		n, err := strconv.Atoi(rest[0])
		if err != nil {
			return nil, fmt.Errorf("bad click count %q", rest[0])
		}
		return func(ctx context.Context, s device.Session) error {
			return send(ctx, s, device.Input{Kind: device.Wheel, X: 0.5, Y: 0.5, DY: n})
		}, nil
	case "text":
		if err := need(1, "text STRING"); err != nil {
			return nil, err
		}
		return func(ctx context.Context, s device.Session) error {
			return send(ctx, s, device.Input{Kind: device.Text, Text: rest[0]})
		}, nil
	case "key":
		if err := need(1, "key NAME"); err != nil {
			return nil, err
		}
		k, ok := device.ParseKey(rest[0])
		if !ok {
			return nil, fmt.Errorf("unknown key name %s", rest[0])
		}
		return func(ctx context.Context, s device.Session) error {
			return send(ctx, s, device.Input{Kind: device.Key, Key: k})
		}, nil
	}
	return nil, fmt.Errorf("unknown input action %q (tap, swipe, wheel, text, key)", action)
}

func snapshotCmd() *cobra.Command {
	var out string
	cmd := &cobra.Command{
		Use:   "snapshot <id> -o file.jpg",
		Short: "Save one frame of a device as a JPEG (-o - writes to stdout)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			if out == "" {
				return fmt.Errorf("-o FILE is required (use -o - for stdout)")
			}
			b, err := newBackend()
			if err != nil {
				return err
			}
			defer b.Close()
			s, err := b.Connect(cmd.Context(), args[0])
			if err != nil {
				return err
			}
			defer s.Close()
			s.SetBudget(4096, web.MaxHeight)
			ctx, cancel := context.WithTimeout(cmd.Context(), 10*time.Second)
			defer cancel()
			f, _, err := s.Frames().Wait(ctx, 0)
			if err != nil {
				return fmt.Errorf("no frame from %s within 10 s", args[0])
			}
			jpg, err := web.EncodeJPEG(f)
			if err != nil {
				return err
			}
			if out == "-" {
				_, err = os.Stdout.Write(jpg)
				return err
			}
			return os.WriteFile(out, jpg, 0o644)
		},
	}
	cmd.Flags().StringVarP(&out, "output", "o", "", "output file, or - for stdout")
	return cmd
}
