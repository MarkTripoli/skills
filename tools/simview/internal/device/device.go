// Package device defines the backend-independent model: devices, frames, input and the
// Backend and Session interfaces every device source implements.
package device

import (
	"context"
	"errors"
	"image"
	"image/draw"
	"strings"
	"sync"
)

// Kind classifies a device row.
type Kind string

// Device kinds as they appear in the JSON listing.
const (
	Android Kind = "android"
	Browser Kind = "browser"
	IOS     Kind = "ios"
	// Remote is a remote host that could not be listed (a disabled row).
	Remote Kind = "remote"
)

// Info is one listed device. The JSON field names are the page's wire format.
type Info struct {
	ID      string `json:"id"`
	Kind    Kind   `json:"kind"`
	Name    string `json:"name"`
	Backend string `json:"backend"`
	Detail  string `json:"detail"`
	// Host is the machine the device runs on: a short hostname, or the remote's name/label.
	Host string `json:"host"`
	// Disabled marks a row that only reports a failure; it cannot be opened.
	Disabled bool `json:"disabled,omitempty"`
}

// Failure is a disabled row "<source>: <what> (<reason>)" for a backend that failed to list.
func Failure(id, source, what, reason string) Info {
	return Info{
		ID:       id,
		Kind:     Remote,
		Name:     source + ": " + what + " (" + reason + ")",
		Backend:  "-",
		Disabled: true,
	}
}

// Frame is one RGB888 picture.
type Frame struct {
	Width, Height int
	RGB           []byte
}

// RGBA converts the frame to an opaque RGBA image.
func (f *Frame) RGBA() (*image.RGBA, bool) {
	if f.Width <= 0 || f.Height <= 0 || len(f.RGB) != f.Width*f.Height*3 {
		return nil, false
	}
	img := image.NewRGBA(image.Rect(0, 0, f.Width, f.Height))
	src, dst := f.RGB, img.Pix
	for i, j := 0, 0; i < len(src); i, j = i+3, j+4 {
		dst[j], dst[j+1], dst[j+2], dst[j+3] = src[i], src[i+1], src[i+2], 255
	}
	return img, true
}

// FrameFromImage converts any image to an RGB888 frame.
func FrameFromImage(img image.Image) *Frame {
	b := img.Bounds()
	w, h := b.Dx(), b.Dy()
	rgba, ok := img.(*image.RGBA)
	if !ok || rgba.Rect.Min != (image.Point{}) {
		rgba = image.NewRGBA(image.Rect(0, 0, w, h))
		draw.Draw(rgba, rgba.Bounds(), img, b.Min, draw.Src)
	}
	rgb := make([]byte, w*h*3)
	for y := 0; y < h; y++ {
		row := rgba.Pix[y*rgba.Stride : y*rgba.Stride+w*4]
		o := y * w * 3
		for x := 0; x < w; x++ {
			rgb[o], rgb[o+1], rgb[o+2] = row[x*4], row[x*4+1], row[x*4+2]
			o += 3
		}
	}
	return &Frame{Width: w, Height: h, RGB: rgb}
}

// KeyName is a named key a session can press.
type KeyName int

// Named keys.
const (
	KeyEnter KeyName = iota + 1
	KeyBackspace
	KeyTab
	KeyDelete
	KeyUp
	KeyDown
	KeyLeft
	KeyRight
	KeyHome
	KeyEnd
	KeyPageUp
	KeyPageDown
	KeyGoBack
	KeyGoHome
	KeyAppSwitch
	KeyPower
)

var webKeys = map[KeyName]string{
	KeyEnter: "Enter", KeyBackspace: "Backspace", KeyTab: "Tab", KeyDelete: "Delete",
	KeyUp: "ArrowUp", KeyDown: "ArrowDown", KeyLeft: "ArrowLeft", KeyRight: "ArrowRight",
	KeyHome: "Home", KeyEnd: "End", KeyPageUp: "PageUp", KeyPageDown: "PageDown",
	KeyGoBack: "GoBack", KeyGoHome: "GoHome", KeyAppSwitch: "AppSwitch", KeyPower: "Power",
}

// WebKey is the W3C `key` value the emulator understands.
func (k KeyName) WebKey() string { return webKeys[k] }

