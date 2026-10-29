package remote

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/backends"
	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// fakeSession is a device whose frames and input acks the tests control.
type fakeSession struct {
	box    *device.FrameBox
	mu     sync.Mutex
	inputs []device.Input
	stuck  bool
	closed chan struct{}
	budget [2]int
}

func newFakeSession(stuck bool) *fakeSession {
	fs := &fakeSession{box: device.NewFrameBox(), stuck: stuck, closed: make(chan struct{})}
	fs.box.Set(solid(40, 80, 200))
	return fs
}

func solid(w, h int, g byte) *device.Frame {
	rgb := make([]byte, w*h*3)
	for i := 1; i < len(rgb); i += 3 {
		rgb[i] = g
	}
	return &device.Frame{Width: w, Height: h, RGB: rgb}
}

func (f *fakeSession) Frames() *device.FrameBox { return f.box }
func (f *fakeSession) SetBudget(w, h int) {
	f.mu.Lock()
	f.budget = [2]int{w, h}
	f.mu.Unlock()
}
func (f *fakeSession) Send(in device.Input) <-chan error {
	f.mu.Lock()
	f.inputs = append(f.inputs, in)
	f.mu.Unlock()
	if f.stuck {
		return make(chan error) // never answers
	}
	return device.Ack(nil)
}
func (f *fakeSession) Close() { f.box.Close(); close(f.closed) }

type fakeLocal struct {
	mu       sync.Mutex
	sessions map[string]*fakeSession
}

func (l *fakeLocal) ListParts(context.Context) ([]device.Info, []backends.Failure) {
	return []device.Info{
			{ID: "dev", Kind: device.Android, Name: "Pixel", Backend: "android-grpc", Detail: "grpc:1"},
			{ID: "stuck", Kind: device.IOS, Name: "Stuck", Backend: "idb", Detail: "iOS 26"},
		},
		[]backends.Failure{{Name: "cdp", Reason: "no chrome"}}
}

func (l *fakeLocal) Connect(_ context.Context, id string) (device.Session, error) {
	if id != "dev" && id != "stuck" {
		return nil, errors.New("no such device " + id)
	}
	s := newFakeSession(id == "stuck")
	l.mu.Lock()
	if l.sessions == nil {
		l.sessions = map[string]*fakeSession{}
	}
	l.sessions[id] = s
	l.mu.Unlock()
	return s, nil
}

// TestMain turns the test binary into the fake `simview serve --stdio` child: the tests run
// it through the real client with no ssh involved.
func TestMain(m *testing.M) {
	if mode := os.Getenv("SIMVIEW_FAKE_SERVE"); mode != "" {
		os.Exit(fakeServe(mode))
	}
	os.Exit(m.Run())
}

func fakeServe(mode string) int {
	if p := os.Getenv("SIMVIEW_FAKE_PIDFILE"); p != "" {
		f, err := os.OpenFile(p, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err == nil {
			f.WriteString(strconv.Itoa(os.Getpid()) + "\n")
			f.Close()
		}
	}
	switch mode {
	case "die":
		os.Stderr.WriteString("ssh: connect to host mac port 22: Connection refused\n")
		return 255
	case "hang":
		time.Sleep(time.Minute)
		return 0
	case "blocked-hello":
		m, err := ReadMessage(os.Stdin)
		if err != nil || m.Kind != KindReq || m.Req.Op != OpHello {
			return 3
		}
		if err := os.WriteFile(os.Getenv("SIMVIEW_FAKE_READYFILE"), []byte("hello"), 0o600); err != nil {
			return 4
		}
		time.Sleep(time.Minute)
		return 0
	case "cleanup":
		local := &fakeLocal{}
		defer func() {
			for _, s := range local.sessions {
				select {
				case <-s.closed:
				default:
					return
				}
			}
			os.WriteFile(os.Getenv("SIMVIEW_FAKE_CLEANUPFILE"), []byte("cleaned"), 0o600)
		}()
		if err := Serve(context.Background(), os.Stdin, os.Stdout, local, ServeOptions{}); err != nil {
			return 5
		}
		// EOF on stdout must not make the reader kill us during deferred cleanup.
		os.Stdout.Close()
		time.Sleep(100 * time.Millisecond)
		return 0
	case "inherit-pipes":
		child := exec.Command(os.Args[0], "-test.run=NoSuchTest")
		child.Env = append(os.Environ(), "SIMVIEW_FAKE_SERVE=hang", "SIMVIEW_FAKE_PIDFILE=")
		child.Stdout, child.Stderr = os.Stdout, os.Stderr
		if err := child.Start(); err != nil {
			return 6
		}
		if err := os.WriteFile(os.Getenv("SIMVIEW_FAKE_READYFILE"), []byte(strconv.Itoa(child.Process.Pid)), 0o600); err != nil {
			child.Process.Kill()
			child.Wait()
			return 7
		}
		return 0
	case "ok":
		err := Serve(context.Background(), os.Stdin, os.Stdout, &fakeLocal{}, ServeOptions{})
		if err != nil {
			os.Stderr.WriteString(err.Error() + "\n")
			return 1
		}
		return 0
	}
	return 2
}

func fakeRemote(t *testing.T, mode string) (*Backend, string) {
	t.Helper()
	pidfile := t.TempDir() + "/pids"
	t.Setenv("SIMVIEW_FAKE_SERVE", mode)
	t.Setenv("SIMVIEW_FAKE_PIDFILE", pidfile)
	b := New(config.Remote{Name: "mac", Label: "Mac mini", Command: []string{os.Args[0], "-test.run=NoSuchTest"}})
	b.timeouts = Timeouts{Hello: 3 * time.Second, Request: 3 * time.Second, Input: 600 * time.Millisecond}
	t.Cleanup(b.Close)
	return b, pidfile
}

func pids(t *testing.T, file string) []int {
	t.Helper()
	f, err := os.Open(file)
	if err != nil {
		return nil
	}
	defer f.Close()
	var out []int
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		n, _ := strconv.Atoi(strings.TrimSpace(sc.Text()))
		out = append(out, n)
	}
	return out
}

