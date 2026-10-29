// Package web serves the token-protected browser view of the devices, meant for a Tailscale
// address. One WebSocket (/ws) carries JPEG frames, input and notes for every tile; /stream
// (MJPEG) and /api/input stay for curl.
package web

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/subtle"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/notes"
	"github.com/MarkTripoli/skills/tools/simview/internal/safety"
)

//go:embed web_page.html
var page []byte

// scriptHash is the CSP hash of the page's one inline script.
var scriptHash = inlineScriptHash(page)

func inlineScriptHash(html []byte) string {
	i := bytes.Index(html, []byte("<script>"))
	j := bytes.Index(html, []byte("</script>"))
	if i < 0 || j < i {
		return ""
	}
	sum := sha256.Sum256(html[i+len("<script>") : j])
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

// pageCSP locks the page to its own origin: only its inline script (by hash), inline styles,
// same-origin fetch and WebSocket, and blob/data images. The ws origin is spelled out because
// 'self' does not cover ws: in every browser.
func pageCSP(host string) string {
	connect := "'self'"
	// Host comes from the request; only a plain host[:port] may become a source expression.
	if safeHost(host) {
		connect += " ws://" + host + " wss://" + host
	}
	return "default-src 'none'; script-src " + scriptHash + "; style-src 'self' 'unsafe-inline'; " +
		"img-src 'self' blob: data:; connect-src " + connect + "; " +
		"base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'"
}

// safeHost reports whether host is only letters, digits and the characters of a host[:port]
// or [v6]:port, so it cannot add or end a CSP directive.
func safeHost(host string) bool {
	if host == "" || len(host) > 255 {
		return false
	}
	for _, c := range host {
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c >= '0' && c <= '9':
		case c == '.', c == '-', c == ':', c == '[', c == ']':
		default:
			return false
		}
	}
	return true
}

const (
	maxBody = 64 * 1024
	// IdleClose is how long a session with no viewers is kept before it is closed.
	IdleClose = 10 * time.Second
	keepalive = time.Second
)

// Variables so tests can shorten them.
var (
	// InputTimeout is how long a browser input may wait for connect plus ack before it fails.
	InputTimeout = 8 * time.Second
	// StreamWriteTimeout bounds each /stream frame write.
	StreamWriteTimeout = 10 * time.Second
)

