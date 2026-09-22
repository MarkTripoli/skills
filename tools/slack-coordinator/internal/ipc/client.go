package ipc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"sync"
	"time"
)

// EnvConnectTimeout overrides the bounded dial timeout, for example "1s".
const EnvConnectTimeout = "SLACK_COORDINATOR_CONNECT_TIMEOUT"

const (
	defaultConnectTimeout = 250 * time.Millisecond
	defaultCallTimeout    = 30 * time.Second
)

// ConnectTimeoutError reports a daemon IPC connect attempt that exceeded the
// bounded client timeout.
type ConnectTimeoutError struct {
	SocketPath      string
	TimeoutDuration time.Duration
	Err             error
}

func (e *ConnectTimeoutError) Error() string {
	return fmt.Sprintf("daemon socket %s did not accept a connection within %s", e.SocketPath, e.TimeoutDuration)
}

func (e *ConnectTimeoutError) Unwrap() error { return e.Err }

func (e *ConnectTimeoutError) Timeout() bool { return true }

// CallTimeoutError reports an IPC method whose response did not arrive before
// the read deadline. The connection was accepted; this is a slow or stuck
// reply, not a refused dial.
type CallTimeoutError struct {
	Method          string
	TimeoutDuration time.Duration
	Err             error
}

func (e *CallTimeoutError) Error() string {
	return fmt.Sprintf("daemon %s did not reply within %s", e.Method, e.TimeoutDuration)
}

func (e *CallTimeoutError) Unwrap() error { return e.Err }

func (e *CallTimeoutError) Timeout() bool { return true }

func isReadTimeout(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, os.ErrDeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func connectTimeout() time.Duration {
	value := os.Getenv(EnvConnectTimeout)
	if value == "" {
		return defaultConnectTimeout
	}
	d, err := time.ParseDuration(value)
	if err != nil || d <= 0 {
		return defaultConnectTimeout
	}
	return d
}

// Client connects to the IPC server over a Unix socket.
type Client struct {
	conn    net.Conn
	encoder *json.Encoder
	scanner *bufio.Scanner
	mu      sync.Mutex // serializes calls on a single connection
}

// Dial connects to the IPC server at socketPath.
func Dial(socketPath string) (*Client, error) {
	timeout := connectTimeout()
	conn, err := dial(socketPath, timeout)
	if err != nil {
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			return nil, fmt.Errorf("dial ipc: %w", &ConnectTimeoutError{
				SocketPath:      socketPath,
				TimeoutDuration: timeout,
				Err:             err,
			})
		}
		return nil, fmt.Errorf("dial ipc: %w", err)
	}
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	return &Client{
		conn:    conn,
		encoder: json.NewEncoder(conn),
		scanner: scanner,
	}, nil
}

// Call sends a JSON-RPC request and waits for the response.
// The result is unmarshaled into the provided pointer.
// If the server returns a JSON-RPC error, it is returned as *RPCError.
func (c *Client) Call(method string, params interface{}, result interface{}) error {
	return c.CallWithContext(context.Background(), method, params, result, defaultCallTimeout)
}

// CallWithContext is Call with cancellation and a caller-selected read deadline.
func (c *Client) CallWithContext(ctx context.Context, method string, params interface{}, result interface{}, timeout time.Duration) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return err
	}

	req, err := NewRequest(method, params)
	if err != nil {
		return fmt.Errorf("marshal request: %w", err)
	}

	if err := c.encoder.Encode(req); err != nil {
		return fmt.Errorf("send request: %w", err)
	}

	if timeout <= 0 {
		timeout = defaultCallTimeout
	}
	c.conn.SetReadDeadline(time.Now().Add(timeout))
	interruptDone := make(chan struct{})
	stopInterrupt := context.AfterFunc(ctx, func() {
		c.conn.SetReadDeadline(time.Now())
		close(interruptDone)
	})
	defer func() {
		if !stopInterrupt() {
			<-interruptDone
		}
		c.conn.SetReadDeadline(time.Time{})
	}()

	if !c.scanner.Scan() {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := c.scanner.Err(); err != nil {
			if isReadTimeout(err) {
				return fmt.Errorf("read response: %w", &CallTimeoutError{
					Method:          method,
					TimeoutDuration: timeout,
					Err:             err,
				})
			}
			return fmt.Errorf("read response: %w", err)
		}
		return fmt.Errorf("read response: connection closed")
	}

	var resp Response
	if err := json.Unmarshal(c.scanner.Bytes(), &resp); err != nil {
		return fmt.Errorf("parse response: %w", err)
	}

	if resp.Error != nil {
		return resp.Error
	}

	if result != nil && resp.Result != nil {
		if err := json.Unmarshal(resp.Result, result); err != nil {
			return fmt.Errorf("unmarshal result: %w", err)
		}
	}

	return nil
}

// Close disconnects from the server.
func (c *Client) Close() error {
	return c.conn.Close()
}
