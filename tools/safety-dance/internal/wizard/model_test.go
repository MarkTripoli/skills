package wizard

import (
	"context"
	"errors"
	"io"
	"strings"
	"testing"
)

func TestModelDefaultsAreExplicit(t *testing.T) {
	m := Model{}
	if m.Upstream != "" || m.Gate != "" || m.ConfirmService {
		t.Fatal("unexpected wizard defaults")
	}
}

func TestSetupDoesNotWriteWhenCancelled(t *testing.T) {
	called := false
	setup := Setup{
		In:    strings.NewReader("upstream\n"),
		Out:   io.Discard,
		Write: func(Model) error { called = true; return nil },
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := setup.Run(ctx); err == nil {
		t.Fatal("expected cancellation")
	}
	if called {
		t.Fatal("cancelled setup wrote configuration")
	}
}

func TestSetupReturnsWriterFailure(t *testing.T) {
	setup := Setup{
		In:    strings.NewReader("upstream\ngate\nprovider\n"),
		Out:   io.Discard,
		Write: func(Model) error { return errors.New("write failed") },
	}
	if err := setup.Run(context.Background()); err == nil || err.Error() != "write failed" {
		t.Fatalf("setup error = %v", err)
	}
}

func TestSetupCompensatesWhenServiceInstallFails(t *testing.T) {
	var events []string
	setup := Setup{
		In:  strings.NewReader("upstream\ngate\nprovider\n"),
		Out: io.Discard,
		Write: func(Model) error {
			events = append(events, "write")
			return nil
		},
		InstallService: func() error {
			events = append(events, "install")
			return errors.New("service failed")
		},
		StopService: func() error {
			events = append(events, "stop")
			return nil
		},
		Compensate: func(Model) error {
			events = append(events, "compensate")
			return nil
		},
	}
	if err := setup.Run(context.Background()); err == nil {
		t.Fatal("expected service failure")
	}
	if got, want := strings.Join(events, ","), "write,install,stop,compensate"; got != want {
		t.Fatalf("events=%q, want %q", got, want)
	}
}

func TestSetupCompensatesPartialWriterFailure(t *testing.T) {
	compensated := false
	setup := Setup{
		In:    strings.NewReader("upstream\ngate\nprovider\n"),
		Out:   io.Discard,
		Write: func(Model) error { return errors.New("gate failed") },
		Compensate: func(Model) error {
			compensated = true
			return nil
		},
	}
	if err := setup.Run(context.Background()); err == nil {
		t.Fatal("expected writer failure")
	}
	if !compensated {
		t.Fatal("partial writer failure was not compensated")
	}
}
