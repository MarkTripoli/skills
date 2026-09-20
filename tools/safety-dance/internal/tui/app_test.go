package tui

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestRespondKeyRequiresExplicitAction(t *testing.T) {
	var out bytes.Buffer
	called := false
	app := &App{
		In:  strings.NewReader("r\nq\n"),
		Out: &out,
		Respond: func(string) error {
			called = true
			return nil
		},
	}
	if err := app.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if called {
		t.Fatal("respond key submitted an implicit approval")
	}
	if !strings.Contains(out.String(), "choose an explicit action") {
		t.Fatalf("missing action prompt: %q", out.String())
	}
}
