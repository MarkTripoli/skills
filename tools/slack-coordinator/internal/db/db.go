package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"strings"

	_ "modernc.org/sqlite"
)

// querier is the statement surface *sql.DB and *sql.Tx share.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// DB wraps the one SQLite database the daemon owns. Inside Transact, sql is
// the open transaction and every method runs within it.
type DB struct {
	sql  querier
	root *sql.DB
}

// Open opens (or creates) the SQLite database at path and runs migrations.
func Open(path string) (*DB, error) {
	sqlDB, err := sql.Open("sqlite", path+"?_pragma=journal_mode(wal)&_pragma=foreign_keys(on)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	sqlDB.SetMaxOpenConns(1)
	if _, err := sqlDB.Exec(schemaSQL); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("migrate db: %w", err)
	}
	for _, stmt := range migrationStatements {
		if _, err := sqlDB.Exec(stmt); err != nil && !isDuplicateColumnErr(err) {
			sqlDB.Close()
			return nil, fmt.Errorf("migrate db: %w", err)
		}
	}
	// SQLite creates state files lazily; tighten every state file after
	// migration so an existing world-readable database is repaired too.
	for _, statePath := range []string{path, path + "-wal", path + "-shm"} {
		if err := os.Chmod(statePath, 0o600); err != nil && !os.IsNotExist(err) {
			sqlDB.Close()
			return nil, fmt.Errorf("protect db: %w", err)
		}
	}
	return &DB{sql: sqlDB, root: sqlDB}, nil
}

// Transact runs fn inside one transaction over d and commits when fn returns
// nil; any error rolls back. The database allows one connection, so fn must
// use only tx, and nesting Transact is an error rather than a deadlock.
func (d *DB) Transact(ctx context.Context, fn func(tx *DB) error) error {
	if _, nested := d.sql.(*sql.Tx); nested {
		return errors.New("nested transaction")
	}
	sqlTx, err := d.root.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	if err := fn(&DB{sql: sqlTx, root: d.root}); err != nil {
		sqlTx.Rollback()
		return err
	}
	if err := sqlTx.Commit(); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
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
	return d.root.Close()
}
