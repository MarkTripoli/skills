package remote

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/config"
	"github.com/MarkTripoli/skills/tools/simview/internal/device"
)

// Backoff is the wait before restarting the list child after consecutive failures:
// 1, 2, then 5 s.
func Backoff(failures int) time.Duration {
	steps := []time.Duration{time.Second, 2 * time.Second, 5 * time.Second}
	return steps[min(max(failures, 1), len(steps))-1]
}

// Backend is a remote host reached by running a command that speaks the protocol. It
// implements backends.Named.
type Backend struct {
	cfg      config.Remote
	timeouts Timeouts

	mu        sync.Mutex
	list      *conn // the shared child used for List
	listOpen  chan struct{}
	failures  int
	retryAt   time.Time
	lastErr   error
	closed    bool
	closeDone chan struct{}
	conns     map[*conn]struct{} // includes children still waiting for hello
	sessions  map[*Session]struct{}
}

// New returns the backend for one configured remote.
func New(cfg config.Remote) *Backend {
	return &Backend{
		cfg: cfg, timeouts: DefaultTimeouts, sessions: map[*Session]struct{}{},
		conns: map[*conn]struct{}{}, closeDone: make(chan struct{}),
	}
}

// Name is the id prefix of this remote's devices.
func (b *Backend) Name() string { return b.cfg.Name }

// Host is the machine label: the configured label or the name.
func (b *Backend) Host() string {
	if b.cfg.Label != "" {
		return b.cfg.Label
	}
	return b.cfg.Name
}

// Close stops every child, including pending handshakes, and waits for their exit.
func (b *Backend) Close() {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		<-b.closeDone
		return
	}
	b.closed = true
	b.list = nil
	var cs []*conn
	for c := range b.conns {
		cs = append(cs, c)
	}
	var ss []*Session
	for s := range b.sessions {
		ss = append(ss, s)
	}
	b.mu.Unlock()
	// Start every child's grace period before waiting for any one child.
	for _, c := range cs {
		c.shutdown(errors.New("connection closed"))
	}
	for _, c := range cs {
		c.close()
	}
	for _, s := range ss {
		s.Close()
	}
	close(b.closeDone)
}

func (b *Backend) forget(c *conn) {
	b.mu.Lock()
	delete(b.conns, c)
	b.mu.Unlock()
}

// open registers the child before releasing the backend lock, then waits for hello
// without the lock so Close can stop a handshake even with a Background context.
func (b *Backend) open(ctx context.Context) (*conn, error) {
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		return nil, errors.New("closed")
	}
	c, err := spawn(b.cfg.Command)
	if err == nil {
		b.conns[c] = struct{}{}
	}
	b.mu.Unlock()
	if err != nil {
		return nil, err
	}
	if err := c.handshake(ctx, b.timeouts.Hello); err != nil {
		err = c.withTail(err)
		c.close()
		b.forget(c)
		return nil, err
	}
	return c, nil
}

func (b *Backend) fail(err error) {
	b.failures++
	b.retryAt = time.Now().Add(Backoff(b.failures))
	b.lastErr = err
}

