package ipc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestRoundTripAndUnknownMethod(t *testing.T) {
	// Sockets live under /tmp so the path fits the macOS sun_path limit.
	dir, err := os.MkdirTemp("/tmp", "sc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket := filepath.Join(dir, "socket")

	server := NewServer()
	server.Handle("echo", func(_ context.Context, params json.RawMessage) (interface{}, error) {
		var in map[string]string
		if err := json.Unmarshal(params, &in); err != nil {
			return nil, err
		}
		return in, nil
	})
	if err := server.Listen(socket); err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.ServeReady() }()
	t.Cleanup(server.Close)

	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	var out map[string]string
	if err := client.Call("echo", map[string]string{"k": "v"}, &out); err != nil {
		t.Fatal(err)
	}
	if out["k"] != "v" {
		t.Fatalf("echo returned %v", out)
	}

	err = client.Call("nope", nil, nil)
	var rpcErr *RPCError
	if !errors.As(err, &rpcErr) || rpcErr.Code != ErrMethodNotFound {
		t.Fatalf("unknown method error = %v, want code %d", err, ErrMethodNotFound)
	}
}

func TestHandlerContextCancelsWhenClientDisconnects(t *testing.T) {
	dir, err := os.MkdirTemp("/tmp", "sc-")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { os.RemoveAll(dir) })
	socket := filepath.Join(dir, "socket")

	server := NewServer()
	started := make(chan struct{})
	finished := make(chan struct{})
	server.Handle("wait", func(ctx context.Context, _ json.RawMessage) (interface{}, error) {
		close(started)
		<-ctx.Done()
		close(finished)
		return nil, nil
	})
	if err := server.Listen(socket); err != nil {
		t.Fatal(err)
	}
	go func() { _ = server.ServeReady() }()
	t.Cleanup(server.Close)

	conn, err := net.Dial("unix", socket)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := fmt.Fprintln(conn, `{"jsonrpc":"2.0","method":"wait","params":{},"id":1}`); err != nil {
		t.Fatal(err)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("handler did not start")
	}
	if err := conn.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("handler context was not cancelled after client disconnect")
	}
}
