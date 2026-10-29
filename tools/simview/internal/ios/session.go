package ios

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"math"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"syscall"
	"time"

	"golang.org/x/image/draw"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	pb "github.com/MarkTripoli/skills/tools/simview/internal/idbpb"
)

// socketWait and firstFrameWait are variables so tests can shorten them.
var (
	socketWait     = 10 * time.Second
	firstFrameWait = 3 * time.Second
)

const (
	maxMsg       = 32 * 1024 * 1024
	streamIdle   = 10 * time.Second
	inputTimeout = 6 * time.Second
	inputQ       = 1024
)

// toolPath is PATH for child processes: Homebrew and cargo are missing from non-interactive
// SSH sessions.
func toolPath() string {
	home := os.Getenv("HOME")
	return "/opt/homebrew/bin:/usr/local/bin:" + home + "/go/bin:" + home + "/.cargo/bin:" + os.Getenv("PATH")
}

// lookTool finds name on toolPath (exec.Command would only search this process's PATH).
func lookTool(name string) (string, error) {
	for _, dir := range filepath.SplitList(toolPath()) {
		p := filepath.Join(dir, name)
		if st, err := os.Stat(p); err == nil && !st.IsDir() && st.Mode()&0o111 != 0 {
			return p, nil
		}
	}
	return "", fmt.Errorf("%s not found: %w", name, exec.ErrNotFound)
}

func env() []string { return append(os.Environ(), "PATH="+toolPath()) }

// Backend lists and connects booted iOS simulators. Off macOS it lists nothing.
type Backend struct{}

var errNotMac = errors.New("iOS simulators need macOS")

// List returns the booted simulators.
func (Backend) List(ctx context.Context) ([]device.Info, error) {
	if runtime.GOOS != "darwin" {
		return nil, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	xcrun, err := lookTool("xcrun")
	if err != nil {
		return nil, nil // no Xcode tools: no simulators, not a failure
	}
	cmd := exec.CommandContext(ctx, xcrun, "simctl", "list", "devices", "booted", "-j")
	cmd.Env = env()
	out, err := cmd.Output()
	if err != nil {
		var ee *exec.ExitError
		switch {
		case errors.Is(err, exec.ErrNotFound):
			return nil, nil // no Xcode tools: no simulators, not a failure
		case errors.As(err, &ee):
			return nil, fmt.Errorf("xcrun simctl failed: %s", bytes.TrimSpace(ee.Stderr))
		case ctx.Err() != nil:
			return nil, errors.New("xcrun simctl timed out")
		}
		return nil, err
	}
	sims, err := ParseBooted(out)
	if err != nil {
		return nil, err
	}
	devices := make([]device.Info, 0, len(sims))
	for _, s := range sims {
		devices = append(devices, device.Info{
			ID: s.UDID, Kind: device.IOS, Name: s.Name, Backend: "idb", Detail: s.Runtime,
		})
	}
	return devices, nil
}

// Connect starts an idb_companion for the simulator and opens a session on it.
func (Backend) Connect(ctx context.Context, id string) (device.Session, error) {
	if runtime.GOOS != "darwin" {
		return nil, errNotMac
	}
	if !IsUDID(id) {
		return nil, fmt.Errorf("%s is not a simulator UDID", id)
	}
	c, err := spawnCompanion(id)
	if err != nil {
		return nil, err
	}
	s, err := newSession(ctx, c.sock, c)
	if err != nil {
		c.stop()
		return nil, err
	}
	return s, nil
}

// companions tracks live companions so a terminating signal can kill them.
var (
	companionMu sync.Mutex
	companions  = map[*companion]struct{}{}
	signalOnce  sync.Once
)

// companion is a running idb_companion owned by one session.
type companion struct {
	cmd    *exec.Cmd
	sock   string
	dir    string        // private 0700 directory holding sock, removed on stop
	exited chan struct{} // closed once the process has been reaped
	once   sync.Once
}

func spawnCompanion(udid string) (*companion, error) {
	signalOnce.Do(installSignalCleanup)
	bin, err := lookTool("idb_companion")
	if err != nil {
		return nil, errors.New("cannot start idb_companion: not installed (brew install facebook/fb/idb-companion)")
	}
	// A private 0700 directory per session, so no other user can reach or pre-create the
	// socket. Under /tmp, not $TMPDIR: unix socket paths are limited to 104 bytes on macOS.
	dir, err := os.MkdirTemp("/tmp", "svi-")
	if err != nil {
		return nil, err
	}
	sock := filepath.Join(dir, "c.sock")
	cmd := exec.Command(bin, "--udid", udid, "--only", "simulator", "--grpc-domain-sock", sock)
	cmd.Env = env()
	// Its own process group, so a terminal Ctrl-C does not hit it before we clean up.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := cmd.Start(); err != nil {
		os.RemoveAll(dir)
		return nil, fmt.Errorf("cannot start idb_companion (brew install facebook/fb/idb-companion): %w", err)
	}
	c := &companion{cmd: cmd, sock: sock, dir: dir, exited: make(chan struct{})}
	go func() { _ = cmd.Wait(); close(c.exited) }()
	companionMu.Lock()
	companions[c] = struct{}{}
	companionMu.Unlock()
	return c, nil
}

