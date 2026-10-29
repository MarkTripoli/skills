package ios

import (
	"bytes"
	"context"
	"image"
	"image/color"
	"image/jpeg"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"google.golang.org/grpc"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	pb "github.com/MarkTripoli/skills/tools/simview/internal/idbpb"
)

// fakeCompanion is an in-process idb_companion on a unix socket.
type fakeCompanion struct {
	pb.UnimplementedCompanionServiceServer
	jpeg []byte
	// noVideo makes video_stream stay silent, forcing the screenshot fallback.
	noVideo bool

	mu     sync.Mutex
	events []*pb.HIDEvent
}

func (f *fakeCompanion) Describe(context.Context, *pb.TargetDescriptionRequest) (*pb.TargetDescriptionResponse, error) {
	return &pb.TargetDescriptionResponse{TargetDescription: &pb.TargetDescription{
		ScreenDimensions: &pb.ScreenDimensions{WidthPoints: 400, HeightPoints: 800},
	}}, nil
}

func (f *fakeCompanion) VideoStream(s grpc.BidiStreamingServer[pb.VideoStreamRequest, pb.VideoStreamResponse]) error {
	if _, err := s.Recv(); err != nil {
		return err
	}
	if f.noVideo {
		<-s.Context().Done()
		return nil
	}
	// One frame split across two messages, as the real stream may do.
	half := len(f.jpeg) / 2
	for _, part := range [][]byte{f.jpeg[:half], f.jpeg[half:]} {
		if err := s.Send(&pb.VideoStreamResponse{Output: &pb.VideoStreamResponse_Payload{Payload: &pb.Payload{Source: &pb.Payload_Data{Data: part}}}}); err != nil {
			return err
		}
	}
	<-s.Context().Done()
	return nil
}

func (f *fakeCompanion) Screenshot(context.Context, *pb.ScreenshotRequest) (*pb.ScreenshotResponse, error) {
	return &pb.ScreenshotResponse{ImageData: f.jpeg}, nil
}

func (f *fakeCompanion) Hid(s grpc.ClientStreamingServer[pb.HIDEvent, pb.HIDResponse]) error {
	for {
		ev, err := s.Recv()
		if err != nil {
			return s.SendAndClose(&pb.HIDResponse{})
		}
		f.mu.Lock()
		f.events = append(f.events, ev)
		f.mu.Unlock()
	}
}

func testJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{200, 30, 30, 255})
		}
	}
	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, img, nil); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

func startFake(t *testing.T, f *fakeCompanion) string {
	t.Helper()
	dir, err := os.MkdirTemp("/tmp", "sv")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	sock := filepath.Join(dir, "c.sock")
	l, err := net.Listen("unix", sock)
	if err != nil {
		t.Fatal(err)
	}
	srv := grpc.NewServer()
	pb.RegisterCompanionServiceServer(srv, f)
	go srv.Serve(l)
	t.Cleanup(srv.Stop)
	return sock
}

func waitFrame(t *testing.T, s *Session) *device.Frame {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	f, _, err := s.Frames().Wait(ctx, 0)
	if err != nil {
		t.Fatalf("no frame: %v", err)
	}
	return f
}

