package cli

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/daemon"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/ipc"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

// A daemon stops answering IPC before it releases the ownership lock. `daemon
// stop`, and so `daemon restart`, must not return in between, or the
// replacement fails with "daemon already owns runtime home".
func TestDaemonStopWaitsForTheOwnershipLock(t *testing.T) {
	root, err := os.MkdirTemp("/tmp", "sd-stop-") // short, so the socket path fits
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(root) })
	t.Setenv("SD_HOME", root)
	t.Setenv("HOME", root) // keep installed-service lookups away from the real user
	t.Setenv("XDG_CONFIG_HOME", root)
	p := paths.WithRoot(root)

	own, err := daemon.AcquireOwnership(p)
	if err != nil {
		t.Fatal(err)
	}
	releaseOwnership := sync.OnceFunc(func() { own.Close() })
	t.Cleanup(releaseOwnership)
	if err := os.WriteFile(p.PIDFile(), []byte("1"), 0o600); err != nil {
		t.Fatal(err)
	}

	shutdown := make(chan struct{}, 1)
	releasing := make(chan struct{})
	server := ipc.NewServer()
	server.Handle(ipc.MethodHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return ipc.HealthResult{Status: "ok"}, nil
	})
	server.Handle(ipc.MethodShutdown, func(context.Context, json.RawMessage) (interface{}, error) {
		shutdown <- struct{}{}
		return ipc.ShutdownResult{}, nil
	})
	if err := server.Listen(p.Socket()); err != nil {
		t.Fatal(err)
	}
	go server.ServeReady()
	t.Cleanup(server.Close)
	go func() {
		<-shutdown
		server.Drain(context.Background()) // the socket stops answering here
		time.Sleep(300 * time.Millisecond) // the old daemon is still unwinding
		close(releasing)                   // before Close, so it cannot lag the unlock
		releaseOwnership()
	}()

	var out bytes.Buffer
	root2 := NewRoot()
	root2.SetOut(&out)
	root2.SetErr(&out)
	root2.SetArgs([]string{"daemon", "stop"})
	if err := root2.Execute(); err != nil {
		t.Fatalf("daemon stop: %v\n%s", err, out.String())
	}
	select {
	case <-releasing:
	default:
		t.Fatal("daemon stop returned while the old daemon still held the ownership lock")
	}
	next, err := daemon.AcquireOwnership(p)
	if err != nil {
		t.Fatalf("replacement could not take ownership after stop: %v", err)
	}
	next.Close()
}