// stop kills the process this session started (by pid) and removes its socket.
func (c *companion) stop() {
	c.once.Do(func() {
		_ = c.cmd.Process.Kill()
		select {
		case <-c.exited:
		case <-time.After(3 * time.Second):
		}
		_ = os.RemoveAll(c.dir)
		companionMu.Lock()
		delete(companions, c)
		companionMu.Unlock()
	})
}

// KillAll stops every companion this process started.
func KillAll() {
	companionMu.Lock()
	var all []*companion
	for c := range companions {
		all = append(all, c)
	}
	companionMu.Unlock()
	for _, c := range all {
		c.stop()
	}
}

// installSignalCleanup is only a backstop: the web and serve commands drive their own
// shutdown from a NotifyContext and kill companions through Close. If the process is still
// alive well after SIGTERM/SIGHUP (a short command that does not handle signals), it kills
// the companions and exits.
func installSignalCleanup() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGHUP)
	go func() {
		<-ch
		time.Sleep(signalGrace)
		KillAll()
		os.Exit(0)
	}()
}

var signalGrace = 10 * time.Second

// waitSocket waits up to socketWait for the companion's socket to accept connections.
func waitSocket(ctx context.Context, sock string, exited <-chan struct{}) error {
	deadline := time.Now().Add(socketWait)
	for {
		select {
		case <-exited:
			return errors.New("idb_companion exited early")
		default:
		}
		if _, err := os.Stat(sock); err == nil {
			conn, err := net.DialTimeout("unix", sock, time.Second)
			if err == nil {
				conn.Close()
				return nil
			}
			if time.Now().After(deadline) {
				return err
			}
		} else if time.Now().After(deadline) {
			return fmt.Errorf("idb_companion did not create its socket within %d s", int(socketWait.Seconds()))
		}
		if !sleep(ctx, 100*time.Millisecond) {
			return ctx.Err()
		}
	}
}

func sleep(ctx context.Context, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-t.C:
		return true
	case <-ctx.Done():
		return false
	}
}

type inputMsg struct {
	in  device.Input
	ack chan error
}

// Session streams one simulator and forwards input to it.
type Session struct {
	conn   *grpc.ClientConn
	client pb.CompanionServiceClient
	comp   *companion // nil in tests that bring their own server
	box    *device.FrameBox
	budget *device.Budget
	input  chan inputMsg
	dimW   float64 // screen size in points
	dimH   float64
	cancel context.CancelFunc
	wg     sync.WaitGroup
}

func newSession(ctx context.Context, sock string, c *companion) (*Session, error) {
	var exited <-chan struct{}
	if c != nil {
		exited = c.exited
	}
	if err := waitSocket(ctx, sock, exited); err != nil {
		return nil, err
	}
	conn, err := grpc.NewClient("unix://"+sock,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(maxMsg), grpc.MaxCallSendMsgSize(maxMsg)))
	if err != nil {
		return nil, err
	}
	client := pb.NewCompanionServiceClient(conn)
	dctx, dcancel := context.WithTimeout(ctx, socketWait)
	w, h, err := describe(dctx, client)
	dcancel()
	if err != nil {
		conn.Close()
		return nil, err
	}
	rctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		conn: conn, client: client, comp: c, box: device.NewFrameBox(),
		budget: device.NewBudget(540, 1200), input: make(chan inputMsg, inputQ),
		dimW: w, dimH: h, cancel: cancel,
	}
	s.wg.Add(2)
	go func() { defer s.wg.Done(); s.frameLoop(rctx) }()
	go func() { defer s.wg.Done(); s.inputLoop(rctx) }()
	return s, nil
}

