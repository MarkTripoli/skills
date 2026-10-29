// Package ios drives booted iOS simulators through idb_companion. This file is pure Go
// (JPEG framing, HID conversion, simctl parsing) and builds and tests everywhere; the
// companion process and gRPC client in session.go only run on macOS.
package ios

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// maxPending is the most bytes kept without an EOI; more is garbage, not a frame.
const maxPending = 16 * 1024 * 1024

// JpegScanner finds JPEG frames in the idb MJPEG byte stream. One gRPC message is not
// guaranteed to hold one frame, so bytes are accumulated and cut at SOI (FF D8) and EOI
// (FF D9).
type JpegScanner struct{ buf []byte }

func find(hay []byte, a, b byte, from int) int {
	for i := from; i+1 < len(hay); i++ {
		if hay[i] == a && hay[i+1] == b {
			return i
		}
	}
	return -1
}

// Push adds stream bytes and returns every complete frame they finished, in order.
func (s *JpegScanner) Push(data []byte) [][]byte {
	s.buf = append(s.buf, data...)
	var frames [][]byte
	for {
		soi := find(s.buf, 0xFF, 0xD8, 0)
		if soi < 0 {
			// Keep a trailing FF: its D8 may arrive in the next message.
			keep := 0
			if n := len(s.buf); n > 0 && s.buf[n-1] == 0xFF {
				keep = 1
			}
			s.buf = append(s.buf[:0], s.buf[len(s.buf)-keep:]...)
			return frames
		}
		eoi := find(s.buf, 0xFF, 0xD9, soi+2)
		if eoi < 0 {
			s.buf = append(s.buf[:0], s.buf[soi:]...)
			if len(s.buf) > maxPending {
				s.buf = nil
			}
			return frames
		}
		frames = append(frames, append([]byte(nil), s.buf[soi:eoi+2]...))
		s.buf = append(s.buf[:0], s.buf[eoi+2:]...)
	}
}

// HIDForChar is the USB HID keyboard usage (page 0x07) and whether shift is held for one
// US-ASCII character.
func HIDForChar(c rune) (code uint64, shift bool, ok bool) {
	switch {
	case c >= 'a' && c <= 'z':
		return 0x04 + uint64(c-'a'), false, true
	case c >= 'A' && c <= 'Z':
		return 0x04 + uint64(c-'A'), true, true
	case c >= '1' && c <= '9':
		return 0x1E + uint64(c-'1'), false, true
	case c == '0':
		return 0x27, false, true
	}
	type e struct {
		code  uint64
		shift bool
	}
	m := map[rune]e{
		'\n': {0x28, false}, '\r': {0x28, false}, '\t': {0x2B, false}, ' ': {0x2C, false},
		'!': {0x1E, true}, '@': {0x1F, true}, '#': {0x20, true}, '$': {0x21, true},
		'%': {0x22, true}, '^': {0x23, true}, '&': {0x24, true}, '*': {0x25, true},
		'(': {0x26, true}, ')': {0x27, true}, '-': {0x2D, false}, '_': {0x2D, true},
		'=': {0x2E, false}, '+': {0x2E, true}, '[': {0x2F, false}, '{': {0x2F, true},
		']': {0x30, false}, '}': {0x30, true}, '\\': {0x31, false}, '|': {0x31, true},
		';': {0x33, false}, ':': {0x33, true}, '\'': {0x34, false}, '"': {0x34, true},
		'`': {0x35, false}, '~': {0x35, true}, ',': {0x36, false}, '<': {0x36, true},
		'.': {0x37, false}, '>': {0x37, true}, '/': {0x38, false}, '?': {0x38, true},
	}
	if v, ok := m[c]; ok {
		return v.code, v.shift, true
	}
	return 0, false, false
}

// HIDLeftShift is the HID usage of the left shift key.
const HIDLeftShift uint64 = 0xE1

// Button is a hardware button.
type Button int

// Hardware buttons.
const (
	ButtonHome Button = iota + 1
	ButtonLock
)

// ActionKind selects the field set of an Action.
type ActionKind int

// Action kinds.
const (
	ActTouch ActionKind = iota + 1
	ActSwipe
	ActButton
	ActKey
)

// Action is one step of the idb hid stream. Positions are screen points.
type Action struct {
	Kind       ActionKind
	Down       bool
	X, Y       float64 // touch point, or the swipe start
	EndX, EndY float64
	Duration   float64 // swipe seconds
	Button     Button
	Code       uint64
}

// ToPoints converts normalized (0..1) coordinates to screen points. idb's HID space is the
// portrait-native screen and the video frames are portrait-native too (a rotated device
// shows up as a sideways image), so the size from describe stays right after rotation.
func ToPoints(x, y float32, w, h float64) (float64, float64) {
	c := func(v float32) float64 { return math.Min(math.Max(float64(v), 0), 1) }
	return c(x) * w, c(y) * h
}

// TextActions are the HID events that type text. Characters outside US-ASCII are an error.
func TextActions(text string) ([]Action, error) {
	var out []Action
	for _, c := range text {
		code, shift, ok := HIDForChar(c)
		if !ok {
			return nil, fmt.Errorf("cannot type %q on iOS (US-ASCII only)", c)
		}
		if shift {
			out = append(out, Action{Kind: ActKey, Code: HIDLeftShift, Down: true})
		}
		out = append(out, Action{Kind: ActKey, Code: code, Down: true}, Action{Kind: ActKey, Code: code})
		if shift {
			out = append(out, Action{Kind: ActKey, Code: HIDLeftShift})
		}
	}
	return out, nil
}

