package web

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestCloseAllDuringInflightConnect(t *testing.T) {
	var closed atomic.Int32
	p := NewPool(time.Minute, func(int) { closed.Add(1) })
	started, release := make(chan struct{}), make(chan struct{})
	done := make(chan error, 1)
	go func() {
		_, err := p.Acquire("a", func() (int, error) { close(started); <-release; return 1, nil })
		done <- err
	}()
	<-started
	p.CloseAll() // races with the connect; must not read half-written state
	close(release)
	if err := <-done; err == nil {
		t.Fatal("acquire succeeded after CloseAll")
	}
	if closed.Load() != 1 {
		t.Fatalf("session closed %d times, want 1", closed.Load())
	}
}
