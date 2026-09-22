package ipc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"sync"
)

// HandlerFunc processes a JSON-RPC request and returns a result or error.
type HandlerFunc func(ctx context.Context, params json.RawMessage) (interface{}, error)

// Server listens on a Unix socket and dispatches JSON-RPC requests.
type Server struct {
	mu        sync.RWMutex
	handlers  map[string]HandlerFunc
	listener  net.Listener
	wg        sync.WaitGroup
	done      chan struct{}
	closeOnce sync.Once
}

// NewServer creates a new IPC server.
func NewServer() *Server {
	return &Server{
		handlers: make(map[string]HandlerFunc),
		done:     make(chan struct{}),
	}
}

// Handle registers a handler for a JSON-RPC method.
func (s *Server) Handle(method string, fn HandlerFunc) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.handlers[method] = fn
}

// Listen binds the socket without starting the accept loop, so the daemon can
// finish setup before it starts answering.
func (s *Server) Listen(socketPath string) error {
	ln, err := listen(socketPath)
	if err != nil {
		return err
	}
	s.mu.Lock()
	if s.listener != nil {
		s.mu.Unlock()
		_ = ln.Close()
		return errors.New("IPC server already listening")
	}
	s.listener = ln
	s.mu.Unlock()

	go func() {
		<-s.done
		_ = ln.Close()
	}()
	return nil
}

// ServeReady accepts requests from a socket already bound by Listen. It blocks
// until Close is called, then returns nil.
func (s *Server) ServeReady() error {
	s.mu.RLock()
	ln := s.listener
	s.mu.RUnlock()
	if ln == nil {
		return errors.New("IPC server is not listening")
	}

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.done:
				s.wg.Wait()
				return nil
			default:
				if errors.Is(err, net.ErrClosed) {
					s.Close()
					s.wg.Wait()
					return nil
				}
				slog.Error("accept connection", "error", err)
				continue
			}
		}
		s.wg.Add(1)
		go func() {
			defer s.wg.Done()
			s.handleConn(conn)
		}()
	}
}

// Close shuts the server down; ServeReady returns once open connections finish.
func (s *Server) Close() {
	s.closeOnce.Do(func() {
		close(s.done)
	})
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 0, 1024*1024), 1024*1024)
	encoder := json.NewEncoder(conn)

	// Bind the OS-authenticated peer identity to every request on this
	// connection; it is never accepted from request parameters.
	ctx := withPeerPID(context.Background(), authenticatedPeerPID(conn))
	ctx, cancel := context.WithCancel(ctx)
	go func() {
		select {
		case <-s.done:
			cancel()
		case <-ctx.Done():
		}
	}()
	defer cancel()

	lines := make(chan []byte)
	go func() {
		defer close(lines)
		for scanner.Scan() {
			line := append([]byte(nil), scanner.Bytes()...)
			select {
			case lines <- line:
			case <-ctx.Done():
				return
			}
		}
		cancel()
	}()

	for {
		select {
		case <-ctx.Done():
			return
		case line, ok := <-lines:
			if !ok {
				return
			}
			if len(line) == 0 {
				continue
			}

			var req Request
			if err := json.Unmarshal(line, &req); err != nil {
				slog.Warn("ipc request failed", "method", "<parse>", "error", "invalid json")
				_ = encoder.Encode(NewErrorResponse(0, ErrParseError, "invalid json"))
				continue
			}

			resp := s.dispatch(ctx, req)
			if err := encoder.Encode(resp); err != nil {
				slog.Error("write response", "error", err)
				return
			}
		}
	}
}

func (s *Server) dispatch(ctx context.Context, req Request) *Response {
	s.mu.RLock()
	handler, ok := s.handlers[req.Method]
	s.mu.RUnlock()

	if !ok {
		err := "method not found: " + req.Method
		slog.Warn("ipc request failed", "method", req.Method, "error", err)
		return NewErrorResponse(req.ID, ErrMethodNotFound, err)
	}

	result, err := handler(ctx, req.Params)
	if err != nil {
		slog.Warn("ipc request failed", "method", req.Method, "error", err)
		code := ErrInternal
		var rpcErr *RPCError
		if errors.As(err, &rpcErr) {
			code = rpcErr.Code
		}
		return NewErrorResponse(req.ID, code, err.Error())
	}

	resp, err := NewResponse(req.ID, result)
	if err != nil {
		slog.Warn("ipc request failed", "method", req.Method, "error", err)
		return NewErrorResponse(req.ID, ErrInternal, "failed to marshal result")
	}
	if readOnlyMethod(req.Method) {
		slog.Debug("ipc request", "method", req.Method)
	} else {
		slog.Info("ipc request", "method", req.Method)
	}
	return resp
}

// readOnlyMethod names the RPCs that only inspect daemon state, so health
// polls and gate checks do not amplify the daemon log.
func readOnlyMethod(method string) bool {
	switch method {
	case MethodDaemonHealth, MethodRunCheck:
		return true
	default:
		return false
	}
}
