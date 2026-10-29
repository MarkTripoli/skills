// Package cdp is the Chromium backend over the DevTools protocol: one device per page target.
package cdp

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/jpeg"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// Backend probes debugging ports: the configured ones, SIMVIEW_CDP_PORTS, and on Linux the
// --remote-debugging-port=N of running chrome/chromium/electron processes.
type Backend struct{ Ports []int }

// New builds the backend from the configured ports.
func New(configured []int) *Backend {
	set := map[int]bool{}
	for _, p := range configured {
		set[p] = true
	}
	for _, p := range strings.Split(os.Getenv("SIMVIEW_CDP_PORTS"), ",") {
		if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil {
			set[n] = true
		}
	}
	if runtime.GOOS == "linux" {
		for _, p := range procPorts() {
			set[p] = true
		}
	}
	delete(set, 0)
	b := &Backend{}
	for p := range set {
		if p > 0 && p < 65536 {
			b.Ports = append(b.Ports, p)
		}
	}
	sort.Ints(b.Ports)
	return b
}

// Target is one /json/list entry.
type Target struct {
	ID    string `json:"id"`
	Title string `json:"title"`
	URL   string `json:"url"`
	Type  string `json:"type"`
	WSURL string `json:"webSocketDebuggerUrl"`
}

// ParseTargets parses a /json/list body, keeping only page targets.
func ParseTargets(body []byte) ([]Target, error) {
	var all []Target
	if err := json.Unmarshal(body, &all); err != nil {
		return nil, err
	}
	var out []Target
	for _, t := range all {
		if t.Type == "page" {
			out = append(out, t)
		}
	}
	return out, nil
}

// PortFromCmdline extracts --remote-debugging-port=N from the NUL-separated cmdline of a
// browser process.
func PortFromCmdline(cmdline []byte) (int, bool) {
	// Chrome rewrites its process title, so the arguments can arrive space-separated inside
	// one NUL-separated entry; split on both.
	var args []string
	for _, a := range bytes.Split(cmdline, []byte{0}) {
		args = append(args, strings.Fields(string(a))...)
	}
	if len(args) == 0 {
		return 0, false
	}
	exe := strings.ToLower(args[0])
	base := exe[strings.LastIndexByte(exe, '/')+1:]
	known := false
	for _, n := range []string{"chrome", "chromium", "electron"} {
		if strings.Contains(base, n) {
			known = true
		}
	}
	if !known {
		return 0, false
	}
	for _, a := range args {
		if v, ok := strings.CutPrefix(a, "--remote-debugging-port="); ok {
			if n, err := strconv.ParseUint(v, 10, 16); err == nil {
				return int(n), true
			}
		}
	}
	return 0, false
}

func procPorts() []int {
	entries, err := os.ReadDir("/proc")
	if err != nil {
		return nil
	}
	var out []int
	for _, e := range entries {
		if _, err := strconv.Atoi(e.Name()); err != nil {
			continue
		}
		b, err := os.ReadFile(filepath.Join("/proc", e.Name(), "cmdline"))
		if err != nil {
			continue
		}
		if p, ok := PortFromCmdline(b); ok {
			out = append(out, p)
		}
	}
	return out
}

// DeviceID is "cdp:<port>:<targetId>".
func DeviceID(port int, target string) string { return fmt.Sprintf("cdp:%d:%s", port, target) }

// ParseID splits "cdp:<port>:<targetId>".
func ParseID(id string) (int, string, bool) {
	rest, ok := strings.CutPrefix(id, "cdp:")
	if !ok {
		return 0, "", false
	}
	port, target, ok := strings.Cut(rest, ":")
	if !ok {
		return 0, "", false
	}
	n, err := strconv.Atoi(port)
	if err != nil {
		return 0, "", false
	}
	return n, target, true
}

// Both discovery and WebSocket handshakes must stay on the validated endpoint.
var (
	discoveryHTTPClient = &http.Client{CheckRedirect: rejectRedirect}
	websocketHTTPClient = &http.Client{CheckRedirect: rejectRedirect}
)

func rejectRedirect(_ *http.Request, _ []*http.Request) error {
	return errors.New("cdp redirects are not allowed")
}

