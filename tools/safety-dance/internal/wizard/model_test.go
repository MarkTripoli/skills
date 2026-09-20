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
