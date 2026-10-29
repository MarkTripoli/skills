package remote

import (
	"context"
	"errors"
	"io"
	"os"
	"strconv"
	"sync"
	"syscall"
	"testing"
	"time"
)

func waitFile(t *testing.T, path string) []byte {
	t.Helper()
	deadline := time.NewTimer(3 * time.Second)
	defer deadline.Stop()
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for {
		if data, err := os.ReadFile(path); err == nil && len(data) != 0 {
			return data
		}
		select {
		case <-deadline.C:
			t.Fatalf("child did not write %s", path)
		case <-tick.C:
		}
	}
}

func TestBackendCloseDuringBlockedHello(t *testing.T) {
	for _, operation := range []string{"connect", "list"} {
		t.Run(operation, func(t *testing.T) {
			b, pidfile := fakeRemote(t, "blocked-hello")
			ready := t.TempDir() + "/ready"
			t.Setenv("SIMVIEW_FAKE_READYFILE", ready)
			b.timeouts.Hello = time.Minute
			opened := make(chan error, 1)
			go func() {
				if operation == "connect" {
					s, err := b.Connect(context.Background(), "dev")
					if s != nil {
						s.Close()
					}
					opened <- err
				} else {
					_, err := b.List(context.Background())
					opened <- err
				}
			}()
			waitFile(t, ready) // The child consumed hello but will never answer it.
			children := pids(t, pidfile)
			if len(children) != 1 {
				t.Fatalf("children before Close: %v", children)
			}
			closed := make(chan struct{})
			go func() { b.Close(); close(closed) }()
			select {
			case <-closed:
			case <-time.After(3 * time.Second):
				t.Fatal("Close waited for the blocked hello deadline")
			}
			// No polling after Close: its return must mean the child was reaped.
			if err := syscall.Kill(children[0], 0); !errors.Is(err, syscall.ESRCH) {
				t.Fatalf("Close returned with child %d still present: %v", children[0], err)
			}
			select {
			case err := <-opened:
				if err == nil {
					t.Fatal("pending open succeeded after Close")
				}
			case <-time.After(time.Second):
				t.Fatal("pending open did not finish after Close")
			}
		})
	}
}

func TestConnCloseRunsChildDeferredCleanup(t *testing.T) {
	b, pidfile := fakeRemote(t, "cleanup")
	cleanup := t.TempDir() + "/cleanup"
	t.Setenv("SIMVIEW_FAKE_CLEANUPFILE", cleanup)
	s, err := b.Connect(context.Background(), "dev")
	if err != nil {
		t.Fatal(err)
	}
	s.Close()
	data, err := os.ReadFile(cleanup)
	if err != nil || string(data) != "cleaned" {
		t.Fatalf("child deferred cleanup or owned-session closure did not finish: %q, %v", data, err)
	}
	children := pids(t, pidfile)
	if len(children) != 1 {
		t.Fatalf("children: %v", children)
	}
	if err := syscall.Kill(children[0], 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("Close returned before reaping child: %v", err)
	}
}

func TestConnCloseKillsUnresponsiveChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "hang")
	c, err := spawn(b.cfg.Command)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.close)
	waitFile(t, pidfile)
	closed := make(chan struct{}, 2)
	for range 2 {
		go func() { c.close(); closed <- struct{}{} }()
	}
	deadline := time.After(3 * time.Second)
	for range 2 {
		select {
		case <-closed:
		case <-deadline:
			t.Fatal("concurrent Close did not force-kill and reap an unresponsive child")
		}
	}
	if err := syscall.Kill(c.cmd.Process.Pid, 0); !errors.Is(err, syscall.ESRCH) {
		t.Fatalf("hung child survived Close: %v", err)
	}
}

func TestConnReapsWithInheritedOutputPipes(t *testing.T) {
	b, _ := fakeRemote(t, "inherit-pipes")
	ready := t.TempDir() + "/descendant"
	t.Setenv("SIMVIEW_FAKE_READYFILE", ready)
	c, err := spawn(b.cfg.Command)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(c.close)
	pid, err := strconv.Atoi(string(waitFile(t, ready)))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { syscall.Kill(pid, syscall.SIGKILL) })
	select {
	case <-c.reaped:
	case <-time.After(2 * time.Second):
		t.Fatal("reaper waited for a descendant holding stdout/stderr open")
	}
	if c.alive() {
		t.Fatal("connection still alive after child exit")
	}
	if err := syscall.Kill(pid, 0); err != nil {
		t.Fatalf("descendant must still hold the output pipes during reaping: %v", err)
	}
}

