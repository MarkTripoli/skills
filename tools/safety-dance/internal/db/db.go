package db

import (
	"context"
	"crypto/rand"
	"database/sql"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
	_ "modernc.org/sqlite"
)

var (
	entropyMu sync.Mutex
	entropy   = ulid.Monotonic(rand.Reader, 0)
)

// busyWait matches the busy_timeout pragma in the DSN.
const busyWait = 5 * time.Second

// DB wraps a SQLite database connection.
type DB struct {
	sql *sql.DB
}

// Open opens (or creates) the SQLite database at path and runs migrations.
// Immediate transactions take the write lock before reading, so competing
// writers wait on busy_timeout instead of failing during a read-to-write upgrade.
func Open(path string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", path+"?_pragma=journal_mode(wal)&_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)&_txlock=immediate")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := migrate(sqlDB); err != nil {
		sqlDB.Close()
		return nil, err
	}
	// SQLite creates state files lazily; tighten every state file after
	// migration so an existing world-readable database is repaired too.
	for _, statePath := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Chmod(statePath, 0o600); err != nil && !os.IsNotExist(err) {
			sqlDB.Close()
			return nil, fmt.Errorf("protect db: %w", err)
		}
	}
	return &DB{sql: sqlDB}, nil
}

// Switching a fresh database to WAL can report SQLITE_BUSY without consulting
// busy_timeout. Retry connection initialization within the same wait allowance.
func connect(ctx context.Context, database *sql.DB) (*sql.Conn, error) {
	deadline := time.Now().Add(busyWait)
	for {
		conn, err := database.Conn(ctx)
		if err == nil || !strings.Contains(err.Error(), "database is locked") || time.Now().After(deadline) {
			return conn, err
		}
		time.Sleep(10 * time.Millisecond)
	}
}

// Migrations share one write transaction so concurrent CLI and daemon openers
// cannot interleave schema changes or observe a partially migrated database.
func migrate(database *sql.DB) (err error) {
	ctx := context.Background()
	conn, err := connect(ctx, database)
	if err != nil {
		return fmt.Errorf("migrate db: %w", err)
	}
	defer conn.Close()
	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return fmt.Errorf("migrate db: %w", err)
	}
	defer func() {
		if err != nil {
			_, _ = conn.ExecContext(ctx, "ROLLBACK")
		}
	}()
	if _, err := conn.ExecContext(ctx, schemaSQL); err != nil {
		return fmt.Errorf("migrate db: %w", err)
	}
	for _, stmt := range migrationStatements {
		if _, err := conn.ExecContext(ctx, stmt); err != nil && !isDuplicateColumnErr(err) {
			return fmt.Errorf("migrate db: %w", err)
		}
	}
	if _, err := conn.ExecContext(ctx, "COMMIT"); err != nil {
		return fmt.Errorf("migrate db: %w", err)
	}
	return nil
}

// OpenReadOnly opens an existing database without creating or migrating it.
// It is used by pre-mutation authorization, where even schema repair would be
// an unacceptable side effect before the caller is classified.
func OpenReadOnly(path string) (*DB, error) {
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	sqlDB, err := sql.Open("sqlite", "file:"+path+"?mode=ro&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open db read-only: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("open db read-only: %w", err)
	}
	return &DB{sql: sqlDB}, nil
}

// isDuplicateColumnErr reports whether err is SQLite's "duplicate column name"
// error, which ALTER TABLE ADD COLUMN emits when the column already exists.
// Treating this as a no-op keeps migrations idempotent without a version table.
func isDuplicateColumnErr(err error) bool {
	if err == nil {
		return false
	}
	return strings.Contains(err.Error(), "duplicate column name")
}

// Close closes the database connection.
func (d *DB) Close() error {
	return d.sql.Close()
}

// newID generates a new ULID with monotonic ordering.
func newID() string {
	entropyMu.Lock()
	defer entropyMu.Unlock()
	return ulid.MustNew(ulid.Timestamp(time.Now()), entropy).String()
}

// now returns the current unix timestamp in seconds.
func now() int64 {
	return time.Now().Unix()
}