func fetchTargets(ctx context.Context, port int, timeout time.Duration) ([]Target, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/json/list", port), nil)
	if err != nil {
		return nil, err
	}
	resp, err := discoveryHTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	return ParseTargets(body)
}

// List returns one row per page target on the probed ports.
func (b *Backend) List(ctx context.Context) ([]device.Info, error) {
	var out []device.Info
	for _, port := range b.Ports {
		targets, err := fetchTargets(ctx, port, 500*time.Millisecond)
		if err != nil {
			continue
		}
		for _, t := range targets {
			name := t.Title
			if name == "" {
				name = t.URL
			}
			if r := []rune(name); len(r) > 60 {
				name = string(r[:60])
			}
			out = append(out, device.Info{
				ID: DeviceID(port, t.ID), Kind: device.Browser, Name: name,
				Backend: "cdp", Detail: fmt.Sprintf("cdp:%d", port),
			})
		}
	}
	return out, nil
}

// Connect opens a session on a page target.
func (b *Backend) Connect(ctx context.Context, id string) (device.Session, error) {
	port, target, ok := ParseID(id)
	if !ok {
		return nil, fmt.Errorf("bad cdp id %s", id)
	}
	if !slices.Contains(b.Ports, port) {
		return nil, fmt.Errorf("cdp port %d is not one this backend probes", port)
	}
	targets, err := fetchTargets(ctx, port, 2*time.Second)
	if err != nil {
		return nil, fmt.Errorf("no browser on CDP port %d: %w", port, err)
	}
	for _, t := range targets {
		if t.ID == target {
			if t.WSURL == "" {
				return nil, fmt.Errorf("target %s has no debugger url", target)
			}
			if err := checkWSURL(t.WSURL, port); err != nil {
				return nil, fmt.Errorf("target %s: %w", target, err)
			}
			return Start(t.WSURL), nil
		}
	}
	return nil, fmt.Errorf("no page target %s on port %d", target, port)
}

// checkWSURL accepts only a ws URL on a loopback host and the probed port, so a hostile
// /json/list answer cannot redirect the dial elsewhere.
func checkWSURL(raw string, port int) error {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "ws" && u.Scheme != "wss") {
		return fmt.Errorf("bad debugger url")
	}
	switch u.Hostname() {
	case "127.0.0.1", "localhost", "::1":
	default:
		return fmt.Errorf("debugger url host %q is not loopback", u.Hostname())
	}
	if u.Port() != strconv.Itoa(port) {
		return fmt.Errorf("debugger url port %q is not the probed port %d", u.Port(), port)
	}
	return nil
}

type keySpec struct {
	key, code string
	vk        int
	text      string
}

var keySpecs = map[device.KeyName]keySpec{
	device.KeyEnter:     {"Enter", "Enter", 13, "\r"},
	device.KeyBackspace: {"Backspace", "Backspace", 8, ""},
	device.KeyTab:       {"Tab", "Tab", 9, ""},
	device.KeyDelete:    {"Delete", "Delete", 46, ""},
	device.KeyUp:        {"ArrowUp", "ArrowUp", 38, ""},
	device.KeyDown:      {"ArrowDown", "ArrowDown", 40, ""},
	device.KeyLeft:      {"ArrowLeft", "ArrowLeft", 37, ""},
	device.KeyRight:     {"ArrowRight", "ArrowRight", 39, ""},
	device.KeyHome:      {"Home", "Home", 36, ""},
	device.KeyEnd:       {"End", "End", 35, ""},
	device.KeyPageUp:    {"PageUp", "PageUp", 33, ""},
	device.KeyPageDown:  {"PageDown", "PageDown", 34, ""},
	device.KeyGoBack:    {"Escape", "Escape", 27, ""},
}

type obj = map[string]any

// KeyEvents are the keyDown/keyUp Input.dispatchKeyEvent params for a named key; nil for
// device-only keys.
func KeyEvents(k device.KeyName) []obj {
	s, ok := keySpecs[k]
	if !ok {
		return nil
	}
	typ := "rawKeyDown"
	if s.text != "" {
		typ = "keyDown"
	}
	down := obj{"type": typ, "key": s.key, "code": s.code, "windowsVirtualKeyCode": s.vk, "nativeVirtualKeyCode": s.vk}
	if s.text != "" {
		down["text"] = s.text
	}
	up := obj{"type": "keyUp", "key": s.key, "code": s.code, "windowsVirtualKeyCode": s.vk, "nativeVirtualKeyCode": s.vk}
	return []obj{down, up}
}