func gone(pid int) bool {
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if err := syscall.Kill(pid, 0); errors.Is(err, syscall.ESRCH) {
			return true
		}
		time.Sleep(20 * time.Millisecond)
	}
	return false
}

func TestListPrefixesIdsAndStampsHost(t *testing.T) {
	b, _ := fakeRemote(t, "ok")
	devs, err := b.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(devs) != 2 || devs[0].ID != "mac/dev" || devs[0].Host != "Mac mini" ||
		devs[0].Backend != "remote" || devs[0].Detail != "android-grpc grpc:1" || devs[1].ID != "mac/stuck" {
		t.Fatalf("%+v", devs)
	}
	// Without a label the host is the name.
	b2 := New(config.Remote{Name: "m2", Command: []string{"x"}})
	if b2.Host() != "m2" {
		t.Fatal(b2.Host())
	}
}

func TestSessionFramesInputAndOwnChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "ok")
	ctx := context.Background()
	s1, err := b.Connect(ctx, "dev")
	if err != nil {
		t.Fatal(err)
	}
	s2, err := b.Connect(ctx, "dev")
	if err != nil {
		t.Fatal(err)
	}
	if p := pids(t, pidfile); len(p) != 2 || p[0] == p[1] {
		t.Fatalf("each session needs its own child: %v", p)
	}
	fctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	f, _, err := s1.Frames().Wait(fctx, 0)
	if err != nil || f.Width != 40 || f.Height != 80 || f.RGB[1] < 150 {
		t.Fatalf("frame: %v %v", f, err)
	}
	select {
	case err := <-s1.Send(device.Input{Kind: device.Down, X: 0.5, Y: 0.5}):
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no ack")
	}
	s1.SetBudget(100, 200)
	// Closing a session kills only its child.
	pl := pids(t, pidfile)
	s1.Close()
	if !gone(pl[0]) {
		t.Fatal("session child survived Close")
	}
	if err := syscall.Kill(pl[1], 0); err != nil {
		t.Fatalf("other session's child died: %v", err)
	}
	if _, _, err := s1.Frames().Wait(ctx, 99); !errors.Is(err, device.ErrClosed) {
		t.Fatalf("frames after close: %v", err)
	}
	b.Close()
	if !gone(pl[1]) {
		t.Fatal("Backend.Close left a session child")
	}
	_ = s2
}

func TestInputAckTimesOutWhenDeviceHangs(t *testing.T) {
	b, _ := fakeRemote(t, "ok")
	s, err := b.Connect(context.Background(), "stuck")
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	start := time.Now()
	select {
	case err := <-s.Send(device.Input{Kind: device.Key, Key: device.KeyEnter}):
		if err == nil || !strings.Contains(err.Error(), "no answer within") {
			t.Fatalf("err = %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("never acked")
	}
	if time.Since(start) > 3*time.Second {
		t.Fatal("ack timeout not applied")
	}
}

func TestConnectErrorsAndKillsChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "ok")
	_, err := b.Connect(context.Background(), "nope")
	if err == nil || !strings.Contains(err.Error(), "no such device nope") {
		t.Fatalf("err = %v", err)
	}
	if p := pids(t, pidfile); len(p) != 1 || !gone(p[0]) {
		t.Fatalf("child survived a failed connect: %v", p)
	}
}

func TestHelloTimeoutKillsChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "hang")
	b.timeouts.Hello = 300 * time.Millisecond
	start := time.Now()
	_, err := b.List(context.Background())
	if err == nil || !strings.Contains(err.Error(), "no answer within") {
		t.Fatalf("err = %v", err)
	}
	if time.Since(start) > 3*time.Second {
		t.Fatal("hello timeout too slow")
	}
	if p := pids(t, pidfile); len(p) != 1 || !gone(p[0]) {
		t.Fatalf("hung child survived: %v", p)
	}
}

func TestChildDeathSurfacesStderrAndBacksOff(t *testing.T) {
	b, pidfile := fakeRemote(t, "die")
	_, err := b.List(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Connection refused") {
		t.Fatalf("stderr tail missing: %v", err)
	}
	// Inside the backoff window the same error comes back without a new child.
	_, err2 := b.List(context.Background())
	if err2 == nil || err2.Error() != err.Error() {
		t.Fatalf("second: %v", err2)
	}
	if n := len(pids(t, pidfile)); n != 1 {
		t.Fatalf("%d children started during the backoff", n)
	}
	// After the window a new child is tried.
	b.mu.Lock()
	b.retryAt = time.Now().Add(-time.Second)
	b.mu.Unlock()
	if _, err := b.List(context.Background()); err == nil {
		t.Fatal("expected failure")
	}
	if n := len(pids(t, pidfile)); n != 2 {
		t.Fatalf("%d children after the window", n)
	}
}

func TestSharedListChildIsReusedAndRestartedAfterDeath(t *testing.T) {
	b, pidfile := fakeRemote(t, "ok")
	for i := 0; i < 2; i++ {
		if _, err := b.List(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	p := pids(t, pidfile)
	if len(p) != 1 {
		t.Fatalf("list should share one child: %v", p)
	}
	syscall.Kill(p[0], syscall.SIGKILL)
	if !gone(p[0]) {
		t.Fatal("child not killed")
	}
	// Wait for the client to notice, then let the backoff pass.
	deadline := time.Now().Add(3 * time.Second)
	for {
		b.mu.Lock()
		dead := b.list != nil && !b.list.alive()
		b.mu.Unlock()
		if dead || time.Now().After(deadline) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err := b.List(context.Background()); err == nil {
		t.Fatal("a dead child must report the failure first")
	}
	b.mu.Lock()
	b.retryAt = time.Now().Add(-time.Second)
	b.mu.Unlock()
	if _, err := b.List(context.Background()); err != nil {
		t.Fatalf("restart: %v", err)
	}
	if n := len(pids(t, pidfile)); n != 2 {
		t.Fatalf("children: %d", n)
	}
}

func TestConnectContextCancelKillsChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "hang")
	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(200 * time.Millisecond); cancel() }()
	if _, err := b.Connect(ctx, "dev"); err == nil {
		t.Fatal("expected an error")
	}
	if p := pids(t, pidfile); len(p) != 1 || !gone(p[0]) {
		t.Fatalf("child survived an aborted connect: %v", p)
	}
}

func TestSpawnErrors(t *testing.T) {
	b := New(config.Remote{Name: "x", Command: []string{"/nonexistent/simview-ssh"}})
	if _, err := b.List(context.Background()); err == nil || !strings.Contains(err.Error(), "cannot run") {
		t.Fatalf("err = %v", err)
	}
}

// In-process Serve checks, over a pipe pair.

type rig struct {
	in   *pipeEnd
	out  *pipeEnd
	done chan error
	next uint64
}