// describe returns the screen size in points, the unit of HID coordinates.
func describe(ctx context.Context, c pb.CompanionServiceClient) (float64, float64, error) {
	var last error
	for {
		resp, err := c.Describe(ctx, &pb.TargetDescriptionRequest{})
		if err == nil {
			d := resp.GetTargetDescription().GetScreenDimensions()
			if d.GetWidthPoints() > 0 && d.GetHeightPoints() > 0 {
				return float64(d.GetWidthPoints()), float64(d.GetHeightPoints()), nil
			}
			return 0, 0, errors.New("idb describe returned no screen size")
		}
		last = err
		if !sleep(ctx, 200*time.Millisecond) {
			return 0, 0, fmt.Errorf("idb describe: %w", last)
		}
	}
}

// Frames is the latest-wins frame source.
func (s *Session) Frames() *device.FrameBox { return s.box }

// SetBudget sets the pixel box frames are scaled into.
func (s *Session) SetBudget(w, h int) { s.budget.Set(w, h) }

// Send queues input for in-order delivery.
func (s *Session) Send(in device.Input) <-chan error {
	m := inputMsg{in: in, ack: make(chan error, 1)}
	select {
	case s.input <- m:
	default:
		m.ack <- errors.New("input queue full")
	}
	return m.ack
}

// Close stops streaming, kills the companion this session started and removes its socket.
func (s *Session) Close() {
	s.cancel()
	s.box.Close()
	s.conn.Close()
	s.wg.Wait()
	if s.comp != nil {
		s.comp.stop()
	}
}

// decode decodes a JPEG and shrinks it into the budget box (never enlarges).
func decode(data []byte, bw, bh int) *device.Frame {
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		return nil
	}
	b := img.Bounds()
	sc := math.Min(float64(bw)/float64(b.Dx()), float64(bh)/float64(b.Dy()))
	if sc < 1 {
		w := max(int(math.Round(float64(b.Dx())*sc)), 1)
		h := max(int(math.Round(float64(b.Dy())*sc)), 1)
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		draw.BiLinear.Scale(dst, dst.Bounds(), img, b, draw.Src, nil)
		img = dst
	}
	return device.FrameFromImage(img)
}

func (s *Session) frameLoop(ctx context.Context) {
	defer s.box.Close()
	for ctx.Err() == nil {
		delivered, err := s.video(ctx)
		if delivered && err == nil {
			// The stream delivered frames and then ended: start it again.
			sleep(ctx, 500*time.Millisecond)
			continue
		}
		if ctx.Err() != nil {
			return
		}
		// It never produced a frame: poll screenshots instead.
		s.screenshotLoop(ctx)
		return
	}
}

// video runs one video_stream call; delivered reports whether it produced a frame.
func (s *Session) video(ctx context.Context) (delivered bool, err error) {
	vctx, cancel := context.WithCancel(ctx)
	defer cancel()
	stream, err := s.client.VideoStream(vctx)
	if err != nil {
		return false, err
	}
	start := &pb.VideoStreamRequest{Control: &pb.VideoStreamRequest_Start_{Start: &pb.VideoStreamRequest_Start{
		Fps: 15, Format: pb.VideoStreamRequest_MJPEG, CompressionQuality: 0.6, ScaleFactor: 0.5,
	}}}
	if err := stream.Send(start); err != nil {
		return false, err
	}
	data := make(chan []byte)
	errc := make(chan error, 1)
	go func() {
		for {
			m, err := stream.Recv()
			if err != nil {
				errc <- err
				return
			}
			if d := m.GetPayload().GetData(); len(d) > 0 {
				select {
				case data <- d:
				case <-vctx.Done():
					return
				}
			}
		}
	}()
	var scan JpegScanner
	started := time.Now()
	for {
		wait := firstFrameWait - time.Since(started)
		if delivered {
			wait = streamIdle
		}
		timer := time.NewTimer(max(wait, 0))
		select {
		case d := <-data:
			timer.Stop()
			if frames := scan.Push(d); len(frames) > 0 {
				bw, bh := s.budget.Get()
				if f := decode(frames[len(frames)-1], bw, bh); f != nil {
					delivered = true
					s.box.Set(f)
				}
			}
		case err := <-errc:
			timer.Stop()
			if errors.Is(err, context.Canceled) {
				err = nil
			}
			return delivered, err
		case <-timer.C:
			return delivered, nil
		case <-ctx.Done():
			timer.Stop()
			return delivered, nil
		}
	}
}

