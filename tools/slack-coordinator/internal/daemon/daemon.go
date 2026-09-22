// Package daemon owns the per-user process: the singleton lock, SQLite, the
// IPC socket, and the Slack client.
package daemon

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/config"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/coordinator"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/db"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/ipc"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/paths"
	"github.com/MarkTripoli/skills/tools/slack-coordinator/internal/slackapi"
)

// Ownership is a process lock for one runtime root. The lock is created before
// IPC binding and never replaced by a second daemon.
type Ownership struct {
	file   *os.File
	path   string
	closed bool
}

// AcquireOwnership takes the exclusive daemon.lock for p's root and records the PID in it.
func AcquireOwnership(p *paths.Paths) (*Ownership, error) {
	if err := p.EnsureDirs(); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(p.LockFile(), os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, fmt.Errorf("open daemon lock: %w", err)
	}
	if err := lockRuntimeFile(f); err != nil {
		_ = f.Close()
		return nil, fmt.Errorf("daemon already owns runtime home: %w", err)
	}
	if err := f.Truncate(0); err != nil {
		_ = unlockRuntimeFile(f)
		_ = f.Close()
		return nil, err
	}
	if _, err := f.WriteString(strconv.Itoa(os.Getpid())); err != nil {
		_ = unlockRuntimeFile(f)
		_ = f.Close()
		return nil, err
	}
	return &Ownership{file: f, path: p.LockFile()}, nil
}

// Close releases the lock. The pathname stays in place: the OS lock belongs to
// the open inode, and removing the path after unlock would let a replacement
// daemon create a second lock while this close is still unwinding.
func (o *Ownership) Close() error {
	if o == nil || o.file == nil || o.closed {
		return nil
	}
	o.closed = true
	err := unlockRuntimeFile(o.file)
	if closeErr := o.file.Close(); err == nil {
		err = closeErr
	}
	o.file = nil
	return err
}

// Runtime is everything one live daemon owns.
type Runtime struct {
	Paths  *paths.Paths
	Config *config.Config
	DB     *db.DB
	Slack  *slackapi.Client
	Server *ipc.Server
}

// Options tunes a daemon.
type Options struct {
	// StatusInterval is the quiet interval after which an active run reposts
	// its last status. Zero means DefaultStatusInterval.
	StatusInterval time.Duration
	// SchedulerPeriod is how often the daemon looks for due status reposts and
	// failed posts to retry. Zero means DefaultSchedulerPeriod.
	SchedulerPeriod time.Duration
	// SocketModeHealth replaces the Socket Mode connection: when set, the daemon
	// opens no WebSocket and reports this state to run check and daemon.health.
	// Tests inject it; production leaves it nil.
	SocketModeHealth func() string
}

// DefaultStatusInterval is the quiet interval when Options leaves it unset.
const DefaultStatusInterval = time.Hour

// DefaultSchedulerPeriod is how often the daemon ticks the status scheduler
// when Options leaves it unset.
const DefaultSchedulerPeriod = 30 * time.Second

// Serve acquires the lock, opens SQLite, registers handlers, binds the socket,
// and blocks until ctx ends or daemon.shutdown is called. It writes daemon.pid
// and removes the socket and PID file on return.
func Serve(ctx context.Context, p *paths.Paths, cfg *config.Config, opts Options) error {
	own, err := AcquireOwnership(p)
	if err != nil {
		return err
	}
	defer own.Close()

	database, err := db.Open(p.DB())
	if err != nil {
		return err
	}
	defer database.Close()

	if err := os.WriteFile(p.PIDFile(), []byte(strconv.Itoa(os.Getpid())), 0o600); err != nil {
		return fmt.Errorf("write pid file: %w", err)
	}
	defer os.Remove(p.PIDFile())

	rt := &Runtime{
		Paths:  p,
		Config: cfg,
		DB:     database,
		Slack:  slackapi.New(cfg.Slack),
		Server: ipc.NewServer(),
	}
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	quiet := opts.StatusInterval
	if quiet <= 0 {
		quiet = DefaultStatusInterval
	}
	period := opts.SchedulerPeriod
	if period <= 0 {
		period = DefaultSchedulerPeriod
	}
	socketHealth := opts.SocketModeHealth
	var socket *slackapi.SocketMode
	if socketHealth == nil {
		socket = slackapi.NewSocketMode(rt.Slack.API())
		socketHealth = socket.Health
	}
	coord := &coordinator.Coordinator{DB: rt.DB, Slack: rt.Slack, Now: time.Now, Quiet: quiet, Health: socketHealth}
	health := func() ipc.HealthResult { return ipc.HealthResult{SocketMode: socketHealth()} }
	coordinator.Register(rt.Server, coord, health, cancel)

	var background sync.WaitGroup
	background.Go(func() { (&coordinator.StatusScheduler{C: coord}).Run(ctx, period) })
	if socket != nil {
		background.Go(func() {
			if err := socket.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
				slog.Error("socket mode connection ended", "error", err)
			}
		})
		// Phase 4 only acks Slack's envelopes so they are not redelivered;
		// Phase 5 consumes them.
		background.Go(func() {
			for evt := range socket.Inbound() {
				if evt.Request != nil {
					socket.Ack(*evt.Request)
				}
			}
		})
	}
	// Stop the background loops before the deferred database.Close runs.
	defer func() {
		cancel()
		background.Wait()
	}()

	if err := rt.Server.Listen(p.Socket()); err != nil {
		return err
	}
	defer os.Remove(p.Socket())

	served := make(chan error, 1)
	go func() { served <- rt.Server.ServeReady() }()
	select {
	case <-ctx.Done():
		rt.Server.Close()
		return <-served
	case err := <-served:
		return err
	}
}
