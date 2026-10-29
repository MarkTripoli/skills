package web

import (
	"errors"
	"sync"
	"time"
)

var errPoolClosed = errors.New("session pool closed")

type entry[T any] struct {
	once    sync.Once
	val     T
	err     error
	viewers int
	// mu guards set and closed against CloseAll running while a connect is in flight.
	mu     sync.Mutex
	set    bool // val/err are final
	closed bool // CloseAll removed the entry
	// gen is bumped on every acquire, so only the timer of the latest release may close the entry.
	gen uint64
}

// Pool shares one session per device id between viewers and closes it idle after the last
// viewer leaves.
type Pool[T any] struct {
	mu      sync.Mutex
	m       map[string]*entry[T]
	idle    time.Duration
	onClose func(T)
}

// NewPool returns a pool that closes unused sessions after idle; onClose (optional) is
// called with each session when it is removed.
func NewPool[T any](idle time.Duration, onClose func(T)) *Pool[T] {
	return &Pool[T]{m: map[string]*entry[T]{}, idle: idle, onClose: onClose}
}

// Lease is one viewer's hold on a pooled session.
type Lease[T any] struct {
	pool *Pool[T]
	id   string
	e    *entry[T]
	Val  T
	once sync.Once
}

// Acquire joins the session for id, connecting it when no viewer has yet. Concurrent callers
// for one id share one connect; different ids connect independently. A failed connect
// releases the viewer and is not remembered.
func (p *Pool[T]) Acquire(id string, connect func() (T, error)) (*Lease[T], error) {
	p.mu.Lock()
	e, ok := p.m[id]
	if !ok {
		e = &entry[T]{}
		p.m[id] = e
	}
	e.viewers++
	e.gen++
	p.mu.Unlock()

	e.once.Do(func() {
		v, err := connect()
		e.mu.Lock()
		e.val, e.err, e.set = v, err, true
		closed := e.closed
		e.mu.Unlock()
		if closed && err == nil && p.onClose != nil {
			// CloseAll ran while this connect was in flight: nobody will release it.
			p.onClose(v)
			e.mu.Lock()
			e.err = errPoolClosed
			e.mu.Unlock()
		}
	})
	e.mu.Lock()
	err := e.err
	e.mu.Unlock()
	if err != nil {
		p.mu.Lock()
		if p.m[id] == e {
			delete(p.m, id)
		}
		e.viewers--
		p.mu.Unlock()
		return nil, err
	}
	return &Lease[T]{pool: p, id: id, e: e, Val: e.val}, nil
}

// Release gives the lease back; it is safe to call more than once.
func (l *Lease[T]) Release() { l.once.Do(func() { l.pool.release(l.id, l.e) }) }

// Evict drops a session that died, so the next viewer connects afresh.
func (l *Lease[T]) Evict() {
	p := l.pool
	p.mu.Lock()
	removed := p.m[l.id] == l.e
	if removed {
		delete(p.m, l.id)
	}
	p.mu.Unlock()
	if removed && p.onClose != nil {
		p.onClose(l.e.val)
	}
}

func (p *Pool[T]) release(id string, e *entry[T]) {
	p.mu.Lock()
	e.viewers--
	if e.viewers > 0 || p.m[id] != e {
		p.mu.Unlock()
		return
	}
	gen := e.gen
	p.mu.Unlock()
	time.AfterFunc(p.idle, func() {
		p.mu.Lock()
		closing := p.m[id] == e && e.viewers == 0 && e.gen == gen
		if closing {
			delete(p.m, id)
		}
		p.mu.Unlock()
		if closing && p.onClose != nil {
			p.onClose(e.val)
		}
	})
}

// Len is the number of pooled sessions.
func (p *Pool[T]) Len() int {
	p.mu.Lock()
	defer p.mu.Unlock()
	return len(p.m)
}

// CloseAll removes and closes every pooled session.
func (p *Pool[T]) CloseAll() {
	p.mu.Lock()
	all := p.m
	p.m = map[string]*entry[T]{}
	p.mu.Unlock()
	for _, e := range all {
		e.mu.Lock()
		e.closed = true
		live := e.set && e.err == nil
		e.mu.Unlock()
		if live && p.onClose != nil {
			p.onClose(e.val)
		}
	}
}
