package android

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sync"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	pb "github.com/MarkTripoli/skills/tools/simview/internal/emulatorpb"
)

const (
	maxMsg    = 16 * 1024 * 1024
	keepalive = time.Second
	inputQ    = 1024
)

// Backend lists and connects local Android emulators.
type Backend struct{}

// List returns the running emulators.
func (Backend) List(context.Context) ([]device.Info, error) {
	var out []device.Info
	for _, e := range RunningEmulators() {
		out = append(out, device.Info{
			ID: e.ID(), Kind: device.Android, Name: e.AVDName,
			Backend: "android-grpc", Detail: fmt.Sprintf("grpc:%d", e.GRPCPort),
		})
	}
	return out, nil
}

// Connect opens a session on a running emulator.
func (Backend) Connect(_ context.Context, id string) (device.Session, error) {
	for _, e := range RunningEmulators() {
		if e.ID() == id {
			return Start(e.GRPCPort, e.GRPCToken)
		}
	}
	return nil, fmt.Errorf("no running emulator %s", id)
}

type tokenCreds string

func (t tokenCreds) GetRequestMetadata(context.Context, ...string) (map[string]string, error) {
	return map[string]string{"authorization": "Bearer " + string(t)}, nil
}
func (tokenCreds) RequireTransportSecurity() bool { return false }

type inputMsg struct {
	in  device.Input
	ack chan error
}

// Session streams one emulator and forwards input to it.
type Session struct {
	conn   *grpc.ClientConn
	client pb.EmulatorControllerClient
	box    *device.FrameBox
	budget *device.Budget
	input  chan inputMsg
	cancel context.CancelFunc
	wg     sync.WaitGroup

	mu     sync.Mutex
	native [2]int // zero until known
}

// Start dials the emulator's gRPC port (lazily) and begins streaming.
func Start(grpcPort int, token string) (*Session, error) {
	opts := []grpc.DialOption{
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(maxMsg)),
	}
	if token != "" {
		opts = append(opts, grpc.WithPerRPCCredentials(tokenCreds(token)))
	}
	conn, err := grpc.NewClient(fmt.Sprintf("127.0.0.1:%d", grpcPort), opts...)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		conn: conn, client: pb.NewEmulatorControllerClient(conn),
		box: device.NewFrameBox(), budget: device.NewBudget(540, 1200),
		input: make(chan inputMsg, inputQ), cancel: cancel,
	}
	s.wg.Add(2)
	go func() { defer s.wg.Done(); s.run(ctx) }()
	go func() { defer s.wg.Done(); s.inputLoop(ctx) }()
	return s, nil
}

// Frames is the latest-wins frame source.
func (s *Session) Frames() *device.FrameBox { return s.box }

// SetBudget sets the pixel box frames are scaled into.
func (s *Session) SetBudget(w, h int) { s.budget.Set(w, h) }

// Close stops streaming and input delivery.
func (s *Session) Close() {
	s.cancel()
	s.box.Close()
	s.wg.Wait()
	s.conn.Close()
}

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

func formatReq(w, h int) *pb.ImageFormat {
	return &pb.ImageFormat{Format: pb.ImageFormat_RGB888, Width: uint32(w), Height: uint32(h)}
}

func toFrame(img *pb.Image) *device.Frame {
	f := img.GetFormat()
	if f == nil || f.Width == 0 || f.Height == 0 {
		return nil
	}
	w, h := int(f.Width), int(f.Height)
	if len(img.Image) != w*h*3 {
		return nil
	}
	return &device.Frame{Width: w, Height: h, RGB: img.Image}
}

// TargetSize is the aspect-preserving size that fits native into the budget, never upscaling.
func TargetSize(native, budget [2]int) (int, int) {
	s := math.Min(math.Min(float64(budget[0])/float64(native[0]), float64(budget[1])/float64(native[1])), 1)
	r := func(v int) int { return max(int(math.Round(float64(v)*s)), 1) }
	return r(native[0]), r(native[1])
}

func (s *Session) shot(ctx context.Context, w, h int) *device.Frame {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	img, err := s.client.GetScreenshot(ctx, formatReq(w, h))
	if err != nil {
		return nil
	}
	return toFrame(img)
}

