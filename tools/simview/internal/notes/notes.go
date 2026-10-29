// Package notes stores agent notes: a short free-text note plus key/value fields per device,
// one JSON file per device under $XDG_STATE_HOME/simview/notes/. Notes are untrusted text
// written by agents; readers must render them as plain text.
package notes

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/MarkTripoli/skills/tools/simview/internal/state"
)

// Caps, in bytes unless noted.
const (
	MaxText   = 4096
	MaxFields = 20 // count
	maxKey    = 64
	maxValue  = 256
	maxBy     = 64
	maxFile   = 64 * 1024
)

// Note is the stored document shown in the browser and returned by the CLI.
type Note struct {
	Text   string            `json:"text"`
	Fields map[string]string `json:"fields"`
	By     string            `json:"by"`
	// UpdatedAt is RFC 3339, UTC.
	UpdatedAt string `json:"updated_at"`
}

// Update is what a `simview note` invocation changes.
type Update struct {
	// Text nil keeps the text (replace mode) or appends nothing (add mode).
	Text   *string
	Fields []Field
	By     *string
	Add    bool
}

// Field is one key=value pair.
type Field struct{ Key, Value string }

// Store is a notes directory.
type Store struct{ Dir string }

// OpenDefault opens $XDG_STATE_HOME/simview/notes.
func OpenDefault() (*Store, error) {
	d, err := state.Dir()
	if err != nil {
		return nil, err
	}
	return &Store{Dir: filepath.Join(d, "notes")}, nil
}

// EncodeID is a filesystem-safe, reversible file stem: ASCII letters, digits, "_" and "-"
// stay, every other byte (including "/" and ".") becomes %XX. The result never contains a
// path separator or a dot, so it cannot leave the notes directory.
func EncodeID(id string) string {
	var sb strings.Builder
	for i := 0; i < len(id); i++ {
		b := id[i]
		if b >= 'a' && b <= 'z' || b >= 'A' && b <= 'Z' || b >= '0' && b <= '9' || b == '_' || b == '-' {
			sb.WriteByte(b)
		} else {
			fmt.Fprintf(&sb, "%%%02X", b)
		}
	}
	return sb.String()
}

// DecodeID reverses EncodeID.
func DecodeID(stem string) (string, bool) {
	var out []byte
	for i := 0; i < len(stem); {
		if stem[i] == '%' {
			if i+3 > len(stem) {
				return "", false
			}
			v, err := strconv.ParseUint(stem[i+1:i+3], 16, 8)
			if err != nil {
				return "", false
			}
			out = append(out, byte(v))
			i += 3
		} else {
			out = append(out, stem[i])
			i++
		}
	}
	if !utf8.Valid(out) {
		return "", false
	}
	return string(out), true
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	end := max
	for end > 0 && !utf8.RuneStart(s[end]) {
		end--
	}
	return s[:end]
}

// keepTail keeps the newest lines that fit in max bytes (a log drops its oldest lines).
func keepTail(s string, max int) string {
	if len(s) <= max {
		return s
	}
	start := len(s) - max
	for start < len(s) && !utf8.RuneStart(s[start]) {
		start++
	}
	if nl := strings.IndexByte(s[start:], '\n'); nl >= 0 && nl+1 < len(s)-start {
		return s[start+nl+1:]
	}
	return s[start:]
}

// ParseField parses "key=value" (key trimmed and non-empty, value trimmed, both capped).
func ParseField(s string) (Field, error) {
	k, v, ok := strings.Cut(s, "=")
	if !ok {
		return Field{}, fmt.Errorf("field `%s` must be key=value", s)
	}
	k = strings.TrimSpace(k)
	if k == "" {
		return Field{}, fmt.Errorf("field `%s` has an empty key", s)
	}
	return Field{truncate(k, maxKey), truncate(strings.TrimSpace(v), maxValue)}, nil
}

func (s *Store) path(id string) string { return filepath.Join(s.Dir, EncodeID(id)+".json") }

// Get returns the note for id, if any.
func (s *Store) Get(id string) (Note, bool) { return readNote(s.path(id)) }

