package remote

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Timeouts are the client-side request deadlines.
type Timeouts struct {
	Hello   time.Duration // the handshake
	Request time.Duration // list and connect
	Input   time.Duration // one input ack
}

// DefaultTimeouts are what the client uses outside tests.
var DefaultTimeouts = Timeouts{Hello: 15 * time.Second, Request: 20 * time.Second, Input: 6 * time.Second}

// stderrKeep is how many trailing child stderr lines are kept for error messages.
const stderrKeep = 3

// Give a direct serve child time to close its owned device processes and sockets
// after stdin EOF. Pipe draining is separate because descendants may inherit them.
const childGrace = 2 * time.Second
const pipeDrainTimeout = 300 * time.Millisecond

type reply struct {
	data json.RawMessage
	err  error
}

// conn is one running child speaking the protocol on its stdin/stdout.
type conn struct {
	cmd      *exec.Cmd
	stdin    io.WriteCloser
	stopOnce sync.Once
	wq       chan []byte
	nextID   atomic.Uint64
	done     chan struct{} // closed when the connection stops accepting requests
	exited   chan struct{} // closed when Wait has reaped the child
	reaped   chan struct{} // closed once the child and pipe goroutines have stopped

	mu       sync.Mutex
	pending  map[uint64]chan reply
	onFrame  func(*FrameMsg)
	endError error
	stderr   []string
	closing  bool
}

// spawn starts command and begins reading its output.
func spawn(command []string) (*conn, error) {
	if len(command) == 0 {
		return nil, errors.New("empty command")
	}
	cmd := exec.Command(command[0], command[1:]...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	defer func() {
		if cmd.Process == nil {
			stdin.Close()
		}
	}()
	stdout, stdoutW, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	defer stdoutW.Close()
	stderr, stderrW, err := os.Pipe()
	if err != nil {
		stdout.Close()
		return nil, err
	}
	defer stderrW.Close()
	cmd.Stdout, cmd.Stderr = stdoutW, stderrW
	if err := cmd.Start(); err != nil {
		stdout.Close()
		stderr.Close()
		return nil, fmt.Errorf("cannot run %s: %w", command[0], err)
	}
	c := &conn{
		cmd: cmd, stdin: stdin, wq: make(chan []byte, 64), done: make(chan struct{}),
		exited: make(chan struct{}), reaped: make(chan struct{}), pending: map[uint64]chan reply{},
	}
	errDone := make(chan struct{})
	readerDone := make(chan struct{})
	writerDone := make(chan struct{})
	go func() {
		defer close(errDone)
		sc := bufio.NewScanner(stderr)
		sc.Buffer(make([]byte, 64*1024), 1<<20)
		for sc.Scan() {
			if line := strings.TrimSpace(sc.Text()); line != "" {
				c.note(line)
			}
		}
	}()
	go func() { // writer
		defer close(writerDone)
		for {
			select {
			case b := <-c.wq:
				if _, err := stdin.Write(b); err != nil {
					return
				}
			case <-c.done:
				return
			}
		}
	}()
	go func() { // Only this goroutine reads stdout; it never waits for its own reaper.
		defer close(readerDone)
		var end error
		for {
			m, err := ReadMessage(stdout)
			if err != nil {
				if errors.Is(err, io.EOF) {
					end = errors.New("connection closed")
				} else {
					end = err
				}
				break
			}
			c.dispatch(m)
		}
		// Retain diagnostics from a child that exits with an error before failing calls.
		select {
		case <-errDone:
		case <-time.After(pipeDrainTimeout):
		}
		c.shutdown(end)
	}()
	go func() { // Wait does not depend on EOF from possibly inherited output pipes.
		_ = cmd.Wait()
		close(c.exited)
		stdin.Close()
		timer := time.NewTimer(pipeDrainTimeout)
		defer timer.Stop()
		readCh, errCh := readerDone, errDone
		for readCh != nil || errCh != nil {
			select {
			case <-readCh:
				readCh = nil
			case <-errCh:
				errCh = nil
			case <-timer.C:
				stdout.Close()
				stderr.Close()
				<-readerDone
				<-errDone
				readCh, errCh = nil, nil
			}
		}
		stdout.Close()
		stderr.Close()
		c.shutdown(errors.New("connection closed"))
		<-writerDone
		close(c.reaped)
	}()
	return c, nil
}

func (c *conn) note(line string) {
	c.mu.Lock()
	c.stderr = append(c.stderr, line)
	if len(c.stderr) > stderrKeep {
		c.stderr = c.stderr[len(c.stderr)-stderrKeep:]
	}
	c.mu.Unlock()
}

// stderrTail is the child's last words, or "".
func (c *conn) stderrTail() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return strings.Join(c.stderr, " | ")
}