func (s *Session) run(ctx context.Context) {
	defer s.box.Close()
	var native [2]int
	for {
		if ctx.Err() != nil {
			return
		}
		if f := s.shot(ctx, 0, 0); f != nil {
			native = [2]int{f.Width, f.Height}
			s.mu.Lock()
			s.native = native
			s.mu.Unlock()
			s.box.Set(f)
			break
		}
		if !sleep(ctx, 500*time.Millisecond) {
			return
		}
	}
	for ctx.Err() == nil {
		bw, bh := s.budget.Get()
		w, h := TargetSize(native, [2]int{bw, bh})
		sctx, scancel := context.WithCancel(ctx)
		stream, err := s.client.StreamScreenshot(sctx, formatReq(w, h))
		if err != nil {
			scancel()
			if !sleep(ctx, 500*time.Millisecond) {
				return
			}
			continue
		}
		done := make(chan struct{})
		go func() {
			defer close(done)
			for {
				img, err := stream.Recv()
				if err != nil {
					return
				}
				if f := toFrame(img); f != nil {
					s.box.Set(f)
				}
			}
		}()
		tick := time.NewTicker(keepalive)
	loop:
		for {
			select {
			case <-done:
				sleep(ctx, 500*time.Millisecond)
				break loop
			case <-tick.C:
				if f := s.shot(sctx, w, h); f != nil {
					s.box.Set(f)
				}
			case <-s.budget.Changed():
				break loop
			case <-ctx.Done():
				break loop
			}
		}
		tick.Stop()
		scancel()
		<-done
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

// WheelPath is the touch path of a wheel notch. The emulator's injectWheel is ignored by the
// guest (checked on API 34), so a notch is a short touch swipe: wheel down drags the content
// up. The first point is Down, the last is Up, in normalized coordinates.
func WheelPath(x, y float32, clicks int) [][2]float32 {
	end := min(max(y-float32(clicks)*0.12, 0.02), 0.98)
	const steps = 6
	out := make([][2]float32, 0, steps+1)
	for i := 0; i <= steps; i++ {
		out = append(out, [2]float32{x, y + (end-y)*float32(i)/steps})
	}
	return out
}

// TouchEvent builds a single-touch event in device pixels from normalized coordinates.
func TouchEvent(x, y float32, native [2]int, pressed bool) *pb.TouchEvent {
	px := func(v float32, n int) int32 {
		v = min(max(v, 0), 1)
		return int32(math.Round(float64(v) * float64(max(n-1, 0))))
	}
	var pressure int32
	if pressed {
		pressure = 1
	}
	return &pb.TouchEvent{Touches: []*pb.Touch{{X: px(x, native[0]), Y: px(y, native[1]), Pressure: pressure}}}
}

func (s *Session) nativeSize(ctx context.Context) ([2]int, error) {
	s.mu.Lock()
	n := s.native
	s.mu.Unlock()
	if n[0] > 0 {
		return n, nil
	}
	f := s.shot(ctx, 0, 0)
	if f == nil {
		return n, errors.New("no device size")
	}
	n = [2]int{f.Width, f.Height}
	s.mu.Lock()
	s.native = n
	s.mu.Unlock()
	return n, nil
}

func (s *Session) inputLoop(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case m := <-s.input:
			m.ack <- s.deliver(ctx, m.in)
		}
	}
}

func (s *Session) touch(ctx context.Context, ev *pb.TouchEvent) error {
	ctx, cancel := context.WithTimeout(ctx, 6*time.Second)
	defer cancel()
	_, err := s.client.SendTouch(ctx, ev)
	return err
}

func (s *Session) deliver(ctx context.Context, in device.Input) error {
	switch in.Kind {
	case device.Down, device.Move, device.Up:
		size, err := s.nativeSize(ctx)
		if err != nil {
			return err
		}
		return s.touch(ctx, TouchEvent(in.X, in.Y, size, in.Kind != device.Up))
	case device.Wheel:
		size, err := s.nativeSize(ctx)
		if err != nil {
			return err
		}
		path := WheelPath(in.X, in.Y, in.DY)
		for i, p := range path {
			if err := s.touch(ctx, TouchEvent(p[0], p[1], size, i != len(path)-1)); err != nil {
				return err
			}
			if !sleep(ctx, 16*time.Millisecond) {
				return ctx.Err()
			}
		}
		return nil
	case device.Text:
		kctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		defer cancel()
		_, err := s.client.SendKey(kctx, &pb.KeyboardEvent{Text: in.Text})
		return err
	case device.Key:
		kctx, cancel := context.WithTimeout(ctx, 6*time.Second)
		defer cancel()
		_, err := s.client.SendKey(kctx, &pb.KeyboardEvent{EventType: pb.KeyboardEvent_keypress, Key: in.Key.WebKey()})
		return err
	}
	return fmt.Errorf("unknown input kind %d", in.Kind)
}
