package remote

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"reflect"
	"testing"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

func roundTrip(t *testing.T, m Message) Message {
	t.Helper()
	b, err := Encode(m)
	if err != nil {
		t.Fatal(err)
	}
	got, err := Decode(b)
	if err != nil {
		t.Fatal(err)
	}
	return got
}

func TestEncodeDecodeEveryKind(t *testing.T) {
	w := WireInput{Kind: "tap", X: 0.5}
	req := Message{Kind: KindReq, Req: &Request{ID: 7, Op: OpConnect, Device: "x", W: 540, H: 1200, Input: &w}}
	if got := roundTrip(t, req); !reflect.DeepEqual(got, req) {
		t.Fatalf("req: %+v", got)
	}
	resp := Message{Kind: KindResp, Resp: &Response{ID: 7, Error: "nope"}}
	if got := roundTrip(t, resp); !reflect.DeepEqual(got, resp) {
		t.Fatalf("resp: %+v", got)
	}
	log := Message{Kind: KindLog, Log: "mac: xcrun failed"}
	if got := roundTrip(t, log); got != log {
		t.Fatalf("log: %+v", got)
	}
	frame := Message{Kind: KindFrame, Frame: &FrameMsg{Width: 2, Height: 1, Seq: 9, Format: FormatRGB, Data: []byte{1, 2, 3, 4, 5, 6}}}
	if got := roundTrip(t, frame); !reflect.DeepEqual(got, frame) {
		t.Fatalf("frame: %+v", got)
	}
}

func TestFrameLayout(t *testing.T) {
	b, _ := Encode(Message{Kind: KindFrame, Frame: &FrameMsg{Width: 3, Height: 4, Seq: 5, Format: FormatJPEG, Data: []byte{0xAA}}})
	if binary.BigEndian.Uint32(b) != 1+16+1 || b[4] != KindFrame ||
		binary.BigEndian.Uint32(b[5:]) != 3 || binary.BigEndian.Uint32(b[17:]) != 1 || b[21] != 0xAA {
		t.Fatalf("layout %x", b)
	}
}

func TestDecodeRejectsBadInput(t *testing.T) {
	good, _ := Encode(Message{Kind: KindLog, Log: "hi"})
	for name, b := range map[string][]byte{
		"short":     good[:3],
		"truncated": good[:len(good)-1],
		"trailing":  append(append([]byte{}, good...), 0),
		"kind":      {0, 0, 0, 1, 99},
		"format":    append([]byte{0, 0, 0, 17, KindFrame}, make([]byte, 12+4)[:12]...),
	} {
		if _, err := Decode(b); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	badFmt := make([]byte, 0, 21)
	badFmt = append(badFmt, 0, 0, 0, 17, KindFrame)
	badFmt = append(badFmt, make([]byte, 12)...)
	badFmt = append(badFmt, 0, 0, 0, 9)
	if _, err := Decode(badFmt); err == nil {
		t.Error("unknown pixel format accepted")
	}
	if _, err := Encode(Message{Kind: KindFrame, Frame: &FrameMsg{Data: make([]byte, MaxMessage)}}); err == nil {
		t.Error("oversized message encoded")
	}
}

func TestReadMessageStreamAndEOF(t *testing.T) {
	a, _ := Encode(Message{Kind: KindLog, Log: "a"})
	b, _ := Encode(Message{Kind: KindLog, Log: "b"})
	r := bytes.NewReader(append(append([]byte{}, a...), b...))
	for _, want := range []string{"a", "b"} {
		m, err := ReadMessage(r)
		if err != nil || m.Log != want {
			t.Fatalf("%v %v", m, err)
		}
	}
	if _, err := ReadMessage(r); !errors.Is(err, io.EOF) {
		t.Fatalf("clean EOF: %v", err)
	}
	if _, err := ReadMessage(bytes.NewReader(a[:2])); err == nil || errors.Is(err, io.EOF) {
		t.Fatalf("truncated header: %v", err)
	}
	if _, err := ReadMessage(bytes.NewReader(a[:len(a)-1])); err == nil || errors.Is(err, io.EOF) {
		t.Fatalf("truncated body: %v", err)
	}
	if _, err := ReadMessage(bytes.NewReader([]byte{0xFF, 0xFF, 0xFF, 0xFF})); err == nil {
		t.Fatal("huge length accepted")
	}
	if _, err := ReadMessage(bytes.NewReader([]byte{0, 0, 0, 0})); err == nil {
		t.Fatal("zero length accepted")
	}
}

func TestWireInputRoundTrip(t *testing.T) {
	for _, in := range []device.Input{
		{Kind: device.Down, X: 0.25, Y: 0.75}, {Kind: device.Move, X: 1, Y: 0}, {Kind: device.Up, X: 0.5, Y: 0.5},
		{Kind: device.Wheel, X: 0.5, Y: 0.5, DY: -3}, {Kind: device.Text, Text: "héllo"},
		{Kind: device.Key, Key: device.KeyGoBack}, {Kind: device.Key, Key: device.KeyUp},
	} {
		w, err := ToWire(in)
		if err != nil {
			t.Fatal(err)
		}
		if got, err := FromWire(w); err != nil || got != in {
			t.Errorf("%+v -> %+v (%v)", in, got, err)
		}
	}
	if _, err := FromWire(WireInput{Kind: "dance"}); err == nil {
		t.Error("unknown kind accepted")
	}
	if _, err := FromWire(WireInput{Kind: "key", Key: "Nope"}); err == nil {
		t.Error("unknown key accepted")
	}
}

func TestFrameConversions(t *testing.T) {
	f := &device.Frame{Width: 4, Height: 2, RGB: bytes.Repeat([]byte{10, 200, 30}, 8)}
	m, err := EncodeFrame(f, 3)
	if err != nil || m.Format != FormatJPEG || m.Seq != 3 || m.Width != 4 {
		t.Fatalf("%+v %v", m, err)
	}
	got, err := ToFrame(m)
	if err != nil || got.Width != 4 || got.Height != 2 || got.RGB[1] < 150 {
		t.Fatalf("%+v %v", got, err)
	}
	raw, err := ToFrame(&FrameMsg{Width: 4, Height: 2, Format: FormatRGB, Data: f.RGB})
	if err != nil || !bytes.Equal(raw.RGB, f.RGB) {
		t.Fatalf("raw: %v", err)
	}
	if _, err := ToFrame(&FrameMsg{Width: 4, Height: 2, Format: FormatRGB, Data: f.RGB[:5]}); err == nil {
		t.Error("short raw frame accepted")
	}
}

func TestBackoff(t *testing.T) {
	for n, want := range map[int]int{0: 1, 1: 1, 2: 2, 3: 5, 9: 5} {
		if got := int(Backoff(n).Seconds()); got != want {
			t.Errorf("Backoff(%d) = %ds, want %ds", n, got, want)
		}
	}
}