func keyPress(code uint64) []Action {
	return []Action{{Kind: ActKey, Code: code, Down: true}, {Kind: ActKey, Code: code}}
}

func buttonPress(b Button) []Action {
	return []Action{{Kind: ActButton, Button: b, Down: true}, {Kind: ActButton, Button: b}}
}

// KeyActions are the HID events for a named key; Home and GoHome press the HOME button.
func KeyActions(k device.KeyName) ([]Action, error) {
	codes := map[device.KeyName]uint64{
		device.KeyEnter: 0x28, device.KeyGoBack: 0x29, device.KeyBackspace: 0x2A,
		device.KeyTab: 0x2B, device.KeyDelete: 0x4C, device.KeyPageUp: 0x4B,
		device.KeyEnd: 0x4D, device.KeyPageDown: 0x4E, device.KeyRight: 0x4F,
		device.KeyLeft: 0x50, device.KeyDown: 0x51, device.KeyUp: 0x52,
	}
	if c, ok := codes[k]; ok {
		return keyPress(c), nil
	}
	switch k {
	case device.KeyHome, device.KeyGoHome:
		return buttonPress(ButtonHome), nil
	case device.KeyPower:
		return buttonPress(ButtonLock), nil
	}
	return nil, errors.New("this key is not available on iOS")
}

// Gesture turns pointer input into idb touches. idb has no move event, so a drag is held
// back until the pointer is released and then sent as one swipe.
type Gesture struct {
	started bool
	sx, sy  float32
	t0      time.Time
}

const (
	tapSlopPt = 8.0
	swipeMin  = 0.15
	swipeMax  = 1.5
)

func tap(x, y float64) []Action {
	return []Action{{Kind: ActTouch, Down: true, X: x, Y: y}, {Kind: ActTouch, X: x, Y: y}}
}

// OnInput converts one input into HID actions; w, h is the screen size in points.
func (g *Gesture) OnInput(in device.Input, now time.Time, w, h float64) ([]Action, error) {
	switch in.Kind {
	case device.Down:
		g.started, g.sx, g.sy, g.t0 = true, in.X, in.Y, now
		return nil, nil
	case device.Move:
		return nil, nil
	case device.Up:
		ex, ey := ToPoints(in.X, in.Y, w, h)
		if !g.started {
			return tap(ex, ey), nil
		}
		g.started = false
		sx, sy := ToPoints(g.sx, g.sy, w, h)
		if math.Hypot(ex-sx, ey-sy) < tapSlopPt {
			return tap(sx, sy), nil
		}
		d := math.Min(math.Max(now.Sub(g.t0).Seconds(), swipeMin), swipeMax)
		return []Action{{Kind: ActSwipe, X: sx, Y: sy, EndX: ex, EndY: ey, Duration: d}}, nil
	case device.Wheel:
		endY := min(max(in.Y-float32(in.DY)*0.1, 0.02), 0.98)
		sx, sy := ToPoints(in.X, in.Y, w, h)
		ex, ey := ToPoints(in.X, endY, w, h)
		return []Action{{Kind: ActSwipe, X: sx, Y: sy, EndX: ex, EndY: ey, Duration: 0.15}}, nil
	case device.Text:
		return TextActions(in.Text)
	case device.Key:
		return KeyActions(in.Key)
	}
	return nil, fmt.Errorf("unknown input kind %d", in.Kind)
}

// Booted is one booted simulator from `xcrun simctl list devices booted -j`.
type Booted struct {
	UDID, Name string
	// Runtime is for example "iOS 26.5".
	Runtime string
}

// runtimeLabel turns com.apple.CoreSimulator.SimRuntime.iOS-26-5 into "iOS 26.5".
func runtimeLabel(key string) string {
	tail := key[strings.LastIndexByte(key, '.')+1:]
	os, ver, ok := strings.Cut(tail, "-")
	if !ok {
		return tail
	}
	return os + " " + strings.ReplaceAll(ver, "-", ".")
}

// ParseBooted parses simctl's JSON, newest-first order is not kept: rows sort by name.
func ParseBooted(raw []byte) ([]Booted, error) {
	var v struct {
		Devices map[string][]struct {
			UDID  string `json:"udid"`
			Name  string `json:"name"`
			State string `json:"state"`
		} `json:"devices"`
	}
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	if v.Devices == nil {
		return nil, errors.New("simctl output has no devices")
	}
	var out []Booted
	for rt, list := range v.Devices {
		for _, d := range list {
			if d.State != "" && d.State != "Booted" || d.UDID == "" || d.Name == "" {
				continue
			}
			out = append(out, Booted{d.UDID, d.Name, runtimeLabel(rt)})
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Name != out[j].Name {
			return out[i].Name < out[j].Name
		}
		return out[i].UDID < out[j].UDID
	})
	return out, nil
}

// IsUDID is true for a simulator UDID (8-4-4-4-12 hex), which is how iOS device ids look.
func IsUDID(id string) bool {
	parts := strings.Split(id, "-")
	if len(parts) != 5 {
		return false
	}
	for i, n := range []int{8, 4, 4, 4, 12} {
		if len(parts[i]) != n {
			return false
		}
		for _, c := range parts[i] {
			if !strings.ContainsRune("0123456789abcdefABCDEF", c) {
				return false
			}
		}
	}
	return true
}
