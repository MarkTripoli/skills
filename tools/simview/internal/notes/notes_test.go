package notes

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"testing"
)

func tmp(t *testing.T) *Store { return &Store{Dir: filepath.Join(t.TempDir(), "notes")} }
func sp(s string) *string     { return &s }
func set(s string) Update     { return Update{Text: sp(s)} }

func TestIDRoundTripsAndStaysInDir(t *testing.T) {
	for _, id := range []string{"emulator-5790", "mac/ABCD-1234", "../../etc/passwd", "..", ".", "a/b/../c", "cdp:9222:xyz", "naïve id %41", ""} {
		enc := EncodeID(id)
		if strings.ContainsAny(enc, "/.\\") {
			t.Fatalf("%q encodes to %q", id, enc)
		}
		if got, ok := DecodeID(enc); !ok || got != id {
			t.Fatalf("%q round trip: %q %v", id, got, ok)
		}
	}
	s := tmp(t)
	if _, err := s.Update("../../escape", set("x")); err != nil {
		t.Fatal(err)
	}
	if _, ok := s.Get("../../escape"); !ok {
		t.Fatal("not stored")
	}
	files, _ := os.ReadDir(s.Dir)
	files = slices.DeleteFunc(files, func(e os.DirEntry) bool { return e.Name() == ".lock" })
	if len(files) != 1 {
		t.Fatalf("%d files", len(files))
	}
	if _, err := os.Stat(filepath.Join(s.Dir, "../../escape.json")); err == nil {
		t.Fatal("escaped the directory")
	}
	if _, ok := DecodeID("%zz"); ok {
		t.Fatal("bad escape decoded")
	}
}

func TestWriteReadAtomicNoTempLeft(t *testing.T) {
	s := tmp(t)
	n, err := s.Update("mac/U1", Update{Text: sp("hello"), Fields: []Field{{"task", "login"}}, By: sp("claude")})
	if err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get("mac/U1")
	if got.Text != "hello" || got.By != "claude" || got.Fields["task"] != "login" || got.UpdatedAt != n.UpdatedAt {
		t.Fatalf("%+v", got)
	}
	if len(n.UpdatedAt) != 20 || !strings.HasSuffix(n.UpdatedAt, "Z") {
		t.Fatal(n.UpdatedAt)
	}
	files, _ := os.ReadDir(s.Dir)
	files = slices.DeleteFunc(files, func(e os.DirEntry) bool { return e.Name() == ".lock" })
	if len(files) != 1 || files[0].Name() != "mac%2FU1.json" {
		t.Fatalf("%v", files)
	}
	if _, ok := s.All()["mac/U1"]; !ok || len(s.All()) != 1 {
		t.Fatal("All")
	}
}

func TestStoredNoteStillReads(t *testing.T) {
	s := tmp(t)
	os.MkdirAll(s.Dir, 0o755)
	os.WriteFile(filepath.Join(s.Dir, "emulator-5790.json"), []byte(`{"text":"hi","fields":{"a":"b"},"by":"claude","updated_at":"2026-01-02T03:04:05Z"}`), 0o644)
	n, ok := s.Get("emulator-5790")
	if !ok || n.Text != "hi" || n.Fields["a"] != "b" || n.UpdatedAt != "2026-01-02T03:04:05Z" {
		t.Fatalf("%+v", n)
	}
}

func TestReplaceAddAndClear(t *testing.T) {
	s := tmp(t)
	s.Update("d", set("one"))
	s.Update("d", Update{Text: sp("two"), Add: true})
	if n, _ := s.Get("d"); n.Text != "one\ntwo" {
		t.Fatal(n.Text)
	}
	s.Update("d", set("fresh"))
	if n, _ := s.Get("d"); n.Text != "fresh" {
		t.Fatal(n.Text)
	}
	if ok, _ := s.Clear("d"); !ok {
		t.Fatal("clear")
	}
	if ok, _ := s.Clear("d"); ok {
		t.Fatal("second clear")
	}
	if _, ok := s.Get("d"); ok {
		t.Fatal("still there")
	}
}

func TestCapsApply(t *testing.T) {
	s := tmp(t)
	n, _ := s.Update("d", set(strings.Repeat("é", 5000)))
	if len(n.Text) > MaxText {
		t.Fatal(len(n.Text))
	}
	for i := 0; i < 2000; i++ {
		s.Update("d", Update{Text: sp("line " + strconv.Itoa(i)), Add: true})
	}
	txt := mustGet(t, s, "d").Text
	if len(txt) > MaxText || !strings.HasSuffix(txt, "line 1999") || strings.Contains(txt, "line 0\n") {
		t.Fatalf("tail: %d", len(txt))
	}
	var many []Field
	for i := 0; i < 21; i++ {
		many = append(many, Field{"k" + strconv.Itoa(i), "v"})
	}
	if _, err := s.Update("e", Update{Text: sp("x"), Fields: many}); err == nil || !strings.Contains(err.Error(), "at most 20") {
		t.Fatalf("%v", err)
	}
	if _, ok := s.Get("e"); ok {
		t.Fatal("rejected note stored")
	}
	if f, err := ParseField("a=b=c"); err != nil || f != (Field{"a", "b=c"}) {
		t.Fatal(f, err)
	}
	if _, err := ParseField("nokey"); err == nil {
		t.Fatal("nokey")
	}
	if _, err := ParseField("=v"); err == nil {
		t.Fatal("=v")
	}
}

func TestFieldsOnlyReplacesFieldsKeepsText(t *testing.T) {
	s := tmp(t)
	s.Update("d", Update{Text: sp("keep"), Fields: []Field{{"a", "1"}}})
	n, _ := s.Update("d", Update{Fields: []Field{{"b", "2"}}})
	if n.Text != "keep" || len(n.Fields) != 1 || n.Fields["b"] != "2" {
		t.Fatalf("%+v", n)
	}
}

func mustGet(t *testing.T, s *Store, id string) Note {
	t.Helper()
	n, ok := s.Get(id)
	if !ok {
		t.Fatal("missing", id)
	}
	return n
}

func TestConcurrentAddsLoseNothing(t *testing.T) {
	st := &Store{Dir: t.TempDir()}
	const n = 30
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			// A fresh Store per goroutine, like separate simview processes.
			s := &Store{Dir: st.Dir}
			line := fmt.Sprintf("line-%02d", i)
			if _, err := s.Update("dev", Update{Add: true, Text: &line}); err != nil {
				t.Error(err)
			}
		}(i)
	}
	wg.Wait()
	got, _ := st.Get("dev")
	for i := 0; i < n; i++ {
		if !strings.Contains(got.Text, fmt.Sprintf("line-%02d", i)) {
			t.Fatalf("lost update %d in %q", i, got.Text)
		}
	}
}
