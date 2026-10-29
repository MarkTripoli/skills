package web

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/coder/websocket"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/safety"
)

// The /ws protocol.
//
// Client to server (text JSON): {"op":"sub","id":ID}, {"op":"unsub","id":ID},
// {"op":"input","id":ID,"seq":N,"ev":{..input..}}.
//
// Server to client: binary frames (EncodeFrame), and text JSON
// {"op":"ack","seq":N,"ok":bool,"err":".."}, {"op":"status","id":ID,"state":"connecting|live|error","err":".."},
// {"op":"notes","notes":{..}}, {"op":"error","err":".."}.

const writeTimeout = 15 * time.Second

// ClientMsg is a message from the page.
type ClientMsg struct {
	Op  string          `json:"op"`
	ID  string          `json:"id"`
	Seq uint64          `json:"seq"`
	Ev  json.RawMessage `json:"ev"`
}

// ParseClient decodes and validates a page message.
func ParseClient(text []byte) (ClientMsg, error) {
	var raw struct {
		Op  string          `json:"op"`
		ID  *string         `json:"id"`
		Seq *uint64         `json:"seq"`
		Ev  json.RawMessage `json:"ev"`
	}
	if err := json.Unmarshal(text, &raw); err != nil {
		return ClientMsg{}, fmt.Errorf("bad message: %w", err)
	}
	switch raw.Op {
	case "sub", "unsub":
		if raw.ID == nil {
			return ClientMsg{}, fmt.Errorf("bad message: %s needs id", raw.Op)
		}
		return ClientMsg{Op: raw.Op, ID: *raw.ID}, nil
	case "input":
		if raw.ID == nil || raw.Seq == nil || len(raw.Ev) == 0 {
			return ClientMsg{}, errors.New("bad message: input needs id, seq and ev")
		}
		return ClientMsg{Op: raw.Op, ID: *raw.ID, Seq: *raw.Seq, Ev: raw.Ev}, nil
	}
	return ClientMsg{}, fmt.Errorf("bad message: unknown op %q", raw.Op)
}

// EncodeFrame builds a frame message: u16 BE id length, the id, u32 BE frame sequence, then
// the JPEG bytes.
func EncodeFrame(id string, seq uint32, jpg []byte) []byte {
	idb := []byte(id)
	if len(idb) > 0xffff {
		idb = idb[:0xffff]
	}
	out := make([]byte, 0, 2+len(idb)+4+len(jpg))
	out = binary.BigEndian.AppendUint16(out, uint16(len(idb)))
	out = append(out, idb...)
	out = binary.BigEndian.AppendUint32(out, seq)
	return append(out, jpg...)
}

type obj = map[string]any

func statusMsg(id, state string, err *string) obj {
	return obj{"op": "status", "id": id, "state": state, "err": err}
}

func ackMsg(seq uint64, err error) obj {
	if err == nil {
		return obj{"op": "ack", "seq": seq, "ok": true}
	}
	return obj{"op": "ack", "seq": seq, "ok": false, "err": err.Error()}
}

type wsConn struct {
	c *websocket.Conn
}

func (w *wsConn) write(ctx context.Context, typ websocket.MessageType, b []byte) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()
	return w.c.Write(ctx, typ, b)
}

func (w *wsConn) json(ctx context.Context, v any) error {
	b, err := marshal(v)
	if err != nil {
		return err
	}
	return w.write(ctx, websocket.MessageText, b)
}

type inputJob struct {
	seq uint64
	ev  json.RawMessage
}