func startServe(t *testing.T, local Local, opt ServeOptions) (*rig, func(Request) Response) {
	t.Helper()
	inR, inW := pipe()
	outR, outW := pipe()
	r := &rig{in: inW, out: outR, done: make(chan error, 1)}
	go func() { r.done <- Serve(context.Background(), inR, outW, local, opt); outW.Close() }()
	t.Cleanup(func() { inW.Close() })
	// A single reader forwards responses; frames and logs are collected.
	resps := make(chan Response, 16)
	go func() {
		for {
			m, err := ReadMessage(outR)
			if err != nil {
				close(resps)
				return
			}
			if m.Kind == KindResp {
				resps <- *m.Resp
			}
		}
	}()
	call := func(req Request) Response {
		r.next++
		req.ID = r.next
		b, _ := Encode(Message{Kind: KindReq, Req: &req})
		if _, err := inW.Write(b); err != nil {
			t.Fatal(err)
		}
		select {
		case resp := <-resps:
			if resp.ID != req.ID {
				t.Fatalf("response id %d for %d", resp.ID, req.ID)
			}
			return resp
		case <-time.After(5 * time.Second):
			t.Fatalf("no response to %s", req.Op)
			return Response{}
		}
	}
	return r, call
}

func TestServeHandshakeVersionAndOps(t *testing.T) {
	_, call := startServe(t, &fakeLocal{}, ServeOptions{})
	if r := call(Request{Op: OpHello, Version: Version + 1}); r.OK || !strings.Contains(r.Error, "version mismatch") {
		t.Fatalf("%+v", r)
	}
	if r := call(Request{Op: OpHello, Version: Version}); !r.OK {
		t.Fatalf("%+v", r)
	}
	var v struct{ Version int }
	r := call(Request{Op: OpHello, Version: Version})
	json.Unmarshal(r.Data, &v)
	if v.Version != Version {
		t.Fatalf("%+v", v)
	}
	if r := call(Request{Op: OpInput, Input: &WireInput{Kind: "down"}}); r.OK || r.Error != "no device connected" {
		t.Fatalf("%+v", r)
	}
	if r := call(Request{Op: "frobnicate"}); r.OK {
		t.Fatalf("%+v", r)
	}
	var devs []device.Info
	r = call(Request{Op: OpList})
	if err := json.Unmarshal(r.Data, &devs); err != nil || len(devs) != 2 {
		t.Fatalf("%+v %v", r, err)
	}
}

func TestServeSendTimeoutAndAllow(t *testing.T) {
	local := &fakeLocal{}
	_, call := startServe(t, local, ServeOptions{SendTimeout: 150 * time.Millisecond, Allow: func(id string) bool { return id == "stuck" }})
	if r := call(Request{Op: OpConnect, Device: "dev", W: 100, H: 100}); !r.OK {
		t.Fatalf("%+v", r)
	}
	if r := call(Request{Op: OpInput, Input: &WireInput{Kind: "down"}}); r.OK || !strings.Contains(r.Error, "not allowed by SIMVIEW_INPUT_ALLOW") {
		t.Fatalf("%+v", r)
	}
	if r := call(Request{Op: OpConnect, Device: "stuck", W: 100, H: 100}); !r.OK {
		t.Fatalf("%+v", r)
	}
	// The previous session was closed by the new connect.
	select {
	case <-local.sessions["dev"].closed:
	case <-time.After(2 * time.Second):
		t.Fatal("old session not closed on reconnect")
	}
	start := time.Now()
	r := call(Request{Op: OpInput, Input: &WireInput{Kind: "key", Key: "Enter"}})
	if r.OK || !strings.Contains(r.Error, "did not answer the input within") || time.Since(start) > 2*time.Second {
		t.Fatalf("%+v after %v", r, time.Since(start))
	}
	// The loop is still alive after a hung device.
	if r := call(Request{Op: OpBudget, W: 10, H: 10}); !r.OK {
		t.Fatalf("%+v", r)
	}
	if got := local.sessions["stuck"].budget; got != [2]int{10, 10} {
		t.Fatalf("budget %v", got)
	}
	if r := call(Request{Op: OpDisconnect}); !r.OK {
		t.Fatalf("%+v", r)
	}
	select {
	case <-local.sessions["stuck"].closed:
	case <-time.After(2 * time.Second):
		t.Fatal("disconnect left the session open")
	}
}