// Unlike a pipe, this writer cannot be interrupted by Close. The test releases
// it only after Serve returns, so a shutdown wait on Write is observable.
type lifecycleWriter struct {
	entered chan struct{}
	release chan struct{}
	done    chan struct{}
	once    sync.Once
}

func (w *lifecycleWriter) Write([]byte) (int, error) {
	w.once.Do(func() { close(w.entered) })
	<-w.release
	close(w.done)
	return 0, io.ErrClosedPipe
}

func TestServeStopsWithUnclosableBlockedWriter(t *testing.T) {
	for _, ending := range []string{"eof", "cancel"} {
		t.Run(ending, func(t *testing.T) {
			local := &fakeLocal{}
			r, input := io.Pipe()
			defer r.Close()
			defer input.Close()
			writer := &lifecycleWriter{
				entered: make(chan struct{}), release: make(chan struct{}), done: make(chan struct{}),
			}
			defer close(writer.release)
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() { done <- Serve(ctx, r, writer, local, ServeOptions{}) }()
			request, err := Encode(Message{Kind: KindReq, Req: &Request{ID: 1, Op: OpConnect, Device: "dev", W: 100, H: 100}})
			if err != nil {
				t.Fatal(err)
			}
			if _, err := input.Write(request); err != nil {
				t.Fatal(err)
			}
			select {
			case <-writer.entered:
			case <-time.After(3 * time.Second):
				t.Fatal("Serve did not enter the blocked writer")
			}
			if ending == "eof" {
				input.Close()
			} else {
				cancel()
			}
			select {
			case err := <-done:
				if ending == "eof" && err != nil {
					t.Fatalf("EOF: %v", err)
				}
				if ending == "cancel" && !errors.Is(err, context.Canceled) {
					t.Fatalf("cancel: %v", err)
				}
			case <-time.After(2 * time.Second):
				t.Fatal("Serve waited for the blocked writer")
			}
			local.mu.Lock()
			s := local.sessions["dev"]
			local.mu.Unlock()
			if s == nil {
				t.Fatal("no owned session")
			}
			select {
			case <-s.closed:
			default:
				t.Fatal("Serve returned before closing its owned session")
			}
			select {
			case <-writer.done:
				t.Fatal("test writer was released before Serve returned")
			default:
			}
		})
	}
}

// Closing a transport should also unblock its writer goroutine, not just bound
// the wait for writers that cannot be closed.
type closableLifecycleWriter struct {
	lifecycleWriter
	closeOnce sync.Once
	closed    chan struct{}
}

func (w *closableLifecycleWriter) Close() error {
	w.closeOnce.Do(func() { close(w.closed); close(w.release) })
	return nil
}

func TestServeClosesBlockedWriterOnCancellation(t *testing.T) {
	r, input := io.Pipe()
	defer r.Close()
	defer input.Close()
	writer := &closableLifecycleWriter{
		lifecycleWriter: lifecycleWriter{entered: make(chan struct{}), release: make(chan struct{}), done: make(chan struct{})},
		closed:          make(chan struct{}),
	}
	defer writer.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- Serve(ctx, r, writer, &fakeLocal{}, ServeOptions{}) }()
	request, err := Encode(Message{Kind: KindReq, Req: &Request{ID: 1, Op: OpHello, Version: Version}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := input.Write(request); err != nil {
		t.Fatal(err)
	}
	select {
	case <-writer.entered:
	case <-time.After(3 * time.Second):
		t.Fatal("writer did not block")
	}
	cancel()
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Serve: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve did not close its blocked transport")
	}
	select {
	case <-writer.closed:
	default:
		t.Fatal("transport was not closed")
	}
	select {
	case <-writer.done:
	default:
		t.Fatal("transport writer did not stop")
	}
}
