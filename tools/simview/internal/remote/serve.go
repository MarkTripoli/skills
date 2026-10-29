package remote

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/backends"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// Local is what the serve side exposes: this host's own backends.
type Local interface {
	ListParts(ctx context.Context) ([]device.Info, []backends.Failure)
	Connect(ctx context.Context, id string) (device.Session, error)
}

// ServeOptions tunes Serve; zero values take the defaults.
type ServeOptions struct {
	// Allow reports whether input to id is allowed on this host (SIMVIEW_INPUT_ALLOW). The
	// client's list does not travel over SSH, so this host's own list applies too. Nil allows
	// everything.
	Allow func(id string) bool
	// SendTimeout bounds how long one input may wait for the device (default 5 s). A device
	// that never answers must not stall every later request.
	SendTimeout time.Duration
	// ConnectTimeout bounds one device connect (default 15 s).
	ConnectTimeout time.Duration
}

type active struct {
	id      string
	session device.Session
	cancel  context.CancelFunc
	done    chan struct{}
}

func (a *active) stop() {
	a.cancel()
	<-a.done
	a.session.Close()
}

// Serve answers requests from r and writes responses and frames to w until r ends or ctx is
// cancelled. Frames are JPEG, latest-wins: the pump encodes the newest frame only after the
// previous write finished.
func Serve(ctx context.Context, r io.Reader, w io.Writer, local Local, opt ServeOptions) error {
	if opt.SendTimeout <= 0 {
		opt.SendTimeout = 5 * time.Second
	}
	if opt.ConnectTimeout <= 0 {
		opt.ConnectTimeout = 15 * time.Second
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// Frames and control messages (responses, logs) queue separately and the writer prefers
	// control, so a full frame queue behind a slow writer never stalls the request loop.
	out := make(chan []byte, 8)
	ctl := make(chan []byte, 8)
	writerDone := make(chan struct{})
	go func() {
		defer close(writerDone)
		write := func(b []byte) bool {
			if _, err := w.Write(b); err != nil {
				cancel()
				return false
			}
			return true
		}
		control := ctl
		for {
			// Prefer control replies, but stop selecting a closed control queue.
			select {
			case <-ctx.Done():
				return
			default:
			}
			select {
			case b, ok := <-control:
				if !ok {
					control = nil
				} else if !write(b) {
					return
				}
				continue
			default:
			}
			select {
			case <-ctx.Done():
				return
			case b, ok := <-control:
				if !ok {
					control = nil
				} else if !write(b) {
					return
				}
			case b, ok := <-out:
				if !ok {
					for b := range ctl {
						if !write(b) {
							return
						}
					}
					return
				}
				if !write(b) {
					return
				}
			}
		}
	}()
	// sendOn queues m for the writer until sctx ends; a pump uses its own session context,
	// so stopping it never waits on a writer that is blocked.
	sendOn := func(sctx context.Context, m Message) bool {
		b, err := Encode(m)
		if err != nil {
			return false
		}
		q := ctl
		if m.Kind == KindFrame {
			q = out
		}
		select {
		case q <- b:
			return true
		case <-sctx.Done():
			return false
		case <-ctx.Done():
			return false
		}
	}
	send := func(m Message) bool { return sendOn(ctx, m) }
	var act *active
	stopActive := func() {
		if act != nil {
			act.stop()
			act = nil
		}
	}
	defer func() {
		stopActive()
		close(out)
		close(ctl)
		// Allow queued replies to drain at EOF, but an arbitrary io.Writer may
		// never return. Session cleanup must not depend on that writer.
		timer := time.NewTimer(pipeDrainTimeout)
		defer timer.Stop()
		select {
		case <-writerDone:
			return
		case <-ctx.Done():
		case <-timer.C:
		}
		cancel()
		if closer, ok := w.(io.Closer); ok {
			go closer.Close()
		}
		select {
		case <-writerDone:
		case <-time.After(pipeDrainTimeout):
		}
	}()

	// Reading blocks, so it runs on its own goroutine and ctx can end the loop.
	type read struct {
		m   Message
		err error
	}
	reads := make(chan read)
	go func() {
		for {
			m, err := ReadMessage(r)
			select {
			case reads <- read{m, err}:
			case <-ctx.Done():
				return
			}
			if err != nil {
				return
			}
		}
	}()
	for {
		var rd read
		select {
		case rd = <-reads:
		case <-ctx.Done():
			return ctx.Err()
		}
		if errors.Is(rd.err, io.EOF) {
			return nil
		}
		if rd.err != nil {
			return rd.err
		}
		// Clients send only requests; anything else is ignored rather than fatal.
		if rd.m.Kind != KindReq {
			continue
		}
		resp := handle(ctx, local, opt, &act, stopActive, send, sendOn, *rd.m.Req)
		send(Message{Kind: KindResp, Resp: &resp})
	}
}

func okResp(id uint64, data any) Response {
	b, err := json.Marshal(data)
	if err != nil {
		return Response{ID: id, Error: err.Error()}
	}
	return Response{ID: id, OK: true, Data: b}
}

func errResp(id uint64, format string, a ...any) Response {
	return Response{ID: id, Error: fmt.Sprintf(format, a...)}
}

func handle(ctx context.Context, local Local, opt ServeOptions, act **active, stopActive func(), send func(Message) bool, sendOn func(context.Context, Message) bool, req Request) Response {
	switch req.Op {
	case OpHello:
		if req.Version != Version {
			return errResp(req.ID, "protocol version mismatch: server speaks %d, client %d", Version, req.Version)
		}
		return okResp(req.ID, map[string]int{"version": Version})
	case OpList:
		devices, failures := local.ListParts(ctx)
		for _, f := range failures {
			send(Message{Kind: KindLog, Log: f.Name + ": " + f.Reason})
		}
		if devices == nil {
			devices = []device.Info{}
		}
		return okResp(req.ID, devices)
	case OpConnect:
		stopActive()
		sess, err := connectWithin(ctx, local, req.Device, opt.ConnectTimeout)
		if err != nil {
			return errResp(req.ID, "%v", err)
		}
		sess.SetBudget(req.W, req.H)
		pctx, cancel := context.WithCancel(ctx)
		a := &active{id: req.Device, session: sess, cancel: cancel, done: make(chan struct{})}
		go func() {
			defer close(a.done)
			pump(pctx, sess, func(m Message) bool { return sendOn(pctx, m) })
		}()
		*act = a
		return okResp(req.ID, nil)
	case OpInput:
		a := *act
		if a == nil {
			return errResp(req.ID, "no device connected")
		}
		if opt.Allow != nil && !opt.Allow(a.id) {
			return errResp(req.ID, "input to %s not allowed by SIMVIEW_INPUT_ALLOW (server)", a.id)
		}
		if req.Input == nil {
			return errResp(req.ID, "input request without input")
		}
		in, err := FromWire(*req.Input)
		if err != nil {
			return errResp(req.ID, "%v", err)
		}
		select {
		case err := <-a.session.Send(in):
			if err != nil {
				return errResp(req.ID, "%v", err)
			}
			return okResp(req.ID, nil)
		case <-time.After(opt.SendTimeout):
			return errResp(req.ID, "device did not answer the input within %s", opt.SendTimeout)
		case <-ctx.Done():
			return errResp(req.ID, "server stopping")
		}
	case OpBudget:
		if a := *act; a != nil {
			a.session.SetBudget(req.W, req.H)
		}
		return okResp(req.ID, nil)
	case OpDisconnect:
		stopActive()
		return okResp(req.ID, nil)
	}
	return errResp(req.ID, "unknown op %q", req.Op)
}

// pump streams the session's latest frames as JPEG until ctx ends.
func pump(ctx context.Context, s device.Session, send func(Message) bool) {
	var seq, wire uint64
	box := s.Frames()
	for {
		f, n, err := box.Wait(ctx, seq)
		if err != nil {
			return
		}
		seq = n
		wire++
		fm, err := EncodeFrame(f, uint32(wire))
		if err != nil {
			continue
		}
		if !send(Message{Kind: KindFrame, Frame: fm}) {
			return
		}
	}
}

type connectResult struct {
	s   device.Session
	err error
}

// connectWithin bounds local.Connect: a backend that ignores its context cannot hold the
// request loop past d; a session that arrives late is closed.
func connectWithin(ctx context.Context, local Local, id string, d time.Duration) (device.Session, error) {
	cctx, cancel := context.WithTimeout(ctx, d)
	ch := make(chan connectResult, 1)
	go func() {
		s, err := local.Connect(cctx, id)
		ch <- connectResult{s, err}
	}()
	select {
	case r := <-ch:
		cancel()
		return r.s, r.err
	case <-cctx.Done():
		go func() {
			defer cancel()
			if r := <-ch; r.err == nil && r.s != nil {
				r.s.Close()
			}
		}()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, fmt.Errorf("connecting %s took longer than %s", id, d)
	}
}
