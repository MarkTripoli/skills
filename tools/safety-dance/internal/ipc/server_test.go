package ipc

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// macOS requires a short socket path rather than the full t.TempDir path.
func serveForTest(t *testing.T, s *Server) *Client {
	t.Helper()
	socket := filepath.Join("/tmp", "sd-drain-"+filepath.Base(t.TempDir())+".sock")
	t.Cleanup(func() { _ = os.Remove(socket) })
	if err := s.Listen(socket); err != nil {
		t.Fatal(err)
	}
	go func() { _ = s.ServeReady() }()
	t.Cleanup(s.Close)
	client, err := Dial(socket)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = client.Close() })
	return client
}

func TestDrainWaitsForTheReplyOfARequestThatStoppedTheServer(t *testing.T) {
	s := NewServer()
	stop := make(chan struct{}, 1)
	release := make(chan struct{})
	s.Handle(MethodShutdown, func(context.Context, json.RawMessage) (interface{}, error) {
		stop <- struct{}{}
		<-release
		return ShutdownResult{OK: true}, nil
	})
	client := serveForTest(t, s)
	replied := make(chan error, 1)
	go func() {
		var out ShutdownResult
		err := client.CallWithTimeout(MethodShutdown, ShutdownParams{}, &out, time.Second)
		if err == nil && !out.OK {
			err = errors.New("reply OK = false")
		}
		replied <- err
	}()
	<-stop
	drained := make(chan error, 1)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	go func() { drained <- s.Drain(ctx) }()
	select {
	case err := <-drained:
		close(release)
		t.Fatalf("Drain returned %v before the shutdown reply was written", err)
	case <-time.After(50 * time.Millisecond):
	}
	close(release)
	if err := <-replied; err != nil {
		t.Fatalf("shutdown call: %v", err)
	}
	if err := <-drained; err != nil {
		t.Fatalf("Drain: %v", err)
	}
}

func TestDrainStopsWaitingWhenTheContextEnds(t *testing.T) {
	s := NewServer()
	started := make(chan struct{})
	release := make(chan struct{})
	s.Handle(MethodHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		close(started)
		<-release
		return HealthResult{Status: "ok"}, nil
	})
	client := serveForTest(t, s)
	replied := make(chan error, 1)
	go func() { replied <- client.CallWithTimeout(MethodHealth, HealthParams{}, nil, time.Second) }()
	<-started
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	err := s.Drain(ctx)
	close(release)
	<-replied
	if !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("Drain with a stuck handler = %v; want context.DeadlineExceeded", err)
	}
}

func TestDrainRefusesRequestsThatArriveAfterIt(t *testing.T) {
	s := NewServer()
	s.Handle(MethodHealth, func(context.Context, json.RawMessage) (interface{}, error) {
		return HealthResult{Status: "ok"}, nil
	})
	client := serveForTest(t, s)
	if err := client.CallWithTimeout(MethodHealth, HealthParams{}, nil, time.Second); err != nil {
		t.Fatalf("health before Drain: %v", err)
	}
	if err := s.Drain(context.Background()); err != nil {
		t.Fatalf("Drain: %v", err)
	}
	if err := client.CallWithTimeout(MethodHealth, HealthParams{}, nil, time.Second); err == nil {
		t.Fatal("health after Drain succeeded; want the connection closed")
	}
}