func (s *Server) serveWS(w *statusWriter, r *http.Request) {
	c, err := websocket.Accept(w, r, &websocket.AcceptOptions{CompressionMode: websocket.CompressionDisabled})
	if err != nil {
		// Accept already answered a malformed upgrade (400/403/426).
		return
	}
	w.note(http.StatusSwitchingProtocols)
	defer c.CloseNow()
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	conn := &wsConn{c: c}

	var wg sync.WaitGroup
	subs := map[string]context.CancelFunc{}
	inputs := map[string]chan inputJob{}

	// Notes are pushed whenever they change.
	wg.Add(1)
	go func() {
		defer wg.Done()
		last := ""
		for {
			b, _ := marshal(s.Notes.All())
			if cur := string(b); cur != last {
				last = cur
				if conn.write(ctx, websocket.MessageText, []byte(`{"op":"notes","notes":`+cur+`}`)) != nil {
					return
				}
			}
			select {
			case <-time.After(time.Second):
			case <-ctx.Done():
				return
			}
		}
	}()

	for {
		typ, data, err := c.Read(ctx)
		if err != nil {
			break
		}
		if typ != websocket.MessageText {
			continue
		}
		m, err := ParseClient(data)
		if err != nil {
			if conn.json(ctx, obj{"op": "error", "err": err.Error()}) != nil {
				break
			}
			continue
		}
		switch m.Op {
		case "sub":
			if stop := subs[m.ID]; stop != nil {
				stop()
			}
			sctx, scancel := context.WithCancel(ctx)
			subs[m.ID] = scancel
			wg.Add(1)
			go func(id string) {
				defer wg.Done()
				s.subscription(sctx, conn, id)
			}(m.ID)
		case "unsub":
			if stop := subs[m.ID]; stop != nil {
				stop()
				delete(subs, m.ID)
			}
		case "input":
			ch := inputs[m.ID]
			if ch == nil {
				ch = make(chan inputJob, 4096)
				inputs[m.ID] = ch
				wg.Add(1)
				go func(id string) {
					defer wg.Done()
					s.inputWorker(ctx, conn, id, ch)
				}(m.ID)
			}
			select {
			case ch <- inputJob{m.Seq, m.Ev}:
			default:
				if conn.json(ctx, ackMsg(m.Seq, errors.New("input queue full"))) != nil {
					cancel()
				}
			}
		}
	}
	cancel()
	wg.Wait()
	c.Close(websocket.StatusNormalClosure, "")
}

// inputWorker delivers one device's input in order; a hung device only delays its own queue.
func (s *Server) inputWorker(ctx context.Context, conn *wsConn, id string, jobs <-chan inputJob) {
	for {
		select {
		case <-ctx.Done():
			return
		case j := <-jobs:
			if conn.json(ctx, ackMsg(j.seq, s.deliverEvent(id, j.ev))) != nil {
				return
			}
		}
	}
}

func (s *Server) deliverEvent(id string, ev json.RawMessage) error {
	if !safety.InputAllowed(id) {
		return errors.New(safety.Refusal(id))
	}
	in, err := ParseInput(ev)
	if err != nil {
		return err
	}
	return s.deliver(id, in)
}

// subscription streams one device to the socket: latest frame wins, because each frame is
// written to the socket before the next is read, so a slow socket skips frames instead of
// queueing them. A failed device is retried every 3 s.
func (s *Server) subscription(ctx context.Context, conn *wsConn, id string) {
	for {
		if conn.json(ctx, statusMsg(id, "connecting", nil)) != nil {
			return
		}
		err := s.runSub(ctx, conn, id)
		if ctx.Err() != nil {
			return
		}
		msg := err.Error()
		if conn.json(ctx, statusMsg(id, "error", &msg)) != nil {
			return
		}
		select {
		case <-time.After(3 * time.Second):
		case <-ctx.Done():
			return
		}
	}
}

func (s *Server) runSub(ctx context.Context, conn *wsConn, id string) error {
	lease, err := s.session(id)
	if err != nil {
		return err
	}
	defer lease.Release()
	lease.Val.SetBudget(4096, MaxHeight)
	var (
		seq  uint32
		live bool
		c    jpegCache
	)
	err = frameLoop(ctx, lease.Val.Frames(), s.MaxFPS, func(f *device.Frame, fseq uint64) error {
		jpg, err := c.get(f, fseq)
		if err != nil {
			return err
		}
		if !live {
			live = true
			if err := conn.json(ctx, statusMsg(id, "live", nil)); err != nil {
				return err
			}
		}
		seq++
		return conn.write(ctx, websocket.MessageBinary, EncodeFrame(id, seq, jpg))
	})
	if errors.Is(err, device.ErrClosed) {
		lease.Evict()
	}
	return err
}
