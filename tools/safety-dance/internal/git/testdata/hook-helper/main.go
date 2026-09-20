// Command hook-helper is a test-only adapter for generated Safety Dance hooks.
package main

import (
	"bufio"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

func main() {
	if len(os.Args) < 3 || os.Args[1] != "daemon" {
		fmt.Fprintln(os.Stderr, "hook-helper accepts daemon admit-push or daemon notify-push")
		os.Exit(2)
	}
	p, err := paths.New()
	if err != nil {
		fail(err)
	}
	c, err := ipc.Dial(endpoint(p))
	if err != nil {
		fail(err)
	}
	defer c.Close()
	switch os.Args[2] {
	case "admit-push":
		admit(c, os.Args[3:])
	case "notify-push":
		notify(c, os.Args[3:])
	default:
		fail(fmt.Errorf("unsupported helper command %q", os.Args[2]))
	}
}

func endpoint(p *paths.Paths) string {
	if v := os.Getenv("SD_SOCKET"); v != "" {
		return v
	}
	return p.Socket()
}

func admit(c *ipc.Client, args []string) {
	fs := flag.NewFlagSet("admit-push", flag.ContinueOnError)
	gate, ref, token := fs.String("gate", "", ""), fs.String("ref", "", ""), fs.String("token", "", "")
	if err := fs.Parse(args); err != nil {
		fail(err)
	}
	var result ipc.AdmitPushResult
	if err := c.CallWithTimeout(ipc.MethodAdmitPush, ipc.AdmitPushParams{Gate: *gate, Ref: *ref, Token: *token}, &result, 5*time.Second); err != nil {
		fail(err)
	}
	in := bufio.NewScanner(os.Stdin)
	for in.Scan() {
		if strings.TrimSpace(in.Text()) != "" {
			fmt.Fprintln(os.Stdout, in.Text())
		}
	}
}

func notify(c *ipc.Client, args []string) {
	fs := flag.NewFlagSet("notify-push", flag.ContinueOnError)
	gate, ref, old, newRev := fs.String("gate", "", ""), fs.String("ref", "", ""), fs.String("old", "", ""), fs.String("new", "", "")
	var options multiFlag
	fs.Var(&options, "push-option", "")
	if err := fs.Parse(args); err != nil {
		fail(err)
	}
	var result map[string]bool
	if err := c.CallWithTimeout(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: *gate, Ref: *ref, Old: *old, New: *newRev, PushOptions: options}, &result, 5*time.Second); err != nil {
		fail(err)
	}
}

type multiFlag []string

func (m *multiFlag) String() string     { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error { *m = append(*m, v); return nil }
func fail(err error)                    { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
