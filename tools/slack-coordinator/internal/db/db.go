package db

import (
	"database/sql"
	"fmt"
	"os"
	"strings"

	_ "modernc.org/sqlite"
)

// DB wraps the one SQLite database the daemon owns.
type DB struct {
	sql *sql.DB
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
