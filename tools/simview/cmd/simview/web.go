package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/MarkTripoli/skills/tools/simview/internal/backends"
	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/ios"
	"github.com/MarkTripoli/skills/tools/simview/internal/notes"
	"github.com/MarkTripoli/skills/tools/simview/internal/state"
	"github.com/MarkTripoli/skills/tools/simview/internal/web"
)

func webCmd() *cobra.Command {
	var dev, bind string
	var newToken bool
	cmd := &cobra.Command{
		Use:   "web",
		Short: "Serve the token-protected browser view, by default on this host's Tailscale address",
		Long: `Serve the token-protected browser view of the devices and print its URL.

Binds only loopback or Tailscale (100.64.0.0/10) addresses, never 0.0.0.0. Default: this
host's 'tailscale ip -4', port 8799 (the port of the last run when free, then the next free
one up to 8808). The token is kept in $XDG_STATE_HOME/simview/web.json so the link survives
restarts; --new-token rotates it
while no server is running (it refuses otherwise; stop the server first). 'simview url' prints the current link.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cfg, err := config.Load()
			if err != nil {
				return err
			}
			store, err := notes.OpenDefault()
			if err != nil {
				return err
			}
			saved, err := state.LoadWeb()
			if err != nil {
				return err
			}
			if err := checkRotate(newToken, saved, serverAlive); err != nil {
				return err
			}
			lease, err := state.BeginWeb(newToken)
			if err != nil {
				return err
			}
			defer lease.Close()
			token := lease.Token
			ctx, stop := signal.NotifyContext(cmd.Context(), os.Interrupt, syscall.SIGTERM)
			defer stop()
			if bind == "" && serverAlive(saved) {
				return fmt.Errorf("simview web is already running: %s (pass --bind to start another)", saved.URL)
			}
			prefer := 0
			if _, p, err := net.SplitHostPort(saved.Addr); err == nil {
				prefer, _ = strconv.Atoi(p)
			}
			l, err := web.Listen(ctx, bind, prefer)
			if err != nil {
				return err
			}
			addr := l.Addr().String()
			if bind == "" {
				// The default-bound server owns the stable link `simview url` prints.
				if err := state.SaveWeb(state.Web{Token: token, URL: web.URL(addr, token, ""), Addr: addr}); err != nil {
					l.Close()
					return err
				}
			}
			fmt.Println(web.URL(addr, token, dev))
			fmt.Fprintf(os.Stderr, "simview web on %s; input to a device needs Control mode in the page\n", addr)
			backend := backends.New(cfg, remotes(cfg)...)
			defer backend.Close()
			defer ios.KillAll()
			srv := web.NewServer(backend, token, cfg.MaxFPS, store)
			srv.Log = log.New(os.Stderr, "", 0)
			return srv.Run(ctx, l)
		},
	}
	cmd.Flags().StringVar(&dev, "device", "", "device preselected in the page")
	cmd.Flags().StringVar(&bind, "bind", "", "ADDR:PORT; loopback or Tailscale (100.64.0.0/10) only (default: Tailscale IPv4, port 8799)")
	cmd.Flags().BoolVar(&newToken, "new-token", false, "rotate the persisted token (invalidates old links); refused while a server is running")
	return cmd
}

// checkRotate also detects servers started before instance locks were introduced.
// The state package atomically guards rotation against every current web instance.
func checkRotate(rotate bool, saved state.Web, alive func(state.Web) bool) error {
	if rotate && alive(saved) {
		return fmt.Errorf("simview web is running at %s; stop it first (Ctrl-C or `systemctl --user stop simview-web.service` on Linux), rotate with `simview token --rotate`, then start it again", saved.Addr)
	}
	return nil
}

// serverAlive reports whether a simview web server answers at the saved address.
func serverAlive(w state.Web) bool {
	if w.Addr == "" {
		return false
	}
	c := http.Client{Timeout: time.Second}
	resp, err := c.Get("http://" + w.Addr + "/favicon.ico")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusNoContent
}

func urlCmd() *cobra.Command {
	var dev string
	cmd := &cobra.Command{
		Use:   "url",
		Short: "Print the current browser link of the running simview web",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			w, err := state.LoadWeb()
			if err != nil {
				return err
			}
			if !serverAlive(w) {
				return fmt.Errorf("no simview web server is running; start one with `simview web` or `systemctl --user start simview-web.service` on Linux")
			}
			fmt.Println(web.URL(w.Addr, w.Token, dev))
			return nil
		},
	}
	cmd.Flags().StringVar(&dev, "device", "", "append a preselected device to the link")
	return cmd
}

func tokenCmd() *cobra.Command {
	var rotate bool
	cmd := &cobra.Command{
		Use:   "token --rotate",
		Short: "Rotate the persisted web token while no server is running",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			if !rotate {
				return fmt.Errorf("pass --rotate")
			}
			saved, err := state.LoadWeb()
			if err != nil {
				return err
			}
			if err := checkRotate(true, saved, serverAlive); err != nil {
				return err
			}
			if _, err := state.EnsureToken(true); err != nil {
				return err
			}
			fmt.Fprintln(os.Stderr, "token rotated; old links are dead. Start the server (`simview web` or `systemctl --user start simview-web.service` on Linux) and read the new link with `simview url`.")
			return nil
		},
	}
	cmd.Flags().BoolVar(&rotate, "rotate", false, "rotate the token in web.json")
	return cmd
}
