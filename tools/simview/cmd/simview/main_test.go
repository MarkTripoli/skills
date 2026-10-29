package main

import (
	"bytes"
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/MarkTripoli/skills/tools/simview/internal/device"
	"github.com/MarkTripoli/skills/tools/simview/internal/notes"
	"github.com/MarkTripoli/skills/tools/simview/internal/state"
)

type recSession struct{ got []device.Input }

func (r *recSession) Frames() *device.FrameBox { return device.NewFrameBox() }
func (r *recSession) SetBudget(int, int)       {}
func (r *recSession) Close()                   {}
func (r *recSession) Send(in device.Input) <-chan error {
	r.got = append(r.got, in)
	return device.Ack(nil)
}

func run(t *testing.T, action string, rest ...string) (*recSession, error) {
	t.Helper()
	plan, err := planInput(action, rest)
	if err != nil {
		return nil, err
	}
	s := &recSession{}
	return s, plan(context.Background(), s)
}

func TestTapIsDownThenUp(t *testing.T) {
	s, err := run(t, "tap", "0.5", "0.25")
	if err != nil || len(s.got) != 2 || s.got[0].Kind != device.Down || s.got[1].Kind != device.Up || s.got[0].Y != 0.25 {
		t.Fatalf("%v %+v", err, s.got)
	}
}

func TestSwipeEndpointsAndSteps(t *testing.T) {
	s, err := run(t, "swipe", "0.5", "0.8", "0.5", "0.2", "100")
	if err != nil {
		t.Fatal(err)
	}
	first, last := s.got[0], s.got[len(s.got)-1]
	if first.Kind != device.Down || last.Kind != device.Up || last.Y != 0.2 || len(s.got) != 10 {
		t.Fatalf("%d %+v %+v", len(s.got), first, last)
	}
	if steps, pause := swipeSteps(300); steps != 18 || pause != 16*time.Millisecond {
		t.Fatal(steps, pause)
	}
}

func TestInputArgumentErrors(t *testing.T) {
	for _, c := range [][]string{{"tap", "0.5"}, {"tap", "a", "b"}, {"swipe", "1", "2"}, {"key", "nope"}, {"zap"}, {"text"}} {
		if _, err := planInput(c[0], c[1:]); err == nil {
			t.Errorf("accepted %v", c)
		}
	}
	s, err := run(t, "key", "Esc")
	if err != nil || s.got[0].Key != device.KeyGoBack {
		t.Fatal(err, s.got)
	}
}

func TestNoteCLIRoundTrip(t *testing.T) {
	store := &notes.Store{Dir: t.TempDir()}
	var out, errb bytes.Buffer
	call := func(o noteOpts, in string, args ...string) error {
		out.Reset()
		errb.Reset()
		return runNote(store, strings.NewReader(in), &out, &errb, args, o)
	}
	if err := call(noteOpts{by: "claude", byGiven: true, fields: []string{"task=checkout"}}, "", "emulator-5790", "Testing", "checkout"); err != nil {
		t.Fatal(err)
	}
	if err := call(noteOpts{}, "", "emulator-5790"); err != nil || !strings.Contains(out.String(), "by claude at ") || !strings.Contains(out.String(), "task=checkout\nTesting checkout\n") {
		t.Fatalf("%v %q", err, out.String())
	}
	if err := call(noteOpts{add: true}, "from stdin\n", "emulator-5790", "-"); err != nil {
		t.Fatal(err)
	}
	if n, _ := store.Get("emulator-5790"); n.Text != "Testing checkout\nfrom stdin" {
		t.Fatalf("%q", n.Text)
	}
	if err := call(noteOpts{list: true}, ""); err != nil || out.String() != "emulator-5790\tclaude\tTesting checkout\n" {
		t.Fatalf("%v %q", err, out.String())
	}
	if err := call(noteOpts{clear: true}, "", "emulator-5790", "x"); err == nil {
		t.Fatal("--clear with TEXT accepted")
	}
	if err := call(noteOpts{clear: true}, "", "emulator-5790"); err != nil {
		t.Fatal(err)
	}
	if err := call(noteOpts{}, "", "emulator-5790"); err != nil || !strings.Contains(errb.String(), "no note for emulator-5790") {
		t.Fatalf("%v %q", err, errb.String())
	}
	if err := call(noteOpts{}, ""); err == nil {
		t.Fatal("id required")
	}
	if err := call(noteOpts{fields: []string{"bad"}}, "", "x", "t"); err == nil {
		t.Fatal("bad field accepted")
	}
}

func TestExitErrorUnwraps(t *testing.T) {
	base := errors.New("x")
	if !errors.Is(&exitError{3, base}, base) {
		t.Fatal("unwrap")
	}
}

func TestCheckRotateRefusesWhileServerAlive(t *testing.T) {
	saved := state.Web{Addr: "127.0.0.1:8800", Token: "t"}
	alive := func(state.Web) bool { return true }
	dead := func(state.Web) bool { return false }
	if err := checkRotate(true, saved, alive); err == nil || !strings.Contains(err.Error(), "stop it first") {
		t.Fatalf("rotation allowed while alive: %v", err)
	}
	if err := checkRotate(true, saved, dead); err != nil {
		t.Fatal(err)
	}
	if err := checkRotate(false, saved, alive); err != nil {
		t.Fatal(err)
	}
}