const forbiddenPage = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>simview</title><body style="font:16px system-ui;background:#111;color:#ddd;padding:24px"><p>simview: missing or wrong token &mdash; copy the full URL.</p></body>`

// TokenOK compares a presented token with the expected one in constant time.
func TokenOK(given, expected string) bool {
	return given != "" && subtle.ConstantTimeCompare([]byte(given), []byte(expected)) == 1
}

// Server is the HTTP handler state.
type Server struct {
	Backend device.Backend
	Token   string
	MaxFPS  int
	Notes   *notes.Store
	Pool    *Pool[device.Session]
	Log     *log.Logger
}

// NewServer builds a server with a session pool over backend.
func NewServer(backend device.Backend, token string, maxFPS int, store *notes.Store) *Server {
	return &Server{
		Backend: backend, Token: token, MaxFPS: maxFPS, Notes: store,
		Pool: NewPool(IdleClose, func(s device.Session) { s.Close() }),
		Log:  log.New(io.Discard, "", 0),
	}
}

func (s *Server) session(id string) (*Lease[device.Session], error) {
	return s.Pool.Acquire(id, func() (device.Session, error) {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		return s.Backend.Connect(ctx, id)
	})
}

// statusWriter records the status and logs "web: <peer> <METHOD> <path> <status>" once.
type statusWriter struct {
	http.ResponseWriter
	logf   func(code int)
	logged bool
}

func (w *statusWriter) note(code int) {
	if !w.logged {
		w.logged = true
		w.logf(code)
	}
}

func (w *statusWriter) WriteHeader(code int) {
	w.note(code)
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	w.note(http.StatusOK)
	return w.ResponseWriter.Write(b)
}

func (w *statusWriter) Flush() {
	if f, ok := w.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

func (w *statusWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := w.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijack unsupported")
	}
	return h.Hijack()
}

func (w *statusWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }

func respond(w http.ResponseWriter, code int, ctype string, body []byte) {
	h := w.Header()
	h.Set("Content-Type", ctype)
	h.Set("Cache-Control", "no-store")
	h.Set("Referrer-Policy", "no-referrer")
	h.Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(code)
	_, _ = w.Write(body)
}

func respondText(w http.ResponseWriter, code int, msg string) {
	respond(w, code, "text/plain", []byte(msg))
}

// marshal encodes JSON without HTML escaping, so notes stay byte-readable.
func marshal(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func respondJSON(w http.ResponseWriter, v any) {
	b, err := marshal(v)
	if err != nil {
		respondText(w, http.StatusInternalServerError, err.Error())
		return
	}
	respond(w, http.StatusOK, "application/json", b)
}

// ServeHTTP routes a request; every path except /favicon.ico needs the token.
func (s *Server) ServeHTTP(rw http.ResponseWriter, r *http.Request) {
	peer, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		peer = "?"
	}
	w := &statusWriter{ResponseWriter: rw, logf: func(code int) {
		s.Log.Printf("web: %s %s %s %d", peer, r.Method, r.URL.Path, code)
	}}
	if r.URL.Path == "/favicon.ico" {
		respond(w, http.StatusNoContent, "image/x-icon", nil)
		return
	}
	q := r.URL.Query()
	if !TokenOK(q.Get("t"), s.Token) {
		respond(w, http.StatusForbidden, "text/html; charset=utf-8", []byte(forbiddenPage))
		return
	}
	if r.URL.Path == "/ws" {
		s.serveWS(w, r)
		return
	}
	id := q.Get("id")
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/":
		w.Header().Set("Content-Security-Policy", pageCSP(r.Host))
		respond(w, http.StatusOK, "text/html; charset=utf-8", page)
	case r.Method == http.MethodGet && r.URL.Path == "/api/devices":
		list, err := s.Backend.List(r.Context())
		if err != nil {
			respondText(w, http.StatusInternalServerError, err.Error())
			return
		}
		if list == nil {
			list = []device.Info{}
		}
		respondJSON(w, list)
	case r.Method == http.MethodGet && r.URL.Path == "/api/notes":
		respondJSON(w, s.Notes.All())
	case r.Method == http.MethodGet && r.URL.Path == "/stream" && id != "":
		s.stream(w, r, id)
	case r.Method == http.MethodPost && r.URL.Path == "/api/input" && id != "":
		s.postInput(w, r, id)
	default:
		respondText(w, http.StatusNotFound, "not found")
	}
}

func (s *Server) postInput(w http.ResponseWriter, r *http.Request, id string) {
	if !safety.InputAllowed(id) {
		respondText(w, http.StatusForbidden, safety.Refusal(id))
		return
	}
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(10 * time.Second))
	_ = rc.SetWriteDeadline(time.Now().Add(InputTimeout + 10*time.Second))
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBody))
	if err != nil {
		respondText(w, http.StatusBadRequest, err.Error())
		return
	}
	in, err := ParseInput(body)
	if err != nil {
		respondText(w, http.StatusBadRequest, err.Error())
		return
	}
	switch err := s.deliver(id, in); {
	case err == nil:
		respond(w, http.StatusNoContent, "text/plain", nil)
	case isTimeout(err):
		respondText(w, http.StatusGatewayTimeout, err.Error())
	default:
		respondText(w, http.StatusBadGateway, err.Error())
	}
}

type timeoutError struct{ msg string }

func (e *timeoutError) Error() string { return e.msg }

func isTimeout(err error) bool {
	var t *timeoutError
	return errors.As(err, &t)
}

// deliver sends one input to the device's pooled session and waits for its ack. Never
// leaves the caller hanging: an unanswered input fails with a timeout error.
func (s *Server) deliver(id string, in device.Input) error {
	timeout := &timeoutError{fmt.Sprintf("no answer from %s within %ds (device or remote hung)", id, int(InputTimeout.Seconds()))}
	timer := time.NewTimer(InputTimeout)
	defer timer.Stop()
	// The connect counts against the same budget as the ack; a connect that finishes after
	// the timeout still releases its lease.
	type leased struct {
		l   *Lease[device.Session]
		err error
	}
	got := make(chan leased, 1)
	go func() {
		l, err := s.session(id)
		got <- leased{l, err}
	}()
	var lease *Lease[device.Session]
	select {
	case r := <-got:
		if r.err != nil {
			return r.err
		}
		lease = r.l
	case <-timer.C:
		go func() {
			if r := <-got; r.err == nil {
				r.l.Release()
			}
		}()
		return timeout
	}
	defer lease.Release()
	select {
	case err := <-lease.Val.Send(in):
		return err
	case <-timer.C:
		return timeout
	}
}

// frameLoop emits the latest frame, paced to maxFPS. A still screen sends nothing new, so the
// last frame is repeated once a second as a keepalive. It returns when emit fails, ctx ends,
// or the frame source closes (device.ErrClosed).
func frameLoop(ctx context.Context, box *device.FrameBox, maxFPS int, emit func(f *device.Frame, seq uint64) error) error {
	gap := time.Second / time.Duration(max(maxFPS, 1))
	for {
		f, seq := box.Latest()
		if f != nil {
			if err := emit(f, seq); err != nil {
				return err
			}
		}
		select {
		case <-time.After(gap):
		case <-ctx.Done():
			return ctx.Err()
		}
		wctx, cancel := context.WithTimeout(ctx, keepalive)
		_, _, err := box.Wait(wctx, seq)
		cancel()
		if err != nil && !errors.Is(err, context.DeadlineExceeded) {
			return err
		}
		if ctx.Err() != nil {
			return ctx.Err()
		}
	}
}

// jpegCache encodes a frame once per sequence number.
type jpegCache struct {
	seq  uint64
	data []byte
}

func (c *jpegCache) get(f *device.Frame, seq uint64) ([]byte, error) {
	if c.data != nil && c.seq == seq {
		return c.data, nil
	}
	b, err := EncodeJPEG(f)
	if err != nil {
		return nil, fmt.Errorf("could not encode a frame: %w", err)
	}
	c.seq, c.data = seq, b
	return b, nil
}

func (s *Server) stream(w http.ResponseWriter, r *http.Request, id string) {
	lease, err := s.session(id)
	if err != nil {
		respondText(w, http.StatusBadGateway, err.Error())
		return
	}
	defer lease.Release()
	lease.Val.SetBudget(4096, MaxHeight)
	rc := http.NewResponseController(w)
	w.Header().Set("Content-Type", "multipart/x-mixed-replace; boundary=simviewframe")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	var cache jpegCache
	err = frameLoop(r.Context(), lease.Val.Frames(), s.MaxFPS, func(f *device.Frame, seq uint64) error {
		jpg, err := cache.get(f, seq)
		if err != nil {
			return err
		}
		// A viewer that stops reading must not pin the lease: each frame has a deadline.
		if err := rc.SetWriteDeadline(time.Now().Add(StreamWriteTimeout)); err != nil {
			return err
		}
		if _, err := fmt.Fprintf(w, "--simviewframe\r\nContent-Type: image/jpeg\r\nContent-Length: %d\r\n\r\n", len(jpg)); err != nil {
			return err
		}
		if _, err := w.Write(jpg); err != nil {
			return err
		}
		if _, err := io.WriteString(w, "\r\n"); err != nil {
			return err
		}
		return rc.Flush()
	})
	if errors.Is(err, device.ErrClosed) {
		// The session died; let the next viewer connect afresh.
		lease.Evict()
	}
}

// Run serves on l until ctx ends.
func (s *Server) Run(ctx context.Context, l net.Listener) error {
	srv := &http.Server{
		Handler: s, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second,
		IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 << 10,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(l) }()
	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
		sctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = srv.Shutdown(sctx)
		_ = srv.Close()
		s.Pool.CloseAll()
		return nil
	}
}

// URL builds the page link for an address, token and optional preselected device.
func URL(addr, token, dev string) string {
	u := "http://" + addr + "/?t=" + token
	if dev != "" {
		u += "&d=" + pctEncode(dev)
	}
	return u
}

func pctEncode(s string) string {
	var sb strings.Builder
	for i := 0; i < len(s); i++ {
		b := s[i]
		if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || strings.IndexByte("-_.~", b) >= 0 {
			sb.WriteByte(b)
		} else {
			fmt.Fprintf(&sb, "%%%02X", b)
		}
	}
	return sb.String()
}