// MouseEvent builds Input.dispatchMouseEvent params in CSS pixels. kind is mousePressed,
// mouseMoved, mouseReleased or mouseWheel.
func MouseEvent(kind string, x, y float32, cssW, cssH float64, dy int, held bool) obj {
	cl := func(v float32) float64 { return float64(min(max(v, 0), 1)) }
	v := obj{
		"type": kind,
		"x":    cl(x) * max(cssW-1, 0), "y": cl(y) * max(cssH-1, 0),
		"button": "none", "buttons": 0,
	}
	switch kind {
	case "mousePressed", "mouseReleased":
		v["button"], v["clickCount"] = "left", 1
		if kind == "mousePressed" {
			v["buttons"] = 1
		}
	case "mouseMoved":
		if held {
			v["button"], v["buttons"] = "left", 1
		}
	case "mouseWheel":
		v["deltaX"], v["deltaY"] = 0, dy*100
	}
	return v
}

type inputMsg struct {
	in  device.Input
	ack chan error
}

// Session streams one page with Page.startScreencast and injects input.
type Session struct {
	box    *device.FrameBox
	budget *device.Budget
	input  chan inputMsg
	cancel context.CancelFunc
	done   chan struct{}
}

// Start connects to a page's debugger URL and begins the screencast.
func Start(wsURL string) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		box: device.NewFrameBox(), budget: device.NewBudget(1280, 800),
		input: make(chan inputMsg, 1024), cancel: cancel, done: make(chan struct{}),
	}
	go func() {
		defer close(s.done)
		// The session ends when the socket drops; the frame box then closes.
		_ = s.run(ctx, wsURL)
		s.box.Close()
	}()
	return s
}

// Frames is the latest-wins frame source.
func (s *Session) Frames() *device.FrameBox { return s.box }

// SetBudget sets the pixel box the screencast is scaled into.
func (s *Session) SetBudget(w, h int) { s.budget.Set(w, h) }

// Close ends the session.
func (s *Session) Close() {
	s.cancel()
	<-s.done
}

// Send queues input for in-order delivery.
func (s *Session) Send(in device.Input) <-chan error {
	m := inputMsg{in: in, ack: make(chan error, 1)}
	select {
	case s.input <- m:
	default:
		m.ack <- errors.New("cdp input queue full")
	}
	return m.ack
}

type conn struct {
	ws         *websocket.Conn
	nextID     int
	cssW, cssH float64
	held       bool
}

func (c *conn) call(ctx context.Context, method string, params obj) error {
	c.nextID++
	b, err := json.Marshal(obj{"id": c.nextID, "method": method, "params": params})
	if err != nil {
		return err
	}
	return c.ws.Write(ctx, websocket.MessageText, b)
}

func (c *conn) startScreencast(ctx context.Context, w, h int) error {
	return c.call(ctx, "Page.startScreencast", obj{"format": "jpeg", "quality": 70, "maxWidth": w, "maxHeight": h, "everyNthFrame": 1})
}

func (c *conn) deliver(ctx context.Context, in device.Input) error {
	mouse := func(kind string) error {
		return c.call(ctx, "Input.dispatchMouseEvent", MouseEvent(kind, in.X, in.Y, c.cssW, c.cssH, in.DY, c.held))
	}
	switch in.Kind {
	case device.Down:
		c.held = true
		return mouse("mousePressed")
	case device.Move:
		return mouse("mouseMoved")
	case device.Up:
		c.held = false
		return mouse("mouseReleased")
	case device.Wheel:
		c.held = false
		return mouse("mouseWheel")
	case device.Text:
		return c.call(ctx, "Input.insertText", obj{"text": in.Text})
	case device.Key:
		evs := KeyEvents(in.Key)
		if evs == nil {
			return fmt.Errorf("key %s is not a browser key", in.Key.WebKey())
		}
		for _, e := range evs {
			if err := c.call(ctx, "Input.dispatchKeyEvent", e); err != nil {
				return err
			}
		}
		return nil
	}
	return fmt.Errorf("unknown input kind %d", in.Kind)
}

