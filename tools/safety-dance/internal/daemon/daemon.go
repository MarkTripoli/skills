package daemon

import (
	"fmt"
	"os"
	"strconv"

	"github.com/MarkTripoli/skills/tools/safety-dance/internal/db"
	"github.com/MarkTripoli/skills/tools/safety-dance/internal/paths"
)

// Ownership is a process lock for one SD_HOME. The lock is created before IPC
// binding and never replaced by a second daemon.
type Ownership struct {
	file *os.File
	path string
}

func AcquireOwnership(p *paths.Paths) (*Ownership, error) {
	if err := os.MkdirAll(p.Root(), 0755); err != nil {
		return nil, err
	}
	f, err := os.OpenFile(p.LockFile(), os.O_RDWR|os.O_CREATE, 0600)
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
func (o *Ownership) Close() error {
	if o == nil || o.file == nil {
		return nil
	}
	err := unlockRuntimeFile(o.file)
	if closeErr := o.file.Close(); err == nil {
		err = closeErr
	}
	if rm := os.Remove(o.path); err == nil {
		err = rm
	}
	return err
}

type Runtime struct {
	DB        *db.DB
	Paths     *paths.Paths
	Ownership *Ownership
}

func Recover(database *db.DB) ([]*db.Run, error) { return database.RecoverableRuns() }
