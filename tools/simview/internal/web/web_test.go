package web

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/coder/websocket"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/notes"
)

func TestBindAllowsLoopbackAndTailscaleOnly(t *testing.T) {
	for _, ok := range []string{"127.0.0.1:8799", "100.64.0.1:1", "100.127.255.254:8799", "100.100.100.100:8799", "[::1]:8799"} {
		if err := ValidateBind(netip.MustParseAddrPort(ok)); err != nil {
			t.Errorf("%s: %v", ok, err)
		}
	}
	for _, bad := range []string{"0.0.0.0:8799", "192.168.1.5:8799", "10.0.0.1:8799", "100.63.255.255:8799", "100.128.0.1:8799", "8.8.8.8:80", "[::]:8799"} {
		if err := ValidateBind(netip.MustParseAddrPort(bad)); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
}

func TestListenRejectsBadExplicitBind(t *testing.T) {
	for _, bad := range []string{"0.0.0.0:0", "nonsense", "192.168.1.5:80"} {
		if _, err := Listen(context.Background(), bad, 0); err == nil {
			t.Errorf("%s accepted", bad)
		}
	}
}

func TestTokenCheck(t *testing.T) {
	if !TokenOK("abc123", "abc123") {
		t.Fatal("same")
	}
	for _, bad := range []string{"", "abc124", "abc1234"} {
		if TokenOK(bad, "abc123") {
			t.Fatalf("%q", bad)
		}
	}
}

func TestInputJSONMaps(t *testing.T) {
	in, err := ParseInput([]byte(`{"type":"down","x":0.5,"y":2.0}`))
	if err != nil || in != (device.Input{Kind: device.Down, X: 0.5, Y: 1}) {
		t.Fatalf("%v %+v", err, in)
	}
	in, err = ParseInput([]byte(`{"type":"key","name":"esc"}`))
	if err != nil || in.Key != device.KeyGoBack {
		t.Fatalf("%v %+v", err, in)
	}
	in, _ = ParseInput([]byte(`{"type":"wheel","x":0.5,"y":0.5,"dy":99}`))
	if in.DY != 20 {
		t.Fatal(in.DY)
	}
	in, _ = ParseInput([]byte(`{"type":"text","text":"hi"}`))
	if in.Text != "hi" {
		t.Fatal(in)
	}
	for _, bad := range []string{`{"type":"key","name":"nope"}`, `{"type":"zap"}`, `{"type":"down","x":1}`, `{"type":"wheel","x":1,"y":1}`, `nope`} {
		if _, err := ParseInput([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}

func TestFrameHeaderLayout(t *testing.T) {
	m := EncodeFrame("emulator-5790", 0x01020304, []byte{0xff, 0xd8, 9})
	if binary.BigEndian.Uint16(m) != 13 || string(m[2:15]) != "emulator-5790" ||
		binary.BigEndian.Uint32(m[15:]) != 0x01020304 || string(m[19:]) != "\xff\xd8\x09" {
		t.Fatalf("%v", m)
	}
}

func TestClientMessagesParse(t *testing.T) {
	m, err := ParseClient([]byte(`{"op":"sub","id":"a b"}`))
	if err != nil || m.Op != "sub" || m.ID != "a b" {
		t.Fatal(m, err)
	}
	if m, _ := ParseClient([]byte(`{"op":"unsub","id":"x"}`)); m.Op != "unsub" {
		t.Fatal(m)
	}
	m, err = ParseClient([]byte(`{"op":"input","id":"x","seq":7,"ev":{"type":"down","x":0.5,"y":0.5}}`))
	if err != nil || m.Seq != 7 || m.ID != "x" {
		t.Fatal(m, err)
	}
	if _, err := ParseInput(m.Ev); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{`{"op":"nope"}`, `not json`, `{"op":"sub"}`, `{"op":"input","id":"x"}`} {
		if _, err := ParseClient([]byte(bad)); err == nil {
			t.Errorf("accepted %s", bad)
		}
	}
}

func TestAckShapes(t *testing.T) {
	b, _ := json.Marshal(ackMsg(3, nil))
	if string(b) != `{"ok":true,"op":"ack","seq":3}` {
		t.Fatal(string(b))
	}
	if ackMsg(4, errors.New("no"))["ok"] != false {
		t.Fatal("err ack")
	}
	var nilErr *string
	b, _ = json.Marshal(statusMsg("d", "live", nilErr))
	if !strings.Contains(string(b), `"err":null`) {
		t.Fatal(string(b))
	}
}

func TestPoolSharesOneSessionAndClosesAfterIdle(t *testing.T) {
	var closed atomic.Int32
	pool := NewPool(80*time.Millisecond, func(int) { closed.Add(1) })
	var connects atomic.Int32
	mk := func() (int, error) { return int(connects.Add(1)), nil }
	a, _ := pool.Acquire("d", mk)
	b, _ := pool.Acquire("d", mk)
	other, _ := pool.Acquire("e", mk)
	if a.Val != b.Val || connects.Load() != 2 {
		t.Fatal("not shared", connects.Load())
	}
	a.Release()
	time.Sleep(200 * time.Millisecond)
	if pool.Len() != 2 {
		t.Fatal("closed with a viewer left")
	}
	b.Release()
	time.Sleep(30 * time.Millisecond)
	// A new viewer inside the window cancels the pending close.
	c, _ := pool.Acquire("d", mk)
	time.Sleep(100 * time.Millisecond)
	if pool.Len() != 2 || connects.Load() != 2 {
		t.Fatal("pending close was not cancelled")
	}
	c.Release()
	time.Sleep(200 * time.Millisecond)
	if pool.Len() != 1 || closed.Load() != 1 {
		t.Fatalf("d should close, e stay: len=%d closed=%d", pool.Len(), closed.Load())
	}
	other.Release()
	time.Sleep(200 * time.Millisecond)
	if pool.Len() != 0 || closed.Load() != 2 {
		t.Fatalf("len=%d closed=%d", pool.Len(), closed.Load())
	}
}

func TestPoolFailedConnectReleasesAndEvictReconnects(t *testing.T) {
	pool := NewPool(50*time.Millisecond, func(int) {})
	if _, err := pool.Acquire("d", func() (int, error) { return 0, errors.New("no") }); err == nil {
		t.Fatal("expected error")
	}
	if pool.Len() != 0 {
		t.Fatal("failed connect stayed pooled")
	}
	a, _ := pool.Acquire("d", func() (int, error) { return 1, nil })
	a.Evict()
	b, _ := pool.Acquire("d", func() (int, error) { return 2, nil })
	if a.Val != 1 || b.Val != 2 {
		t.Fatal(a.Val, b.Val)
	}
}

// fakeSession serves a solid red frame and records input.
type fakeSession struct {
	box    *device.FrameBox
	inputs chan device.Input
}

func newFake() *fakeSession {
	f := &fakeSession{box: device.NewFrameBox(), inputs: make(chan device.Input, 16)}
	rgb := make([]byte, 16*8*3)
	for i := 0; i < len(rgb); i += 3 {
		rgb[i] = 255
	}
	f.box.Set(&device.Frame{Width: 16, Height: 8, RGB: rgb})
	return f
}
func (f *fakeSession) Frames() *device.FrameBox { return f.box }
func (f *fakeSession) SetBudget(int, int)       {}
func (f *fakeSession) Close()                   { f.box.Close() }
func (f *fakeSession) Send(in device.Input) <-chan error {
	f.inputs <- in
	return device.Ack(nil)
}

type fakeBackend struct{ s *fakeSession }

func (b fakeBackend) List(context.Context) ([]device.Info, error) {
	return []device.Info{{ID: "fake-1", Kind: device.Android, Name: "fake"}}, nil
}
func (b fakeBackend) Connect(_ context.Context, id string) (device.Session, error) {
	if id != "fake-1" {
		return nil, errors.New("no such device")
	}
	return b.s, nil
}

func testServer(t *testing.T) (*httptest.Server, *fakeSession) {
	t.Helper()
	fake := newFake()
	store := &notes.Store{Dir: t.TempDir()}
	n := "<b>hi</b>"
	if _, err := store.Update("mac/U1", notes.Update{Text: &n}); err != nil {
		t.Fatal(err)
	}
	srv := NewServer(fakeBackend{fake}, "tok", 30, store)
	ts := httptest.NewServer(srv)
	t.Cleanup(ts.Close)
	return ts, fake
}

func get(t *testing.T, url string) (int, string) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return resp.StatusCode, string(b)
}

func TestEndpointsRequireToken(t *testing.T) {
	ts, _ := testServer(t)
	for _, p := range []string{"/", "/api/notes", "/api/devices", "/ws", "/ws?t=bad", "/nope", "/api/notes?t=bad"} {
		if code, _ := get(t, ts.URL+p); code != 403 {
			t.Errorf("%s -> %d", p, code)
		}
	}
	if code, _ := get(t, ts.URL+"/favicon.ico"); code != 204 {
		t.Errorf("favicon -> %d", code)
	}
	code, body := get(t, ts.URL+"/api/notes?t=tok")
	if code != 200 || !strings.Contains(body, `"mac/U1"`) || !strings.Contains(body, "<b>hi</b>") {
		t.Fatalf("%d %s", code, body)
	}
	code, body = get(t, ts.URL+"/api/devices?t=tok")
	if code != 200 || !strings.Contains(body, `"fake-1"`) || !strings.Contains(body, `"host":""`) {
		t.Fatalf("%d %s", code, body)
	}
	code, body = get(t, ts.URL+"/?t=tok")
	if code != 200 || !strings.Contains(body, "<title>") {
		t.Fatalf("page %d", code)
	}
	if code, _ := get(t, ts.URL+"/nope?t=tok"); code != 404 {
		t.Fatalf("404 -> %d", code)
	}
}

func TestPostInputMapsStatuses(t *testing.T) {
	ts, fake := testServer(t)
	post := func(q, body string) int {
		resp, err := http.Post(ts.URL+"/api/input?t=tok&id="+q, "application/json", strings.NewReader(body))
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		return resp.StatusCode
	}
	if c := post("fake-1", `{"type":"down","x":0.1,"y":0.2}`); c != 204 {
		t.Fatalf("ok -> %d", c)
	}
	if in := <-fake.inputs; in.Kind != device.Down || in.X != 0.1 {
		t.Fatalf("%+v", in)
	}
	if c := post("fake-1", `{"type":"zap"}`); c != 400 {
		t.Fatalf("bad body -> %d", c)
	}
	if c := post("other", `{"type":"down","x":0,"y":0}`); c != 502 {
		t.Fatalf("no device -> %d", c)
	}
	t.Setenv("SIMVIEW_INPUT_ALLOW", "emulator-5790")
	if c := post("fake-1", `{"type":"down","x":0,"y":0}`); c != 403 {
		t.Fatalf("guard -> %d", c)
	}
}

func TestWebSocketStreamsFramesAndAcksInput(t *testing.T) {
	ts, fake := testServer(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	url := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws?t=tok"
	if _, _, err := websocket.Dial(ctx, url+"x", nil); err == nil {
		t.Fatal("bad token upgraded")
	}
	c, _, err := websocket.Dial(ctx, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer c.CloseNow()
	send := func(s string) {
		if err := c.Write(ctx, websocket.MessageText, []byte(s)); err != nil {
			t.Fatal(err)
		}
	}
	send(`{"op":"sub","id":"fake-1"}`)
	send(`{"op":"input","id":"fake-1","seq":9,"ev":{"type":"up","x":0.5,"y":0.5}}`)
	var sawFrame, sawLive, sawAck, sawNotes bool
	for !(sawFrame && sawLive && sawAck && sawNotes) {
		typ, data, err := c.Read(ctx)
		if err != nil {
			t.Fatalf("read: %v (frame=%v live=%v ack=%v notes=%v)", err, sawFrame, sawLive, sawAck, sawNotes)
		}
		if typ == websocket.MessageBinary {
			n := int(binary.BigEndian.Uint16(data))
			if string(data[2:2+n]) != "fake-1" || data[2+n+4] != 0xff || data[2+n+5] != 0xd8 {
				t.Fatalf("bad frame % x", data[:16])
			}
			sawFrame = true
			continue
		}
		var m map[string]any
		_ = json.Unmarshal(data, &m)
		switch m["op"] {
		case "status":
			sawLive = sawLive || m["state"] == "live"
		case "ack":
			if m["seq"] != 9.0 || m["ok"] != true {
				t.Fatalf("%v", m)
			}
			sawAck = true
		case "notes":
			sawNotes = true
		}
	}
	if in := <-fake.inputs; in.Kind != device.Up {
		t.Fatalf("%+v", in)
	}
	send(`{"op":"bogus"}`)
	for {
		_, data, err := c.Read(ctx)
		if err != nil {
			t.Fatal(err)
		}
		if strings.Contains(string(data), `"op":"error"`) {
			break
		}
	}
}

func TestEncodeJPEGCapsHeight(t *testing.T) {
	f := &device.Frame{Width: 100, Height: 2000, RGB: make([]byte, 100*2000*3)}
	b, err := EncodeJPEG(f)
	if err != nil || len(b) < 4 || b[0] != 0xff || b[1] != 0xd8 {
		t.Fatalf("%v", err)
	}
	if _, err := EncodeJPEG(&device.Frame{Width: 2, Height: 2, RGB: []byte{1}}); err == nil {
		t.Fatal("bad frame accepted")
	}
}

func TestURLEncodesDevice(t *testing.T) {
	if u := URL("1.2.3.4:5", "tok", "cdp:9333:A/b"); u != "http://1.2.3.4:5/?t=tok&d=cdp%3A9333%3AA%2Fb" {
		t.Fatal(u)
	}
	if u := URL("1.2.3.4:5", "tok", ""); u != "http://1.2.3.4:5/?t=tok" {
		t.Fatal(u)
	}
}

type hangBackend struct{ release chan struct{} }

func (b hangBackend) List(context.Context) ([]device.Info, error) { return nil, nil }
func (b hangBackend) Connect(context.Context, string) (device.Session, error) {
	<-b.release
	return newFake(), nil
}

func TestDeliverTimeoutIncludesConnect(t *testing.T) {
	old := InputTimeout
	InputTimeout = 200 * time.Millisecond
	defer func() { InputTimeout = old }()
	hb := hangBackend{release: make(chan struct{})}
	srv := NewServer(hb, "tok", 30, &notes.Store{Dir: t.TempDir()})
	start := time.Now()
	err := srv.deliver("x", device.Input{Kind: device.Down})
	if !isTimeout(err) || time.Since(start) > 2*time.Second {
		t.Fatalf("%v after %v", err, time.Since(start))
	}
	close(hb.release) // the late connect completes and releases its lease without panicking
	srv.Pool.CloseAll()
}

func TestPageCarriesCSPWithScriptHash(t *testing.T) {
	ts, _ := testServer(t)
	resp, err := http.Get(ts.URL + "/?t=tok")
	if err != nil {
		t.Fatal(err)
	}
	resp.Body.Close()
	csp := resp.Header.Get("Content-Security-Policy")
	host := strings.TrimPrefix(ts.URL, "http://")
	for _, want := range []string{"default-src 'none'", scriptHash, "connect-src 'self' ws://" + host, "img-src 'self' blob: data:", "frame-ancestors 'none'"} {
		if !strings.Contains(csp, want) {
			t.Errorf("csp %q lacks %q", csp, want)
		}
	}
	if !strings.HasPrefix(scriptHash, "'sha256-") || strings.Count(string(page), "<script") != 1 {
		t.Fatalf("hash %q; page must keep exactly one inline script", scriptHash)
	}
}

func TestPageCSPDropsUnsafeHost(t *testing.T) {
	ok := pageCSP("100.64.1.2:8799")
	if !strings.Contains(ok, "connect-src 'self' ws://100.64.1.2:8799 wss://100.64.1.2:8799;") {
		t.Fatalf("plain host not allowed: %s", ok)
	}
	bad := pageCSP("x; script-src *")
	if !strings.Contains(bad, "connect-src 'self';") || strings.Contains(bad, "script-src *") {
		t.Fatalf("unsafe host reached the policy: %s", bad)
	}
}