// onMessage handles one inbound message; it returns a decoded frame when it carried one.
func (c *conn) onMessage(ctx context.Context, text []byte) *device.Frame {
	var m struct {
		Method string `json:"method"`
		Params struct {
			SessionID *int64 `json:"sessionId"`
			Data      string `json:"data"`
			Metadata  struct {
				DeviceWidth  float64 `json:"deviceWidth"`
				DeviceHeight float64 `json:"deviceHeight"`
			} `json:"metadata"`
		} `json:"params"`
	}
	if json.Unmarshal(text, &m) != nil || m.Method != "Page.screencastFrame" {
		return nil
	}
	if m.Params.SessionID != nil {
		_ = c.call(ctx, "Page.screencastFrameAck", obj{"sessionId": *m.Params.SessionID})
	}
	if md := m.Params.Metadata; md.DeviceWidth > 0 && md.DeviceHeight > 0 {
		c.cssW, c.cssH = md.DeviceWidth, md.DeviceHeight
	}
	raw, err := base64.StdEncoding.DecodeString(m.Params.Data)
	if err != nil {
		return nil
	}
	img, err := jpeg.Decode(bytes.NewReader(raw))
	if err != nil {
		return nil
	}
	return toFrame(img)
}

func toFrame(img image.Image) *device.Frame {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	rgb := make([]byte, 0, w*h*3)
	if ycc, ok := img.(*image.YCbCr); ok {
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				yi := ycc.YOffset(x, y)
				ci := ycc.COffset(x, y)
				r, g, bl := ycbcr(ycc.Y[yi], ycc.Cb[ci], ycc.Cr[ci])
				rgb = append(rgb, r, g, bl)
			}
		}
	} else {
		for y := b.Min.Y; y < b.Max.Y; y++ {
			for x := b.Min.X; x < b.Max.X; x++ {
				r, g, bl, _ := img.At(x, y).RGBA()
				rgb = append(rgb, byte(r>>8), byte(g>>8), byte(bl>>8))
			}
		}
	}
	return &device.Frame{Width: w, Height: h, RGB: rgb}
}

func ycbcr(y, cb, cr uint8) (uint8, uint8, uint8) {
	yy := int32(y) * 0x10101
	cb1 := int32(cb) - 128
	cr1 := int32(cr) - 128
	r := (yy + 91881*cr1) >> 16
	g := (yy - 22554*cb1 - 46802*cr1) >> 16
	b := (yy + 116130*cb1) >> 16
	clamp := func(v int32) uint8 { return uint8(min(max(v, 0), 255)) }
	return clamp(r), clamp(g), clamp(b)
}

func (s *Session) run(ctx context.Context, wsURL string) error {
	dctx, dcancel := context.WithTimeout(ctx, 10*time.Second)
	ws, _, err := websocket.Dial(dctx, wsURL, &websocket.DialOptions{HTTPClient: websocketHTTPClient})
	dcancel()
	if err != nil {
		return err
	}
	defer ws.CloseNow()
	ws.SetReadLimit(64 << 20)
	c := &conn{ws: ws, cssW: 1280, cssH: 800}
	if err := c.call(ctx, "Page.enable", obj{}); err != nil {
		return err
	}
	bw, bh := s.budget.Get()
	if err := c.startScreencast(ctx, bw, bh); err != nil {
		return err
	}
	msgs := make(chan []byte, 8)
	readErr := make(chan error, 1)
	go func() {
		for {
			typ, b, err := ws.Read(ctx)
			if err != nil {
				readErr <- err
				return
			}
			if typ == websocket.MessageText {
				select {
				case msgs <- b:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	for {
		select {
		case b := <-msgs:
			if f := c.onMessage(ctx, b); f != nil {
				s.box.Set(f)
			}
		case <-readErr:
			return nil
		case m := <-s.input:
			m.ack <- c.deliver(ctx, m.in)
		case <-s.budget.Changed():
			w, h := s.budget.Get()
			if err := c.call(ctx, "Page.stopScreencast", obj{}); err != nil {
				return err
			}
			if err := c.startScreencast(ctx, w, h); err != nil {
				return err
			}
		case <-ctx.Done():
			return ctx.Err()
		}
	}
}