// All returns every note by device id. Unreadable or foreign files are skipped.
func (s *Store) All() map[string]Note {
	out := map[string]Note{}
	entries, err := os.ReadDir(s.Dir)
	if err != nil {
		return out
	}
	for _, e := range entries {
		stem, ok := strings.CutSuffix(e.Name(), ".json")
		if !ok {
			continue
		}
		id, ok := DecodeID(stem)
		if !ok {
			continue
		}
		if n, ok := readNote(filepath.Join(s.Dir, e.Name())); ok {
			out[id] = n
		}
	}
	return out
}

// lock takes an exclusive flock on <dir>/.lock, so concurrent simview processes (several
// `simview note --add` at once) do not lose each other's read-modify-write.
func (s *Store) lock() (func(), error) {
	if err := os.MkdirAll(s.Dir, 0o700); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(filepath.Join(s.Dir, ".lock"), os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, err
	}
	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX); err != nil {
		f.Close()
		return nil, err
	}
	return func() { _ = syscall.Flock(int(f.Fd()), syscall.LOCK_UN); f.Close() }, nil
}

// Clear removes the note; false when there was none.
func (s *Store) Clear(id string) (bool, error) {
	unlock, err := s.lock()
	if err != nil {
		return false, err
	}
	defer unlock()
	err = os.Remove(s.path(id))
	if errors.Is(err, fs.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

// Update applies u to the note for id and returns the stored result.
func (s *Store) Update(id string, u Update) (Note, error) {
	if id == "" {
		return Note{}, errors.New("empty device id")
	}
	if len(EncodeID(id)) > 200 {
		return Note{}, errors.New("device id too long for a note file")
	}
	unlock, err := s.lock()
	if err != nil {
		return Note{}, err
	}
	defer unlock()
	n, _ := s.Get(id)
	if n.Fields == nil {
		n.Fields = map[string]string{}
	}
	if u.Add {
		if u.Text != nil {
			if n.Text != "" {
				n.Text += "\n"
			}
			n.Text = keepTail(n.Text+*u.Text, MaxText)
		}
		for _, f := range u.Fields {
			n.Fields[f.Key] = f.Value
		}
	} else {
		switch {
		case u.Text != nil:
			n.Text = truncate(*u.Text, MaxText)
			n.Fields = map[string]string{}
			for _, f := range u.Fields {
				n.Fields[f.Key] = f.Value
			}
		case len(u.Fields) > 0:
			n.Fields = map[string]string{}
			for _, f := range u.Fields {
				n.Fields[f.Key] = f.Value
			}
		}
	}
	if len(n.Fields) > MaxFields {
		return Note{}, fmt.Errorf("a note holds at most %d fields", MaxFields)
	}
	if u.By != nil {
		n.By = truncate(strings.TrimSpace(*u.By), maxBy)
	}
	n.UpdatedAt = time.Now().UTC().Format("2006-01-02T15:04:05Z")
	return n, s.write(id, n)
}

// write uses a temp file in the same directory, then a rename: readers never see a partial note.
func (s *Store) write(id string, n Note) error {
	if err := os.MkdirAll(s.Dir, 0o755); err != nil {
		return fmt.Errorf("creating %s: %w", s.Dir, err)
	}
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(n); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(s.Dir, ".tmp-")
	if err != nil {
		return err
	}
	name := tmp.Name()
	_, werr := tmp.Write(bytes.TrimRight(buf.Bytes(), "\n"))
	cerr := tmp.Close()
	if werr != nil || cerr != nil {
		os.Remove(name)
		return errors.Join(werr, cerr)
	}
	if err := os.Chmod(name, 0o644); err != nil {
		os.Remove(name)
		return err
	}
	if err := os.Rename(name, s.path(id)); err != nil {
		os.Remove(name)
		return err
	}
	return nil
}

func readNote(p string) (Note, bool) {
	st, err := os.Stat(p)
	if err != nil || !st.Mode().IsRegular() || st.Size() > maxFile {
		return Note{}, false
	}
	b, err := os.ReadFile(p)
	if err != nil {
		return Note{}, false
	}
	var n Note
	if json.Unmarshal(b, &n) != nil {
		return Note{}, false
	}
	if n.Fields == nil {
		n.Fields = map[string]string{}
	}
	return n, true
}
