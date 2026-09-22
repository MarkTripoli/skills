// Package daemon owns the per-user process: the singleton lock, SQLite, the
// IPC socket, and the Slack client.
package daemon

import (
	"context"
	"fmt"
	"os"
	"strconv"
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
}

// DefaultStatusInterval is the quiet interval when Options leaves it unset.
const DefaultStatusInterval = time.Hour

// schedulerPeriod is how often the daemon looks for runs due a status repost.
const schedulerPeriod = 30 * time.Second

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
	coord := &coordinator.Coordinator{DB: rt.DB, Slack: rt.Slack, Now: time.Now, Quiet: quiet}
	health := func() ipc.HealthResult { return ipc.HealthResult{SocketMode: "not_started"} }
	coordinator.Register(rt.Server, coord, health, cancel)
	schedulerDone := make(chan struct{})
	go func() {
		defer close(schedulerDone)
		(&coordinator.StatusScheduler{C: coord}).Run(ctx, schedulerPeriod)
	}()
	// Stop the scheduler before the deferred database.Close runs.
	defer func() {
		cancel()
		<-schedulerDone
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
