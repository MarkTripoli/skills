package daemon

import (
	"fmt"
	"os"
	"strconv"
	"syscall"

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
	f, err := os.OpenFile(p.LockFile(), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil && os.IsExist(err) {
		if data, readErr := os.ReadFile(p.LockFile()); readErr == nil {
			if pid, parseErr := strconv.Atoi(string(data)); parseErr == nil {
				if proc, procErr := os.FindProcess(pid); procErr == nil && proc.Signal(syscall.Signal(0)) != nil {
					_ = os.Remove(p.LockFile())
					f, err = os.OpenFile(p.LockFile(), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
				}
			}
		}
	}
	if err != nil {
		return nil, fmt.Errorf("daemon already owns runtime home: %w", err)
	}
	if _, err = f.WriteString(strconv.Itoa(os.Getpid())); err != nil {
		f.Close()
		os.Remove(p.LockFile())
		return nil, err
	}
	return &Ownership{file: f, path: p.LockFile()}, nil
}
func (o *Ownership) Close() error {
	if o == nil {
		return nil
	}
	err := o.file.Close()
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
