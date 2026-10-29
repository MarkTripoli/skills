// Package state owns the $XDG_STATE_HOME/simview directory: notes and the persisted web link.
package state

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"syscall"
)

// Dir is $XDG_STATE_HOME/simview (default ~/.local/state/simview).
func Dir() (string, error) {
	if x := os.Getenv("XDG_STATE_HOME"); x != "" {
		return filepath.Join(x, "simview"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", errors.New("neither XDG_STATE_HOME nor HOME is set")
	}
	return filepath.Join(home, ".local", "state", "simview"), nil
}

// NewToken is a random 128-bit token as 22 base64url characters.
func NewToken() (string, error) {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

// Web is the persisted link of `simview web`: the token survives restarts so the link is stable.
type Web struct {
	Token string `json:"token"`
	// URL is the full link the server last bound (empty until the first bind).
	URL string `json:"url,omitempty"`
	// Addr is the host:port the server last bound.
	Addr string `json:"addr,omitempty"`
}

// WebPath is the location of web.json.
func WebPath() (string, error) {
	d, err := Dir()
	if err != nil {
		return "", err
	}
	return filepath.Join(d, "web.json"), nil
}

// LoadWeb reads web.json; a missing file yields a zero Web and no error.
func LoadWeb() (Web, error) {
	p, err := WebPath()
	if err != nil {
		return Web{}, err
	}
	b, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return Web{}, nil
	}
	if err != nil {
		return Web{}, err
	}
	var w Web
	if err := json.Unmarshal(b, &w); err != nil {
		return Web{}, fmt.Errorf("%s: %w", p, err)
	}
	return w, nil
}

// SaveWeb writes web.json with mode 0600 through a temp file and rename.
func SaveWeb(w Web) error {
	p, err := WebPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(w, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(p), ".web-*")
	if err != nil {
		return err
	}
	name := tmp.Name()
	if _, err := tmp.Write(append(b, '\n')); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		os.Remove(name)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(name)
		return err
	}
	if err := os.Rename(name, p); err != nil {
		os.Remove(name)
		return err
	}
	return nil
}

// EnsureToken serializes token creation and refuses rotation while any web instance holds it.
func EnsureToken(rotate bool) (string, error) {
	start, err := lockWeb(".web-start.lock", syscall.LOCK_EX)
	if err != nil {
		return "", err
	}
	defer start.Close()
	if rotate {
		active, err := lockWeb(".web-active.lock", syscall.LOCK_EX|syscall.LOCK_NB)
		if err != nil {
			return "", err
		}
		defer active.Close()
	}
	return ensureToken(rotate)
}

// WebLease holds the persisted token until the web instance has stopped serving it.
// Kernel locks release automatically when a process exits, including after a crash.
type WebLease struct {
	Token string
	lock  *os.File
}

func (l *WebLease) Close() error { return l.lock.Close() }

// BeginWeb atomically selects a token and registers a live instance, including --bind.
// Multiple instances share a token; rotation requires that every instance has stopped.
func BeginWeb(rotate bool) (*WebLease, error) {
	start, err := lockWeb(".web-start.lock", syscall.LOCK_EX)
	if err != nil {
		return nil, err
	}
	defer start.Close()
	mode := syscall.LOCK_SH
	if rotate {
		mode = syscall.LOCK_EX | syscall.LOCK_NB
	}
	active, err := lockWeb(".web-active.lock", mode)
	if err != nil {
		return nil, err
	}
	token, err := ensureToken(rotate)
	if err == nil && rotate {
		// The startup lock prevents another rotation during this lock conversion.
		err = flock(active, syscall.LOCK_SH)
	}
	if err != nil {
		active.Close()
		return nil, err
	}
	return &WebLease{Token: token, lock: active}, nil
}

func flock(f *os.File, mode int) error {
	for {
		err := syscall.Flock(int(f.Fd()), mode)
		if !errors.Is(err, syscall.EINTR) {
			return err
		}
	}
}

func lockWeb(name string, mode int) (*os.File, error) {
	d, err := Dir()
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(d, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(d, name), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := flock(f, mode); err != nil {
		f.Close()
		if errors.Is(err, syscall.EWOULDBLOCK) || errors.Is(err, syscall.EAGAIN) {
			return nil, errors.New("simview web is running; stop all servers before rotating the token")
		}
		return nil, err
	}
	return f, nil
}

func ensureToken(rotate bool) (string, error) {
	w, err := LoadWeb()
	if err != nil {
		return "", err
	}
	if w.Token != "" && !rotate {
		return w.Token, nil
	}
	t, err := NewToken()
	if err != nil {
		return "", err
	}
	// Addr and URL stay: the port preference and `simview url` keep working, and the URL is
	// rebuilt from Addr and the token on every start.
	w.Token = t
	if err := SaveWeb(w); err != nil {
		return "", err
	}
	return t, nil
}