func TestServeStopsOnEOFAndClosesSession(t *testing.T) {
	local := &fakeLocal{}
	r, call := startServe(t, local, ServeOptions{})
	if resp := call(Request{Op: OpConnect, Device: "dev", W: 100, H: 100}); !resp.OK {
		t.Fatalf("%+v", resp)
	}
	r.in.Close()
	select {
	case err := <-r.done:
		if err != nil {
			t.Fatalf("Serve: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Serve did not return at EOF")
	}
	select {
	case <-local.sessions["dev"].closed:
	default:
		t.Fatal("session left open at EOF")
	}
}

// blockedWriter never completes a write until released.
type blockedWriter struct{ release chan struct{} }

func (b blockedWriter) Write(p []byte) (int, error) { <-b.release; return len(p), nil }

func TestServeDisconnectAndReconnectWithBlockedWriter(t *testing.T) {
	local := &fakeLocal{}
	reqs := func(rs ...Request) *io.PipeReader {
		pr, pw := io.Pipe()
		go func() {
			defer pw.Close()
			for i, r := range rs {
				r.ID = uint64(i + 1)
				b, _ := Encode(Message{Kind: KindReq, Req: &r})
				if _, err := pw.Write(b); err != nil {
					return
				}
				if r.Op == OpConnect {
					// keep producing frames so the out queue fills behind the stuck writer
					go func(dev string) {
						for i := 0; i < 200; i++ {
							local.mu.Lock()
							s := local.sessions[dev]
							local.mu.Unlock()
							if s != nil {
								s.box.Set(solid(40, 80, byte(i)))
							}
							time.Sleep(5 * time.Millisecond)
						}
					}(r.Device)
					time.Sleep(400 * time.Millisecond)
				}
			}
		}()
		return pr
	}
	bw := blockedWriter{release: make(chan struct{})}
	defer close(bw.release)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() {
		done <- Serve(ctx, reqs(
			Request{Op: OpConnect, Device: "dev", W: 100, H: 100},
			Request{Op: OpConnect, Device: "stuck", W: 100, H: 100},
			Request{Op: OpDisconnect},
		), bw, local, ServeOptions{})
	}()
	waitClosed := func(id string) {
		t.Helper()
		deadline := time.After(3 * time.Second)
		for {
			local.mu.Lock()
			s := local.sessions[id]
			local.mu.Unlock()
			if s != nil {
				select {
				case <-s.closed:
					return
				default:
				}
			}
			select {
			case <-deadline:
				t.Fatalf("session %s not closed: reconnect/disconnect hangs behind a blocked writer", id)
			case <-time.After(10 * time.Millisecond):
			}
		}
	}
	waitClosed("dev")   // closed by the reconnect
	waitClosed("stuck") // closed by the disconnect
	cancel()
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Serve waited for the blocked writer after disconnect")
	}
}

type slowLocal struct{ fakeLocal }

func (l *slowLocal) Connect(ctx context.Context, id string) (device.Session, error) {
	<-make(chan struct{}) // ignores ctx on purpose
	return nil, nil
}

func TestServeConnectTimesOut(t *testing.T) {
	_, call := startServe(t, &slowLocal{}, ServeOptions{ConnectTimeout: 100 * time.Millisecond})
	start := time.Now()
	r := call(Request{Op: OpConnect, Device: "dev", W: 1, H: 1})
	if r.OK || !strings.Contains(r.Error, "took longer than") || time.Since(start) > 2*time.Second {
		t.Fatalf("%+v after %v", r, time.Since(start))
	}
	if r := call(Request{Op: OpHello, Version: Version}); !r.OK {
		t.Fatalf("loop not alive: %+v", r)
	}
}

func TestListCancelledContextKeepsSharedChild(t *testing.T) {
	b, pidfile := fakeRemote(t, "ok")
	if _, err := b.List(context.Background()); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := b.List(ctx); err == nil {
		t.Fatal("cancelled list succeeded")
	}
	if _, err := b.List(context.Background()); err != nil {
		t.Fatalf("remote penalised by a caller cancellation: %v", err)
	}
	if n := len(pids(t, pidfile)); n != 1 {
		t.Fatalf("child restarted: %d", n)
	}
}

func TestConnectRacingCloseLeavesNoChild(t *testing.T) {
	for i := 0; i < 5; i++ {
		b, pidfile := fakeRemote(t, "ok")
		done := make(chan struct{})
		go func() { b.Connect(context.Background(), "dev"); close(done) }()
		b.Close()
		<-done
		b.mu.Lock()
		n := len(b.sessions)
		b.mu.Unlock()
		if n != 0 {
			t.Fatalf("session registered after Close: %d", n)
		}
		deadline := time.Now().Add(3 * time.Second)
		for _, p := range pidsMaybe(pidfile) {
			for !gone(p) && time.Now().Before(deadline) {
				time.Sleep(20 * time.Millisecond)
			}
			if !gone(p) {
				t.Fatalf("child %d orphaned", p)
			}
		}
	}
}

func pidsMaybe(file string) []int {
	b, err := os.ReadFile(file)
	if err != nil {
		return nil
	}
	var out []int
	for _, f := range strings.Fields(string(b)) {
		if n, err := strconv.Atoi(f); err == nil {
			out = append(out, n)
		}
	}
	return out
}
