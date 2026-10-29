package ios

import (
	"reflect"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

func jpegN(n byte) []byte { return []byte{0xFF, 0xD8, 0xFF, 0xE0, n, n, 0xFF, 0xD9} }

func TestScannerOneFramePerMessage(t *testing.T) {
	var s JpegScanner
	if got := s.Push(jpegN(1)); !reflect.DeepEqual(got, [][]byte{jpegN(1)}) {
		t.Fatalf("got %v", got)
	}
	if got := s.Push(jpegN(2)); !reflect.DeepEqual(got, [][]byte{jpegN(2)}) {
		t.Fatalf("got %v", got)
	}
}

func TestScannerTwoFramesInOneMessage(t *testing.T) {
	var s JpegScanner
	both := append(jpegN(1), jpegN(2)...)
	if got := s.Push(both); !reflect.DeepEqual(got, [][]byte{jpegN(1), jpegN(2)}) {
		t.Fatalf("got %v", got)
	}
}

func TestScannerSplitMarkersAndGarbage(t *testing.T) {
	var s JpegScanner
	f := jpegN(7)
	if len(s.Push(f[:1])) != 0 || len(s.Push(f[1:7])) != 0 {
		t.Fatal("frame reported early")
	}
	if got := s.Push(f[7:]); !reflect.DeepEqual(got, [][]byte{f}) {
		t.Fatalf("got %v", got)
	}
	m := append([]byte{1, 2, 3}, jpegN(9)...)
	m = append(m, jpegN(4)[:3]...)
	if got := s.Push(m); !reflect.DeepEqual(got, [][]byte{jpegN(9)}) {
		t.Fatalf("got %v", got)
	}
	if got := s.Push(jpegN(4)[3:]); !reflect.DeepEqual(got, [][]byte{jpegN(4)}) {
		t.Fatalf("got %v", got)
	}
}

func TestHIDForChar(t *testing.T) {
	cases := []struct {
		c     rune
		code  uint64
		shift bool
		ok    bool
	}{
		{'a', 0x04, false, true}, {'A', 0x04, true, true}, {'z', 0x1D, false, true},
		{'!', 0x1E, true, true}, {'1', 0x1E, false, true}, {'0', 0x27, false, true},
		{' ', 0x2C, false, true}, {'\n', 0x28, false, true}, {'é', 0, false, false},
	}
	for _, c := range cases {
		code, shift, ok := HIDForChar(c.c)
		if code != c.code || shift != c.shift || ok != c.ok {
			t.Errorf("%q: got %#x %v %v", c.c, code, shift, ok)
		}
	}
}

func TestTextUsesShiftAroundUppercase(t *testing.T) {
	a, err := TextActions("A!")
	if err != nil || len(a) != 8 {
		t.Fatalf("%v %v", a, err)
	}
	if a[0] != (Action{Kind: ActKey, Code: HIDLeftShift, Down: true}) ||
		a[1] != (Action{Kind: ActKey, Code: 4, Down: true}) ||
		a[3] != (Action{Kind: ActKey, Code: HIDLeftShift}) {
		t.Fatalf("%v", a)
	}
	if _, err := TextActions("é"); err == nil {
		t.Fatal("non-ASCII accepted")
	}
}

func TestToPointsUsesPortraitNativeDims(t *testing.T) {
	if x, y := ToPoints(0.5, 0.5, 402, 874); x != 201 || y != 437 {
		t.Fatalf("%v %v", x, y)
	}
	if x, y := ToPoints(1.5, -1, 402, 874); x != 402 || y != 0 {
		t.Fatalf("clamp: %v %v", x, y)
	}
}

func TestDragBecomesOneSwipeAndClickATap(t *testing.T) {
	t0 := time.Unix(100, 0)
	var g Gesture
	for _, in := range []device.Input{{Kind: device.Down, X: 0.5, Y: 0.75}, {Kind: device.Move, X: 0.5, Y: 0.5}} {
		if a, err := g.OnInput(in, t0, 400, 800); err != nil || len(a) != 0 {
			t.Fatalf("%v %v", a, err)
		}
	}
	up, _ := g.OnInput(device.Input{Kind: device.Up, X: 0.5, Y: 0.25}, t0.Add(400*time.Millisecond), 400, 800)
	want := []Action{{Kind: ActSwipe, X: 200, Y: 600, EndX: 200, EndY: 200, Duration: 0.4}}
	if len(up) != 1 || up[0].Kind != ActSwipe || up[0].X != 200 || up[0].Y != 600 || up[0].EndY != 200 ||
		up[0].Duration < 0.39 || up[0].Duration > 0.41 {
		t.Fatalf("got %v want %v", up, want)
	}
	g.OnInput(device.Input{Kind: device.Down, X: 0.5, Y: 0.5}, t0, 400, 800)
	tapA, _ := g.OnInput(device.Input{Kind: device.Up, X: 0.5078125, Y: 0.5}, t0, 400, 800)
	if !reflect.DeepEqual(tapA, tap(200, 400)) {
		t.Fatalf("got %v", tapA)
	}
	// An Up without a Down is a tap at the release point.
	lone, _ := g.OnInput(device.Input{Kind: device.Up, X: 0.25, Y: 0.5}, t0, 400, 800)
	if !reflect.DeepEqual(lone, tap(100, 400)) {
		t.Fatalf("got %v", lone)
	}
}

func TestWheelIsAShortSwipe(t *testing.T) {
	var g Gesture
	a, err := g.OnInput(device.Input{Kind: device.Wheel, X: 0.5, Y: 0.5, DY: 1}, time.Now(), 400, 800)
	if err != nil || len(a) != 1 {
		t.Fatalf("%v %v", a, err)
	}
	if a[0].X != 200 || a[0].Y != 400 || a[0].Duration != 0.15 || a[0].EndX != 200 || a[0].EndY < 319.9 || a[0].EndY > 320.1 {
		t.Fatalf("%+v", a[0])
	}
}

func TestKeysMap(t *testing.T) {
	a, err := KeyActions(device.KeyEnter)
	if err != nil || a[0] != (Action{Kind: ActKey, Code: 0x28, Down: true}) || a[1].Down {
		t.Fatalf("%v %v", a, err)
	}
	h, _ := KeyActions(device.KeyHome)
	if h[0] != (Action{Kind: ActButton, Button: ButtonHome, Down: true}) {
		t.Fatalf("%v", h)
	}
	if g, _ := KeyActions(device.KeyGoHome); !reflect.DeepEqual(g, h) {
		t.Fatal("GoHome differs from Home")
	}
	if p, _ := KeyActions(device.KeyPower); p[0].Button != ButtonLock {
		t.Fatalf("%v", p)
	}
	for k, code := range map[device.KeyName]uint64{device.KeyGoBack: 0x29, device.KeyBackspace: 0x2A, device.KeyUp: 0x52, device.KeyDown: 0x51, device.KeyLeft: 0x50, device.KeyRight: 0x4F} {
		if a, err := KeyActions(k); err != nil || a[0].Code != code {
			t.Errorf("key %d: %v %v", k, a, err)
		}
	}
	if _, err := KeyActions(device.KeyAppSwitch); err == nil {
		t.Fatal("AppSwitch accepted")
	}
}

func TestParseBooted(t *testing.T) {
	js := `{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-26-5":[
	 {"udid":"11111111-1111-4111-8111-111111111111","name":"Sample simulator","state":"Booted"},
	 {"udid":"22222222-2222-4222-8222-222222222222","name":"Off","state":"Shutdown"}],
	 "com.apple.CoreSimulator.SimRuntime.tvOS-26-0":[]}}`
	sims, err := ParseBooted([]byte(js))
	if err != nil || len(sims) != 1 || sims[0].Runtime != "iOS 26.5" || !IsUDID(sims[0].UDID) {
		t.Fatalf("%v %v", sims, err)
	}
	if IsUDID("emulator-5554") || IsUDID("remote/11111111-1111-4111-8111-111111111111") {
		t.Fatal("non-UDID accepted")
	}
	if _, err := ParseBooted([]byte(`{}`)); err == nil {
		t.Fatal("missing devices accepted")
	}
}