func (s *Session) screenshotLoop(ctx context.Context) {
	for ctx.Err() == nil {
		sctx, cancel := context.WithTimeout(ctx, 5*time.Second)
		r, err := s.client.Screenshot(sctx, &pb.ScreenshotRequest{
			Format: pb.ScreenshotRequest_JPEG, CompressionQuality: 0.6,
			Scale: &pb.ScreenshotRequest_ScaleFactor{ScaleFactor: 0.5},
		})
		cancel()
		if err != nil {
			sleep(ctx, 500*time.Millisecond)
			continue
		}
		bw, bh := s.budget.Get()
		if f := decode(r.GetImageData(), bw, bh); f != nil {
			s.box.Set(f)
		}
		sleep(ctx, 66*time.Millisecond)
	}
}

func (s *Session) inputLoop(ctx context.Context) {
	var g Gesture
	// A fresh companion drops the first HID events until its video stream is attached
	// (seen on a loaded Mac: the first tap of a one-shot `simview input` had no effect),
	// so the first input waits for the first frame.
	waitCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	_, _, _ = s.box.Wait(waitCtx, 0)
	cancel()
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-s.input:
			actions, err := g.OnInput(m.in, time.Now(), s.dimW, s.dimH)
			if err == nil {
				err = s.sendHID(ctx, actions)
			}
			m.ack <- err
		}
	}
}

// hidEvents converts actions to idb events.
func hidEvents(actions []Action) []*pb.HIDEvent {
	pt := func(x, y float64) *pb.Point { return &pb.Point{X: x, Y: y} }
	press := func(a Action, act *pb.HIDEvent_HIDPressAction) *pb.HIDEvent {
		d := pb.HIDEvent_UP
		if a.Down {
			d = pb.HIDEvent_DOWN
		}
		return &pb.HIDEvent{Event: &pb.HIDEvent_Press{Press: &pb.HIDEvent_HIDPress{Action: act, Direction: d}}}
	}
	var out []*pb.HIDEvent
	for _, a := range actions {
		switch a.Kind {
		case ActTouch:
			out = append(out, press(a, &pb.HIDEvent_HIDPressAction{Action: &pb.HIDEvent_HIDPressAction_Touch{
				Touch: &pb.HIDEvent_HIDTouch{Point: pt(a.X, a.Y)}}}))
			if a.Down {
				out = append(out, &pb.HIDEvent{Event: &pb.HIDEvent_Delay{Delay: &pb.HIDEvent_HIDDelay{Duration: 0.05}}})
			}
		case ActSwipe:
			out = append(out, &pb.HIDEvent{Event: &pb.HIDEvent_Swipe{Swipe: &pb.HIDEvent_HIDSwipe{
				Start: pt(a.X, a.Y), End: pt(a.EndX, a.EndY), Delta: 10, Duration: a.Duration}}})
		case ActButton:
			b := pb.HIDEvent_HOME
			if a.Button == ButtonLock {
				b = pb.HIDEvent_LOCK
			}
			out = append(out, press(a, &pb.HIDEvent_HIDPressAction{Action: &pb.HIDEvent_HIDPressAction_Button{
				Button: &pb.HIDEvent_HIDButton{Button: b}}}))
		case ActKey:
			out = append(out, press(a, &pb.HIDEvent_HIDPressAction{Action: &pb.HIDEvent_HIDPressAction_Key{
				Key: &pb.HIDEvent_HIDKey{Keycode: a.Code}}}))
		}
	}
	return out
}

// sendHID makes one hid call per input: the RPC answers only when the request stream closes.
func (s *Session) sendHID(ctx context.Context, actions []Action) error {
	if len(actions) == 0 {
		return nil
	}
	ctx, cancel := context.WithTimeout(ctx, inputTimeout)
	defer cancel()
	stream, err := s.client.Hid(ctx)
	if err != nil {
		return err
	}
	for _, ev := range hidEvents(actions) {
		if err := stream.Send(ev); err != nil {
			return err
		}
	}
	_, err = stream.CloseAndRecv()
	return err
}
