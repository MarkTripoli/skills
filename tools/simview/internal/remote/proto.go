// Package remote carries devices over a child process: the serve side (`simview serve
// --stdio`) exposes this host's backends on stdin/stdout, the client side runs a configured
// command (usually ssh) that starts the serve side elsewhere.
//
// Wire format: each message is a u32 big-endian length (counting the kind byte and the
// payload), a 1-byte kind, then the payload. Requests and responses carry JSON, frames a
// 16-byte header (width, height, seq, format; u32 big-endian) and pixel data, logs text.
package remote

import (
	"bytes"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// Version is the protocol version both ends must agree on in the hello handshake.
const Version = 1

// MaxMessage bounds one message; a larger length is treated as corruption.
const MaxMessage = 64 * 1024 * 1024

// Message kinds.
const (
	KindReq   byte = 1
	KindResp  byte = 2
	KindFrame byte = 3
	KindLog   byte = 4
)

// Request ops.
const (
	OpHello      = "hello"
	OpList       = "list"
	OpConnect    = "connect"
	OpInput      = "input"
	OpBudget     = "budget"
	OpDisconnect = "disconnect"
)

// Request is a client request; which fields matter depends on Op.
type Request struct {
	ID      uint64     `json:"id"`
	Op      string     `json:"op"`
	Version int        `json:"version,omitempty"`
	Device  string     `json:"device,omitempty"`
	W       int        `json:"w,omitempty"`
	H       int        `json:"h,omitempty"`
	Input   *WireInput `json:"input,omitempty"`
}

// Response answers the request with the same ID.
type Response struct {
	ID    uint64          `json:"id"`
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data,omitempty"`
	Error string          `json:"error,omitempty"`
}

// Pixel formats of a frame message.
const (
	FormatRGB  uint32 = 0
	FormatJPEG uint32 = 1
)

// FrameMsg is one picture; Data is RGB888 or JPEG according to Format.
type FrameMsg struct {
	Width, Height uint32
	Seq           uint32
	Format        uint32
	Data          []byte
}

// Message is one decoded message; exactly the field of its Kind is set.
type Message struct {
	Kind  byte
	Req   *Request
	Resp  *Response
	Frame *FrameMsg
	Log   string
}

// WireInput is device.Input on the wire. Key is the W3C key name.
type WireInput struct {
	Kind string  `json:"kind"`
	X    float32 `json:"x,omitempty"`
	Y    float32 `json:"y,omitempty"`
	DY   int     `json:"dy,omitempty"`
	Text string  `json:"text,omitempty"`
	Key  string  `json:"key,omitempty"`
}

var inputKinds = map[device.InputKind]string{
	device.Down: "down", device.Move: "move", device.Up: "up",
	device.Wheel: "wheel", device.Text: "text", device.Key: "key",
}

// ToWire converts an input for the wire.
func ToWire(in device.Input) (WireInput, error) {
	k, ok := inputKinds[in.Kind]
	if !ok {
		return WireInput{}, fmt.Errorf("unknown input kind %d", in.Kind)
	}
	return WireInput{Kind: k, X: in.X, Y: in.Y, DY: in.DY, Text: in.Text, Key: in.Key.WebKey()}, nil
}

// FromWire converts a wire input back, rejecting unknown kinds and keys.
func FromWire(w WireInput) (device.Input, error) {
	for k, name := range inputKinds {
		if name != w.Kind {
			continue
		}
		in := device.Input{Kind: k, X: w.X, Y: w.Y, DY: w.DY, Text: w.Text}
		if k == device.Key {
			key, ok := device.ParseKey(w.Key)
			if !ok {
				return device.Input{}, fmt.Errorf("unknown key %q", w.Key)
			}
			in.Key = key
		}
		return in, nil
	}
	return device.Input{}, fmt.Errorf("unknown input kind %q", w.Kind)
}

// Encode serializes a message with its length prefix.
func Encode(m Message) ([]byte, error) {
	var payload []byte
	var err error
	switch m.Kind {
	case KindReq:
		if m.Req == nil {
			return nil, errors.New("request message without a request")
		}
		payload, err = json.Marshal(m.Req)
	case KindResp:
		if m.Resp == nil {
			return nil, errors.New("response message without a response")
		}
		payload, err = json.Marshal(m.Resp)
	case KindLog:
		payload = []byte(m.Log)
	case KindFrame:
		if m.Frame == nil {
			return nil, errors.New("frame message without a frame")
		}
		f := m.Frame
		payload = make([]byte, 16, 16+len(f.Data))
		for i, v := range []uint32{f.Width, f.Height, f.Seq, f.Format} {
			binary.BigEndian.PutUint32(payload[i*4:], v)
		}
		payload = append(payload, f.Data...)
	default:
		return nil, fmt.Errorf("unknown message kind %d", m.Kind)
	}
	if err != nil {
		return nil, err
	}
	n := len(payload) + 1
	if n > MaxMessage {
		return nil, fmt.Errorf("message too large (%d bytes)", n)
	}
	out := make([]byte, 5, 5+len(payload))
	binary.BigEndian.PutUint32(out, uint32(n))
	out[4] = m.Kind
	return append(out, payload...), nil
}

func decodeBody(kind byte, p []byte) (Message, error) {
	m := Message{Kind: kind}
	switch kind {
	case KindReq:
		m.Req = new(Request)
		return m, json.Unmarshal(p, m.Req)
	case KindResp:
		m.Resp = new(Response)
		return m, json.Unmarshal(p, m.Resp)
	case KindLog:
		m.Log = string(p)
		return m, nil
	case KindFrame:
		if len(p) < 16 {
			return m, errors.New("frame shorter than its 16-byte header")
		}
		n := func(i int) uint32 { return binary.BigEndian.Uint32(p[i*4:]) }
		f := &FrameMsg{Width: n(0), Height: n(1), Seq: n(2), Format: n(3), Data: p[16:]}
		if f.Format != FormatRGB && f.Format != FormatJPEG {
			return m, fmt.Errorf("unknown pixel format %d", f.Format)
		}
		m.Frame = f
		return m, nil
	}
	return m, fmt.Errorf("unknown message kind %d", kind)
}

// Decode decodes bytes holding exactly one message.
func Decode(b []byte) (Message, error) {
	if len(b) < 5 {
		return Message{}, errors.New("truncated message header")
	}
	n := int(binary.BigEndian.Uint32(b))
	if n < 1 || len(b) != 4+n {
		return Message{}, errors.New("truncated or oversized message")
	}
	return decodeBody(b[4], b[5:])
}

// ReadMessage reads one message. A clean EOF between messages is io.EOF; EOF inside one is
// an error naming the truncation.
func ReadMessage(r io.Reader) (Message, error) {
	var head [4]byte
	if n, err := io.ReadFull(r, head[:]); err != nil {
		if n == 0 && errors.Is(err, io.EOF) {
			return Message{}, io.EOF
		}
		return Message{}, errors.New("truncated message header")
	}
	n := binary.BigEndian.Uint32(head[:])
	if n < 1 || n > MaxMessage {
		return Message{}, fmt.Errorf("bad message length %d", n)
	}
	body := make([]byte, n)
	if _, err := io.ReadFull(r, body); err != nil {
		return Message{}, fmt.Errorf("truncated message body: %w", err)
	}
	return decodeBody(body[0], body[1:])
}

// jpegQuality is the quality of frames sent over the wire.
const jpegQuality = 70

// EncodeFrame JPEG-encodes a frame into a wire frame message.
func EncodeFrame(f *device.Frame, seq uint32) (*FrameMsg, error) {
	img, ok := f.RGBA()
	if !ok {
		return nil, errors.New("bad frame")
	}
	var buf bytes.Buffer
	if err := jpegEncode(&buf, img); err != nil {
		return nil, err
	}
	return &FrameMsg{Width: uint32(f.Width), Height: uint32(f.Height), Seq: seq, Format: FormatJPEG, Data: buf.Bytes()}, nil
}

// ToFrame decodes a wire frame (raw or JPEG) into a device frame.
func ToFrame(m *FrameMsg) (*device.Frame, error) {
	switch m.Format {
	case FormatRGB:
		if uint64(len(m.Data)) != uint64(m.Width)*uint64(m.Height)*3 || m.Width == 0 || m.Height == 0 {
			return nil, errors.New("raw frame size mismatch")
		}
		return &device.Frame{Width: int(m.Width), Height: int(m.Height), RGB: m.Data}, nil
	case FormatJPEG:
		img, err := jpegDecode(m.Data)
		if err != nil {
			return nil, err
		}
		return device.FrameFromImage(img), nil
	}
	return nil, fmt.Errorf("unknown pixel format %d", m.Format)
}