var keyAliases = map[string]KeyName{
	"enter": KeyEnter, "return": KeyEnter, "backspace": KeyBackspace, "tab": KeyTab,
	"delete": KeyDelete, "del": KeyDelete, "up": KeyUp, "arrowup": KeyUp,
	"down": KeyDown, "arrowdown": KeyDown, "left": KeyLeft, "arrowleft": KeyLeft,
	"right": KeyRight, "arrowright": KeyRight, "home": KeyHome, "end": KeyEnd,
	"pageup": KeyPageUp, "pagedown": KeyPageDown,
	"goback": KeyGoBack, "back": KeyGoBack, "esc": KeyGoBack, "escape": KeyGoBack,
	"gohome": KeyGoHome, "appswitch": KeyAppSwitch, "power": KeyPower,
}

// ParseKey parses a CLI key name (case-insensitive). Esc and Back mean GoBack.
func ParseKey(s string) (KeyName, bool) {
	k, ok := keyAliases[strings.ToLower(s)]
	return k, ok
}

// InputKind selects the field set of an Input.
type InputKind int

// Input kinds.
const (
	Down InputKind = iota + 1
	Move
	Up
	// Wheel is clicks at a point: positive is wheel down (content moves up).
	Wheel
	Text
	Key
)

// Input is forwarded to a device. Coordinates are normalized to [0, 1].
type Input struct {
	Kind InputKind
	X, Y float32
	DY   int
	Text string
	Key  KeyName
}

// ErrClosed is returned when a session or frame source has ended.
var ErrClosed = errors.New("session closed")

// Session is a live connection to one device.
type Session interface {
	// Frames is the latest-wins frame source.
	Frames() *FrameBox
	// Send queues input; inputs are delivered in order. The channel yields one result
	// (nil on success) once the device took the input.
	Send(Input) <-chan error
	// SetBudget tells the backend the pixel box (w, h) it should scale frames into.
	SetBudget(w, h int)
	// Close ends the session and its goroutines.
	Close()
}

// Backend lists and opens devices.
type Backend interface {
	List(ctx context.Context) ([]Info, error)
	Connect(ctx context.Context, id string) (Session, error)
}

// FrameBox holds the newest frame. Producers overwrite, consumers wait for a newer one, so
// a slow consumer skips frames instead of queueing them.
type FrameBox struct {
	mu     sync.Mutex
	frame  *Frame
	seq    uint64
	closed bool
	wake   chan struct{}
}

// NewFrameBox returns an empty box.
func NewFrameBox() *FrameBox { return &FrameBox{wake: make(chan struct{})} }

// Set replaces the current frame and wakes waiters.
func (b *FrameBox) Set(f *Frame) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.closed {
		return
	}
	b.frame = f
	b.seq++
	close(b.wake)
	b.wake = make(chan struct{})
}

// Close marks the source ended; waiters get ErrClosed once they have seen the last frame.
func (b *FrameBox) Close() {
	b.mu.Lock()
	defer b.mu.Unlock()
	if !b.closed {
		b.closed = true
		close(b.wake)
	}
}

// Latest returns the newest frame (nil before the first) and its sequence number.
func (b *FrameBox) Latest() (*Frame, uint64) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.frame, b.seq
}

// Wait blocks until a frame newer than seq exists and returns it, or the context ends or
// the box closes (ErrClosed).
func (b *FrameBox) Wait(ctx context.Context, seq uint64) (*Frame, uint64, error) {
	for {
		b.mu.Lock()
		if b.seq > seq {
			f, s := b.frame, b.seq
			b.mu.Unlock()
			return f, s, nil
		}
		if b.closed {
			b.mu.Unlock()
			return nil, seq, ErrClosed
		}
		wake := b.wake
		b.mu.Unlock()
		select {
		case <-wake:
		case <-ctx.Done():
			return nil, seq, ctx.Err()
		}
	}
}

// Done reports whether the box has been closed.
func (b *FrameBox) Done() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.closed
}

// Budget is a thread-safe pixel box with change notification.
type Budget struct {
	mu   sync.Mutex
	w, h int
	ch   chan struct{}
}

// NewBudget returns a budget starting at w x h.
func NewBudget(w, h int) *Budget { return &Budget{w: w, h: h, ch: make(chan struct{}, 1)} }

// Set updates the box and signals Changed when it differs.
func (b *Budget) Set(w, h int) {
	b.mu.Lock()
	changed := b.w != w || b.h != h
	b.w, b.h = w, h
	b.mu.Unlock()
	if changed {
		select {
		case b.ch <- struct{}{}:
		default:
		}
	}
}

// Get returns the current box.
func (b *Budget) Get() (int, int) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.w, b.h
}

// Changed signals after Set changed the box.
func (b *Budget) Changed() <-chan struct{} { return b.ch }

// Ack returns a channel already holding err.
func Ack(err error) <-chan error {
	c := make(chan error, 1)
	c <- err
	return c
}
