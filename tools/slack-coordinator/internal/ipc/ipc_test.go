package ipc

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
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