func TestSessionVideoFramesAndTap(t *testing.T) {
	fake := &fakeCompanion{jpeg: testJPEG(t, 100, 200)}
	s, err := newSession(context.Background(), startFake(t, fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if s.dimW != 400 || s.dimH != 800 {
		t.Fatalf("dims %v x %v", s.dimW, s.dimH)
	}
	f := waitFrame(t, s)
	if f.Width != 100 || f.Height != 200 || len(f.RGB) != 100*200*3 || f.RGB[0] < 150 {
		t.Fatalf("frame %dx%d", f.Width, f.Height)
	}
	// (Budget scaling is covered by TestDecodeShrinksIntoBudgetNeverEnlarges.)
	s.SetBudget(50, 50)
	if err := ackWithin(t, s.Send(device.Input{Kind: device.Down, X: 0.5, Y: 0.25})); err != nil {
		t.Fatal(err)
	}
	if err := ackWithin(t, s.Send(device.Input{Kind: device.Up, X: 0.5, Y: 0.25})); err != nil {
		t.Fatal(err)
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	// down+delay+up for the tap, at the point-space position (200, 200).
	if len(fake.events) != 3 {
		t.Fatalf("events %v", fake.events)
	}
	p := fake.events[0].GetPress()
	pt := p.GetAction().GetTouch().GetPoint()
	if p.GetDirection() != pb.HIDEvent_DOWN || pt.GetX() != 200 || pt.GetY() != 200 {
		t.Fatalf("press %v", p)
	}
	if fake.events[1].GetDelay() == nil || fake.events[2].GetPress().GetDirection() != pb.HIDEvent_UP {
		t.Fatalf("events %v", fake.events)
	}
}

func ackWithin(t *testing.T, c <-chan error) error {
	t.Helper()
	select {
	case err := <-c:
		return err
	case <-time.After(8 * time.Second):
		t.Fatal("no ack")
		return nil
	}
}

func TestSessionKeyAndRejectedText(t *testing.T) {
	fake := &fakeCompanion{jpeg: testJPEG(t, 10, 10)}
	s, err := newSession(context.Background(), startFake(t, fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if err := ackWithin(t, s.Send(device.Input{Kind: device.Key, Key: device.KeyEnter})); err != nil {
		t.Fatal(err)
	}
	if err := ackWithin(t, s.Send(device.Input{Kind: device.Text, Text: "é"})); err == nil {
		t.Fatal("non-ASCII text accepted")
	}
	if err := ackWithin(t, s.Send(device.Input{Kind: device.Key, Key: device.KeyAppSwitch})); err == nil {
		t.Fatal("AppSwitch accepted")
	}
	fake.mu.Lock()
	defer fake.mu.Unlock()
	if len(fake.events) != 2 || fake.events[0].GetPress().GetAction().GetKey().GetKeycode() != 0x28 {
		t.Fatalf("events %v", fake.events)
	}
}

func TestSessionScreenshotFallback(t *testing.T) {
	old := firstFrameWait
	firstFrameWait = 200 * time.Millisecond
	defer func() { firstFrameWait = old }()
	fake := &fakeCompanion{jpeg: testJPEG(t, 60, 120), noVideo: true}
	s, err := newSession(context.Background(), startFake(t, fake), nil)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if f := waitFrame(t, s); f.Width != 60 || f.Height != 120 {
		t.Fatalf("frame %dx%d", f.Width, f.Height)
	}
}

func TestWaitSocketTimesOutAndSeesEarlyExit(t *testing.T) {
	old := socketWait
	socketWait = 300 * time.Millisecond
	defer func() { socketWait = old }()
	sock := filepath.Join(t.TempDir(), "none.sock")
	if err := waitSocket(context.Background(), sock, nil); err == nil {
		t.Fatal("expected a timeout")
	}
	exited := make(chan struct{})
	close(exited)
	if err := waitSocket(context.Background(), sock, exited); err == nil {
		t.Fatal("expected an early-exit error")
	}
}

func TestDecodeShrinksIntoBudgetNeverEnlarges(t *testing.T) {
	j := testJPEG(t, 100, 200)
	if f := decode(j, 50, 50); f.Width != 25 || f.Height != 50 {
		t.Fatalf("%dx%d", f.Width, f.Height)
	}
	if f := decode(j, 1000, 1000); f.Width != 100 || f.Height != 200 {
		t.Fatalf("%dx%d", f.Width, f.Height)
	}
	if decode([]byte("junk"), 10, 10) != nil {
		t.Fatal("junk decoded")
	}
}

func TestCompanionStopRemovesPrivateDir(t *testing.T) {
	dir, err := os.MkdirTemp("", "svi-")
	if err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command("sleep", "30")
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	c := &companion{cmd: cmd, sock: filepath.Join(dir, "c.sock"), dir: dir, exited: make(chan struct{})}
	go func() { _ = cmd.Wait(); close(c.exited) }()
	if st, _ := os.Stat(dir); st.Mode().Perm() != 0o700 {
		t.Fatalf("dir mode %v", st.Mode())
	}
	c.stop()
	if _, err := os.Stat(dir); !os.IsNotExist(err) {
		t.Fatalf("dir survives stop: %v", err)
	}
}
