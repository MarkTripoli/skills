package tui

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"
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

func TestRunDoesNotRenderUnchangedTickerState(t *testing.T) {
	reader, writer := io.Pipe()
	var out bytes.Buffer
	go func() {
		time.Sleep(700 * time.Millisecond)
		_, _ = io.WriteString(writer, "q\n")
		_ = writer.Close()
	}()
	if err := (&App{In: reader, Out: &out, Model: Model{Branch: "main"}, Width: func() int { return 80 }}).Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := strings.Count(out.String(), "Safety Dance"); got != 1 {
		t.Fatalf("rendered unchanged state %d times, output=%q", got, out.String())
	}
}
