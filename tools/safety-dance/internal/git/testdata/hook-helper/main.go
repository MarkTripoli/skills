// Command hook-helper is a test-only adapter for generated Safety Dance hooks.
package main

import (
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
		fmt.Fprintln(os.Stderr, "hook-helper accepts daemon issue-push-token, admit-push or notify-push")
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
	case "issue-push-token":
		issue(c, os.Args[3:])
	case "admit-push":
		admit(c, os.Args[3:])
	case "notify-push":
		notify(c, os.Args[3:])
	default:
		fail(fmt.Errorf("unsupported helper command %q", os.Args[2]))
	}
}

func issue(c *ipc.Client, args []string) {
	fs := flag.NewFlagSet("issue-push-token", flag.ContinueOnError)
	gate, ref, capability := fs.String("gate", "", ""), fs.String("ref", "", ""), fs.String("hook-capability", "", "")
	if err := fs.Parse(args); err != nil {
		fail(err)
	}
	var result ipc.IssuePushTokenResult
	if err := c.CallWithTimeout(ipc.MethodIssuePushToken, ipc.IssuePushTokenParams{Gate: *gate, Ref: *ref, HookCapability: *capability}, &result, 5*time.Second); err != nil {
		fail(err)
	}
	fmt.Fprintln(os.Stdout, result.Token)
}

func endpoint(p *paths.Paths) string {
	if v := os.Getenv("SD_SOCKET"); v != "" {
		return v
	}
	return p.Socket()
}

func admit(c *ipc.Client, args []string) {
	fs := flag.NewFlagSet("admit-push", flag.ContinueOnError)
	gate, ref, old, newRev, token, capability := fs.String("gate", "", ""), fs.String("ref", "", ""), fs.String("old", "", ""), fs.String("new", "", ""), fs.String("token", "", ""), fs.String("hook-capability", "", "")
	if err := fs.Parse(args); err != nil {
		fail(err)
	}
	if err := c.CallWithTimeout(ipc.MethodAdmitPush, ipc.AdmitPushParams{Gate: *gate, Ref: *ref, Old: *old, New: *newRev, Token: *token, HookCapability: *capability}, &ipc.AdmitPushResult{}, 5*time.Second); err != nil {
		fail(err)
	}
}
func notify(c *ipc.Client, args []string) {
	fs := flag.NewFlagSet("notify-push", flag.ContinueOnError)
	gate, ref, old, newRev, capability := fs.String("gate", "", ""), fs.String("ref", "", ""), fs.String("old", "", ""), fs.String("new", "", ""), fs.String("hook-capability", "", "")
	var options multiFlag
	fs.Var(&options, "push-option", "")
	if err := fs.Parse(args); err != nil {
		fail(err)
	}
	var result map[string]bool
	if err := c.CallWithTimeout(ipc.MethodNotifyPush, ipc.NotifyPushParams{Gate: *gate, Ref: *ref, Old: *old, New: *newRev, HookCapability: *capability, PushOptions: options}, &result, 5*time.Second); err != nil {
		fail(err)
	}
}

type multiFlag []string

func (m *multiFlag) String() string     { return strings.Join(*m, ",") }
func (m *multiFlag) Set(v string) error { *m = append(*m, v); return nil }
func fail(err error)                    { fmt.Fprintln(os.Stderr, err); os.Exit(1) }
