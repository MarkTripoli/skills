package db

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"testing"
	"time"
)

func TestConcurrentOpenMigratesWithoutBusyErrors(t *testing.T) {
	for round := range 5 {
		path := filepath.Join(t.TempDir(), "state.sqlite")
		const openers = 8
		results := make(chan error, openers)
		start := make(chan struct{})
		for i := range openers {
			go func() {
				<-start
				d, err := Open(path)
				if err == nil {
					_, err = d.InsertRepo(fmt.Sprintf("/checkout/%d", i), "https://github.com/example/repo", "main")
					closeErr := d.Close()
					if err == nil {
						err = closeErr
					}
				}
				results <- err
			}()
		}
		close(start)
		var firstErr error
		for range openers {
			if err := <-results; err != nil {
				if firstErr == nil {
					firstErr = err
				}
			}
		}
		if firstErr != nil {
			t.Fatalf("round %d: concurrent open/write: %v", round, firstErr)
		}
		d, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		repos, err := d.GetRepos()
		_ = d.Close()
		if err != nil || len(repos) != openers {
			t.Fatalf("round %d: durable repos = %d, error = %v; want %d", round, len(repos), err, openers)
		}
	}
}

// A second read-then-write transaction must queue at Begin, not acquire a
// stale read snapshot that cannot be upgraded after the first writer commits.
func TestWriteTransactionsSerializeBeforeReading(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.sqlite")
	first, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	second, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer second.Close()
	if _, err := first.sql.Exec("CREATE TABLE lock_counter (value INTEGER NOT NULL); INSERT INTO lock_counter VALUES (0)"); err != nil {
		t.Fatal(err)
	}
	tx, err := first.sql.Begin()
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	var value int
	if err := tx.QueryRow("SELECT value FROM lock_counter").Scan(&value); err != nil {
		t.Fatal(err)
	}
	type beginResult struct {
		tx  *sql.Tx
		err error
	}
	started := make(chan struct{})
	begun := make(chan beginResult, 1)
	go func() {
		close(started)
		next, err := second.sql.Begin()
		begun <- beginResult{next, err}
	}()
	<-started
	select {
	case result := <-begun:
		if result.tx != nil {
			_ = result.tx.Rollback()
		}
		t.Fatalf("second transaction began before first committed: %v", result.err)
	case <-time.After(50 * time.Millisecond):
	}
	if _, err := tx.Exec("UPDATE lock_counter SET value = ?", value+1); err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	result := <-begun
	if result.err != nil {
		t.Fatal(result.err)
	}
	defer result.tx.Rollback()
	if err := result.tx.QueryRow("SELECT value FROM lock_counter").Scan(&value); err != nil {
		t.Fatal(err)
	}
	if value != 1 {
		t.Fatalf("second transaction read %d, want committed value 1", value)
	}
	if _, err := result.tx.Exec("UPDATE lock_counter SET value = ?", value+1); err != nil {
		t.Fatal(err)
	}
	if err := result.tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := first.sql.QueryRow("SELECT value FROM lock_counter").Scan(&value); err != nil || value != 2 {
		t.Fatalf("durable counter = %d, error = %v; want 2", value, err)
	}
}