// listConn is the live shared child, starting one when there is none. After a failure it
// keeps answering with the same error until the backoff has passed.
func (b *Backend) listConn(ctx context.Context) (*conn, error) {
	for {
		b.mu.Lock()
		if b.closed {
			b.mu.Unlock()
			return nil, errors.New("closed")
		}
		if opening := b.listOpen; opening != nil {
			b.mu.Unlock()
			select {
			case <-opening:
				continue
			case <-b.closeDone:
				return nil, errors.New("closed")
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		if b.list != nil {
			if b.list.alive() {
				c := b.list
				b.mu.Unlock()
				return c, nil
			}
			c := b.list
			b.list = nil
			b.fail(c.deadErr())
			b.mu.Unlock()
			c.close()
			b.forget(c)
			continue
		}
		if time.Now().Before(b.retryAt) {
			err := b.lastErr
			b.mu.Unlock()
			return nil, err
		}
		opening := make(chan struct{})
		b.listOpen = opening
		b.mu.Unlock()
		c, err := b.open(ctx)
		b.mu.Lock()
		b.listOpen = nil
		close(opening)
		if b.closed {
			b.mu.Unlock()
			if c != nil {
				c.close()
				b.forget(c)
			}
			return nil, errors.New("closed")
		}
		if err != nil {
			b.fail(err)
			b.mu.Unlock()
			return nil, err
		}
		b.failures, b.retryAt = 0, time.Time{}
		b.list = c
		b.mu.Unlock()
		return c, nil
	}
}

// List returns this remote's devices, ids prefixed "<name>/".
func (b *Backend) List(ctx context.Context) ([]device.Info, error) {
	c, err := b.listConn(ctx)
	if err != nil {
		return nil, err
	}
	data, err := c.call(ctx, Request{Op: OpList}, b.timeouts.Request)
	if err != nil {
		if ctx.Err() != nil && errors.Is(err, ctx.Err()) {
			// The caller gave up; the shared child is fine (a late reply is dropped).
			return nil, err
		}
		b.mu.Lock()
		if b.list == c {
			b.list = nil
			b.fail(err)
		}
		b.mu.Unlock()
		c.close()
		b.forget(c)
		return nil, err
	}
	var devices []device.Info
	if err := json.Unmarshal(data, &devices); err != nil {
		return nil, fmt.Errorf("bad device list: %w", err)
	}
	for i, d := range devices {
		// The remote's own backend name moves into the detail.
		devices[i].ID = b.cfg.Name + "/" + d.ID
		devices[i].Detail = joinSpace(d.Backend, d.Detail)
		devices[i].Backend = "remote"
		devices[i].Host = b.Host()
	}
	return devices, nil
}

func joinSpace(a, b string) string {
	switch {
	case a == "":
		return b
	case b == "":
		return a
	}
	return a + " " + b
}

// Connect opens id (the remote's own id, without the "<name>/" prefix). Every session gets
// its own child, hence its own SSH connection: the protocol carries one stream per
// connection, so this is what lets several devices of one remote stream at once without
// head-of-line blocking or stolen streams. The child dies with the session, or at once when
// ctx ends first.
func (b *Backend) Connect(ctx context.Context, id string) (device.Session, error) {
	b.mu.Lock()
	closed := b.closed
	b.mu.Unlock()
	if closed {
		return nil, errors.New("closed")
	}
	c, err := b.open(ctx)
	if err != nil {
		return nil, err
	}
	s := newSession(c, b)
	// Transfer ownership to a session only while the backend is still open.
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		c.close()
		b.forget(c)
		return nil, errors.New("closed")
	}
	b.sessions[s] = struct{}{}
	b.mu.Unlock()
	budgetW, budgetH := s.budget.Get()
	if _, err := c.call(ctx, Request{Op: OpConnect, Device: id, W: budgetW, H: budgetH}, b.timeouts.Request); err != nil {
		err = c.withTail(err)
		s.Close()
		return nil, err
	}
	b.mu.Lock()
	if b.closed {
		b.mu.Unlock()
		s.Close()
		return nil, errors.New("closed")
	}
	// Close cannot wait on the session until its goroutines have been started.
	s.start()
	b.mu.Unlock()
	return s, nil
}

type inputMsg struct {
	in  device.Input
	ack chan error
}

// Session is one connected remote device, with its own child process.
type Session struct {
	c       *conn
	b       *Backend
	box     *device.FrameBox
	budget  *device.Budget
	input   chan inputMsg
	ctx     context.Context
	cancel  context.CancelFunc
	wg      sync.WaitGroup
	once    sync.Once
	rawMu   sync.Mutex
	raw     *FrameMsg
	rawWake chan struct{}
}

func newSession(c *conn, b *Backend) *Session {
	ctx, cancel := context.WithCancel(context.Background())
	s := &Session{
		c: c, b: b, box: device.NewFrameBox(), budget: device.NewBudget(540, 1200),
		input: make(chan inputMsg, 1024), ctx: ctx, cancel: cancel, rawWake: make(chan struct{}, 1),
	}
	// Frames arrive on the reader goroutine, which also dispatches responses: keep only the
	// newest and decode elsewhere.
	c.setFrameHandler(func(f *FrameMsg) {
		s.rawMu.Lock()
		s.raw = f
		s.rawMu.Unlock()
		select {
		case s.rawWake <- struct{}{}:
		default:
		}
	})
	return s
}

func (s *Session) start() {
	s.wg.Add(4)
	go func() { defer s.wg.Done(); s.decodeLoop() }()
	go func() { defer s.wg.Done(); s.inputLoop() }()
	go func() { defer s.wg.Done(); s.budgetLoop() }()
	go func() { // the box ends with the connection
		defer s.wg.Done()
		select {
		case <-s.c.done:
			s.box.Close()
		case <-s.ctx.Done():
		}
	}()
}

func (s *Session) decodeLoop() {
	for {
		select {
		case <-s.rawWake:
		case <-s.ctx.Done():
			return
		}
		s.rawMu.Lock()
		m := s.raw
		s.raw = nil
		s.rawMu.Unlock()
		if m == nil {
			continue
		}
		if f, err := ToFrame(m); err == nil {
			s.box.Set(f)
		}
	}
}

func (s *Session) inputLoop() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case m := <-s.input:
			w, err := ToWire(m.in)
			if err == nil {
				_, err = s.c.call(s.ctx, Request{Op: OpInput, Input: &w}, s.b.timeouts.Input)
			}
			m.ack <- err
		}
	}
}

func (s *Session) budgetLoop() {
	for {
		select {
		case <-s.ctx.Done():
			return
		case <-s.budget.Changed():
			w, h := s.budget.Get()
			// Best effort: a lost budget only costs frame size.
			_, _ = s.c.call(s.ctx, Request{Op: OpBudget, W: w, H: h}, s.b.timeouts.Request)
		}
	}
}

// Frames is the latest-wins frame source.
func (s *Session) Frames() *device.FrameBox { return s.box }

// SetBudget tells the remote the pixel box frames should fit in.
func (s *Session) SetBudget(w, h int) { s.budget.Set(w, h) }

// Send queues input for in-order delivery; the ack takes at most the input timeout.
func (s *Session) Send(in device.Input) <-chan error {
	m := inputMsg{in: in, ack: make(chan error, 1)}
	select {
	case s.input <- m:
	default:
		m.ack <- errors.New("input queue full")
	}
	return m.ack
}

// Close stops the session's child and goroutines after allowing child cleanup.
func (s *Session) Close() {
	s.once.Do(func() {
		s.cancel()
		s.c.close()
		s.box.Close()
		s.wg.Wait()
		for { // nobody will deliver what is still queued
			select {
			case m := <-s.input:
				m.ack <- errors.New("session closed")
				continue
			default:
			}
			break
		}
		s.b.mu.Lock()
		delete(s.b.sessions, s)
		delete(s.b.conns, s.c)
		s.b.mu.Unlock()
	})
}
