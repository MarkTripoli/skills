package db

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestRunsRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.sqlite")
	d, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	if _, err := d.GetRun(ctx, "missing"); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("GetRun(missing) = %v, want ErrRunNotFound", err)
	}

	want := Run{RunID: "r1", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1.0", Permalink: "https://x/p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z"}
	if err := d.InsertRun(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetRun(ctx, "r1")
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("GetRun = %+v, want %+v", got, want)
	}
	if err := d.InsertRun(ctx, want); err == nil {
		t.Fatal("duplicate run_id inserted")
	}
	if err := d.InsertRun(ctx, Run{RunID: "r2", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1", Permalink: "p", Lifecycle: "bogus", SlackMode: "enabled", StartedAt: "t"}); err == nil {
		t.Fatal("lifecycle outside the CHECK constraint inserted")
	}

	for _, statePath := range []string{path, path + "-wal", path + "-shm"} {
		info, err := os.Stat(statePath)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			t.Fatal(err)
		}
		if mode := info.Mode().Perm(); mode != 0o600 {
			t.Fatalf("%s mode %o, want 600", statePath, mode)
		}
	}
}

func TestStatusLifecycle(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	base := Run{OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1.0", Permalink: "p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z"}
	insert := func(id, due, mode string) {
		r := base
		r.RunID, r.SlackMode = id, mode
		r.NextStatusDue = sql.NullString{String: due, Valid: due != ""}
		if err := d.InsertRun(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	insert("due", "2026-09-21T01:00:00Z", "enabled")
	insert("later", "2026-09-21T02:00:00Z", "enabled")
	insert("disabled", "2026-09-21T01:00:00Z", "slack_disabled")
	insert("never", "", "enabled")

	due, err := d.DueStatusRuns(ctx, "2026-09-21T01:00:00Z")
	if err != nil {
		t.Fatal(err)
	}
	if len(due) != 1 || due[0].RunID != "due" {
		t.Fatalf("DueStatusRuns = %+v, want only run due", due)
	}

	if err := d.SetStatus(ctx, "due", `{"current":"x"}`, "2026-09-21T03:00:00Z"); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetRun(ctx, "due")
	if err != nil {
		t.Fatal(err)
	}
	if got.LastStatus.String != `{"current":"x"}` || got.NextStatusDue.String != "2026-09-21T03:00:00Z" {
		t.Fatalf("after SetStatus: %+v", got)
	}
	if due, _ := d.DueStatusRuns(ctx, "2026-09-21T01:00:00Z"); len(due) != 0 {
		t.Fatalf("run still due after SetStatus: %+v", due)
	}
	if err := d.SetStatus(ctx, "missing", "{}", "t"); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("SetStatus(missing) = %v, want ErrRunNotFound", err)
	}

	if err := d.FinishRun(ctx, "later", "completed", "2026-09-21T01:30:00Z"); err != nil {
		t.Fatal(err)
	}
	got, _ = d.GetRun(ctx, "later")
	if got.Lifecycle != "completed" || got.FinishedAt.String != "2026-09-21T01:30:00Z" || got.NextStatusDue.Valid {
		t.Fatalf("after FinishRun: %+v", got)
	}
	if err := d.FinishRun(ctx, "later", "failed", "t"); !errors.Is(err, ErrRunNotActive) {
		t.Fatalf("second FinishRun = %v, want ErrRunNotActive", err)
	}
	if err := d.FinishRun(ctx, "missing", "failed", "t"); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("FinishRun(missing) = %v, want ErrRunNotFound", err)
	}
	if due, _ := d.DueStatusRuns(ctx, "2026-09-21T09:00:00Z"); len(due) != 1 || due[0].RunID != "due" {
		t.Fatalf("DueStatusRuns after finish = %+v, want only run due", due)
	}
}

func TestDeliveryErrorTracking(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	base := Run{OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1.0", Permalink: "p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z"}
	for _, id := range []string{"failing", "healthy", "disabled", "done"} {
		r := base
		r.RunID = id
		if err := d.InsertRun(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := d.sql.ExecContext(ctx, `UPDATE runs SET slack_mode = 'slack_disabled' WHERE run_id = 'disabled'`); err != nil {
		t.Fatal(err)
	}
	if err := d.FinishRun(ctx, "done", "completed", "2026-09-21T01:00:00Z"); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"failing", "disabled", "done"} {
		if err := d.SetDeliveryError(ctx, id, "channel_not_found"); err != nil {
			t.Fatal(err)
		}
	}

	failed, err := d.RunsWithDeliveryError(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(failed) != 1 || failed[0].RunID != "failing" || failed[0].LastDeliveryError.String != "channel_not_found" {
		t.Fatalf("RunsWithDeliveryError = %+v, want only the active Slack-enabled run", failed)
	}

	if err := d.SetDeliveryError(ctx, "failing", ""); err != nil {
		t.Fatal(err)
	}
	got, _ := d.GetRun(ctx, "failing")
	if got.LastDeliveryError.Valid {
		t.Fatalf("empty message did not clear the error: %+v", got)
	}
	if failed, _ := d.RunsWithDeliveryError(ctx); len(failed) != 0 {
		t.Fatalf("cleared run still listed: %+v", failed)
	}
	if err := d.SetDeliveryError(ctx, "missing", "x"); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("SetDeliveryError(missing) = %v, want ErrRunNotFound", err)
	}
}

func TestOwnerInputsPendingUntilResolved(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	base := Run{OwnerUserID: "U1", ChannelID: "C1", Permalink: "p", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z"}
	active, done := base, base
	active.RunID, active.ThreadTS, active.Lifecycle = "active", "1.0", "active"
	done.RunID, done.ThreadTS, done.Lifecycle = "done", "2.0", "completed"
	for _, r := range []Run{active, done} {
		if err := d.InsertRun(ctx, r); err != nil {
			t.Fatal(err)
		}
	}

	if r, ok, err := d.ActiveRunByThread(ctx, "C1", "1.0"); err != nil || !ok || r.RunID != "active" {
		t.Fatalf("ActiveRunByThread(C1, 1.0) = %+v, %t, %v", r, ok, err)
	}
	if _, ok, err := d.ActiveRunByThread(ctx, "C1", "2.0"); err != nil || ok {
		t.Fatalf("ActiveRunByThread found the completed run: %t, %v", ok, err)
	}
	if _, ok, _ := d.ActiveRunByThread(ctx, "C9", "1.0"); ok {
		t.Fatal("ActiveRunByThread matched a thread in another channel")
	}

	if _, ok, err := d.OldestUnhandledInput(ctx, "active"); err != nil || ok {
		t.Fatalf("OldestUnhandledInput with no rows = %t, %v", ok, err)
	}
	second := OwnerInput{RunID: "active", MessageTS: "1.2", Text: "second", ReceivedAt: "2026-09-21T00:02:00Z"}
	first := OwnerInput{RunID: "active", MessageTS: "1.1", Text: "first", ReceivedAt: "2026-09-21T00:01:00Z"}
	for _, in := range []OwnerInput{second, first} {
		if inserted, err := d.InsertOwnerInput(ctx, in); err != nil || !inserted {
			t.Fatalf("InsertOwnerInput(%s) = %t, %v", in.MessageTS, inserted, err)
		}
	}
	if inserted, err := d.InsertOwnerInput(ctx, first); err != nil || inserted {
		t.Fatalf("duplicate message_ts inserted = %t, %v; want ignored", inserted, err)
	}
	if _, err := d.InsertOwnerInput(ctx, OwnerInput{RunID: "missing", MessageTS: "1.1", Text: "x", ReceivedAt: "t"}); err == nil {
		t.Fatal("owner input for an unknown run inserted; want the foreign key to refuse it")
	}

	got, ok, err := d.OldestUnhandledInput(ctx, "active")
	if err != nil || !ok || got.MessageTS != "1.1" || got.Text != "first" || got.HandledAt.Valid {
		t.Fatalf("OldestUnhandledInput = %+v, %t, %v; want the 1.1 row", got, ok, err)
	}
	if in, err := d.PendingOwnerInput(ctx, "active", "1.2"); err != nil || in.Text != "second" {
		t.Fatalf("PendingOwnerInput(1.2) = %+v, %v", in, err)
	}

	if err := d.ResolveOwnerInput(ctx, "active", "1.1", "applied", "2026-09-21T00:05:00Z"); err != nil {
		t.Fatal(err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.1", "rejected", "t"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("second resolve = %v, want ErrOwnerInputNotPending", err)
	}
	if _, err := d.PendingOwnerInput(ctx, "active", "1.1"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("PendingOwnerInput after resolve = %v, want ErrOwnerInputNotPending", err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "9.9", "applied", "t"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("resolve of a missing input = %v, want ErrOwnerInputNotPending", err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.2", "bogus", "t"); err == nil || errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("outcome outside the CHECK constraint = %v, want a constraint error", err)
	}
	got, ok, err = d.OldestUnhandledInput(ctx, "active")
	if err != nil || !ok || got.MessageTS != "1.2" {
		t.Fatalf("OldestUnhandledInput after resolving 1.1 = %+v, %t, %v; want the 1.2 row", got, ok, err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.2", "answered", "t"); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := d.OldestUnhandledInput(ctx, "active"); ok {
		t.Fatal("input still pending after both were resolved")
	}
}

// mainSchemaSQL is the three-table schema a state.sqlite created before the
// assistant tables existed carries; Open must upgrade such a file in place.
const mainSchemaSQL = `
CREATE TABLE runs (
  run_id        TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  thread_ts     TEXT NOT NULL,
  permalink     TEXT NOT NULL,
  lifecycle     TEXT NOT NULL CHECK (lifecycle IN ('active','completed','failed','cancelled')),
  slack_mode    TEXT NOT NULL CHECK (slack_mode IN ('enabled','slack_disabled')) DEFAULT 'enabled',
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  next_status_due TEXT,
  last_status TEXT,
  last_delivery_error TEXT
);
CREATE TABLE owner_inputs (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  message_ts  TEXT NOT NULL,
  text        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at  TEXT,
  outcome     TEXT CHECK (outcome IN ('applied','rejected','answered')),
  PRIMARY KEY (run_id, message_ts)
);
CREATE TABLE jira_backlinks (
  run_id     TEXT PRIMARY KEY REFERENCES runs(run_id),
  issue_key  TEXT NOT NULL,
  thread_url TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('pending','delivered')) DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL
);`

func TestOpenAddsAssistantTablesToExistingDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.sqlite")
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(mainSchemaSQL); err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(`INSERT INTO runs (run_id, owner_user_id, channel_id, thread_ts, permalink, lifecycle, started_at) VALUES ('r1','U1','C1','1.0','p','active','t')`); err != nil {
		t.Fatal(err)
	}
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}

	d, err := Open(path)
	if err != nil {
		t.Fatalf("Open on a pre-assistant database: %v", err)
	}
	defer d.Close()

	rows, err := d.root.Query(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	got := map[string]bool{}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		got[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	want := []string{
		"runs", "owner_inputs", "jira_backlinks",
		"tasks", "task_channels", "collected_messages", "task_messages",
		"dm_requests", "dm_messages", "assistant_runs", "refused_users",
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("table %s missing after Open", name)
		}
	}
	if len(got) != len(want) {
		t.Errorf("sqlite_master lists %d tables %v, want %d", len(got), got, len(want))
	}
	if _, err := d.GetRun(context.Background(), "r1"); err != nil {
		t.Fatalf("row written before the upgrade is unreadable: %v", err)
	}
}

func TestAssistantCheckConstraintsRejectUnknownValues(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	if _, err := d.root.Exec(`INSERT INTO dm_requests (root_ts, channel_id, received_at, last_message_at) VALUES ('1.0','D1','t','t')`); err != nil {
		t.Fatal(err)
	}

	// Each insert binds the constrained column to ?1; a second ?1 in a primary
	// key column keeps the valid and invalid rows from colliding on the key.
	cases := []struct {
		column string
		insert string
		valid  string
	}{
		{"tasks.state", `INSERT INTO tasks (state, instruction, trigger, deliver_to, request_root_ts, created_at) VALUES (?1,'i','schedule','{"dm":true}','1.0','t')`, "paused"},
		{"tasks.trigger", `INSERT INTO tasks (state, instruction, trigger, deliver_to, request_root_ts, created_at) VALUES ('active','i',?1,'{"dm":true}','1.0','t')`, "window_end"},
		{"dm_messages.author", `INSERT INTO dm_messages (root_ts, ts, author, text) VALUES ('1.0',?1,?1,'hi')`, "owner"},
		{"assistant_runs.kind", `INSERT INTO assistant_runs (run_id, kind, state, queued_at) VALUES (?1,?1,'queued','t')`, "dm"},
		{"assistant_runs.state", `INSERT INTO assistant_runs (run_id, kind, state, queued_at) VALUES (?1,'task',?1,'t')`, "running"},
	}
	for _, tc := range cases {
		for _, value := range []string{tc.valid, "bogus"} {
			_, err := d.root.Exec(tc.insert, value)
			switch {
			case value == tc.valid && err != nil:
				t.Errorf("%s = %q rejected: %v", tc.column, value, err)
			case value != tc.valid && err == nil:
				t.Errorf("%s = %q inserted; want the CHECK constraint to refuse it", tc.column, value)
			}
		}
	}
}

func TestTransactRollsBackOnErrorAndRefusesNesting(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	req := DMRequest{RootTS: "1.0", ChannelID: "D1", ReceivedAt: "t", LastMessageAt: "t"}

	failed := errors.New("second write failed")
	err = d.Transact(ctx, func(tx *DB) error {
		if _, err := tx.InsertDMRequest(ctx, req); err != nil {
			return err
		}
		if err := tx.Transact(ctx, func(*DB) error { return nil }); err == nil {
			t.Error("a nested Transact ran instead of failing")
		}
		return failed
	})
	if !errors.Is(err, failed) {
		t.Fatalf("Transact = %v, want the callback's error", err)
	}
	if _, ok, _ := d.GetDMRequest(ctx, "1.0"); ok {
		t.Fatal("the rolled-back insert is visible")
	}

	if err := d.Transact(ctx, func(tx *DB) error {
		inserted, err := tx.InsertDMRequest(ctx, req)
		if err != nil || !inserted {
			return fmt.Errorf("insert = %t, %v", inserted, err)
		}
		return tx.InsertDMMessage(ctx, DMMessage{RootTS: "1.0", TS: "1.0", Author: AuthorOwner, Text: "hi"})
	}); err != nil {
		t.Fatal(err)
	}
	msgs, err := d.ListDMMessages(ctx, "1.0")
	if err != nil || len(msgs) != 1 || msgs[0].Text != "hi" {
		t.Fatalf("committed messages = %+v, %v", msgs, err)
	}
}

func TestInsertRefusedUserKeepsTheFirstRow(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()

	if inserted, err := d.InsertRefusedUser(ctx, "U2", "2026-09-21T10:00:00Z"); err != nil || !inserted {
		t.Fatalf("first insert = %t, %v; want a new row", inserted, err)
	}
	if inserted, err := d.InsertRefusedUser(ctx, "U2", "2026-09-21T10:01:00Z"); err != nil || inserted {
		t.Fatalf("second insert = %t, %v; want it ignored", inserted, err)
	}
	var at string
	if err := d.sql.QueryRowContext(ctx, `SELECT refused_at FROM refused_users WHERE user_id = ?`, "U2").Scan(&at); err != nil {
		t.Fatal(err)
	}
	if at != "2026-09-21T10:00:00Z" {
		t.Fatalf("refused_at = %s, want the first refusal's time kept", at)
	}
}