// withTail appends the child's stderr tail to an error message when not already in it.
func (c *conn) withTail(err error) error {
	if t := c.stderrTail(); t != "" && !strings.Contains(err.Error(), t) {
		return fmt.Errorf("%w: %s", err, t)
	}
	return err
}

// finish ends the connection once: pending calls get the reason, done closes.
func (c *conn) finish(reason error) {
	c.mu.Lock()
	select {
	case <-c.done:
		c.mu.Unlock()
		return
	default:
	}
	if c.closing {
		reason = errors.New("connection closed")
	}
	c.endError = reason
	close(c.done)
	pend := c.pending
	c.pending = map[uint64]chan reply{}
	c.onFrame = nil
	c.mu.Unlock()
	err := c.withTail(reason)
	for _, ch := range pend {
		ch <- reply{err: err}
	}
}

// shutdown has one owner for both EOF and explicit Close. Closing stdin lets a
// direct serve child run deferred cleanup; only an unresponsive child is killed.
func (c *conn) shutdown(reason error) {
	c.stopOnce.Do(func() {
		c.finish(reason)
		c.stdin.Close() // also interrupts an in-flight protocol write
		go func() {
			timer := time.NewTimer(childGrace)
			defer timer.Stop()
			select {
			case <-c.exited:
			case <-timer.C:
				_ = c.cmd.Process.Kill()
			}
		}()
	})
}

// close stops the child gracefully, then waits for reaping and pipe cleanup.
// Safe to call repeatedly or concurrently.
func (c *conn) close() {
	c.mu.Lock()
	c.closing = true
	c.mu.Unlock()
	c.shutdown(errors.New("connection closed"))
	<-c.reaped
}

func (c *conn) alive() bool {
	select {
	case <-c.done:
		return false
	default:
		return true
	}
}

// deadErr is why the connection ended.
func (c *conn) deadErr() error {
	c.mu.Lock()
	err := c.endError
	c.mu.Unlock()
	if err == nil {
		err = errors.New("connection closed")
	}
	return c.withTail(err)
}

func (c *conn) setFrameHandler(f func(*FrameMsg)) {
	c.mu.Lock()
	c.onFrame = f
	c.mu.Unlock()
}

func (c *conn) dispatch(m Message) {
	switch m.Kind {
	case KindResp:
		c.mu.Lock()
		ch := c.pending[m.Resp.ID]
		delete(c.pending, m.Resp.ID)
		c.mu.Unlock()
		if ch == nil {
			return
		}
		if m.Resp.OK {
			ch <- reply{data: m.Resp.Data}
		} else {
			ch <- reply{err: errors.New(m.Resp.Error)}
		}
	case KindFrame:
		c.mu.Lock()
		f := c.onFrame
		c.mu.Unlock()
		if f != nil {
			f(m.Frame)
		}
	case KindLog:
		c.note(m.Log)
	}
}

// call sends req and waits for its response, at most timeout.
func (c *conn) call(ctx context.Context, req Request, timeout time.Duration) (json.RawMessage, error) {
	req.ID = c.nextID.Add(1)
	b, err := Encode(Message{Kind: KindReq, Req: &req})
	if err != nil {
		return nil, err
	}
	ch := make(chan reply, 1)
	c.mu.Lock()
	if !c.alive() {
		c.mu.Unlock()
		return nil, c.deadErr()
	}
	c.pending[req.ID] = ch
	c.mu.Unlock()
	forget := func() {
		c.mu.Lock()
		delete(c.pending, req.ID)
		c.mu.Unlock()
	}
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case c.wq <- b:
	case <-timer.C:
		forget()
		return nil, c.withTail(fmt.Errorf("no answer within %s", timeout))
	case <-c.done:
		forget()
		return nil, c.deadErr()
	case <-ctx.Done():
		forget()
		return nil, ctx.Err()
	}
	select {
	case r := <-ch:
		return r.data, r.err
	case <-timer.C:
		forget()
		return nil, c.withTail(fmt.Errorf("no answer within %s", timeout))
	case <-ctx.Done():
		forget()
		return nil, ctx.Err()
	}
}

// handshake runs the hello exchange.
func (c *conn) handshake(ctx context.Context, timeout time.Duration) error {
	data, err := c.call(ctx, Request{Op: OpHello, Version: Version}, timeout)
	if err != nil {
		return err
	}
	var v struct {
		Version int `json:"version"`
	}
	if json.Unmarshal(data, &v) != nil || v.Version != Version {
		return errors.New("protocol version mismatch")
	}
	return nil
}
