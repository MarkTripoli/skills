package db

import (
	"context"
	"database/sql"
	"errors"
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

	want := Run{RunID: "r1", OwnerUserID: "U1", ChannelID: "C1", ThreadTS: "1.0", Permalink: "https://x/p", Lifecycle: "active", SlackMode: "enabled", StartedAt: "2026-09-21T00:00:00Z", StatusMessageTS: sql.NullString{String: "1.1", Valid: true}}
	if err := d.InsertRun(ctx, want); err != nil {
		t.Fatal(err)
	}
	got, err := d.GetRun(ctx, "r1")
	if err != nil {
		t.Fatal(err)
	}
	if got.RunID != want.RunID || got.OwnerUserID != want.OwnerUserID || got.ChannelID != want.ChannelID || got.ThreadTS != want.ThreadTS || got.Permalink != want.Permalink || got.Lifecycle != want.Lifecycle || got.SlackMode != want.SlackMode || got.StartedAt != want.StartedAt || got.StatusMessageTS != want.StatusMessageTS {
		t.Fatalf("GetRun = %+v; run identity or lifecycle fields did not round-trip", got)
	}
	if got.StatusIntervalSeconds != DefaultStatusIntervalSeconds {
		t.Fatalf("GetRun status interval = %d, want default %d", got.StatusIntervalSeconds, DefaultStatusIntervalSeconds)
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

	uncertain := base
	uncertain.RunID = "uncertain"
	if err := d.InsertRun(ctx, uncertain); err != nil {
		t.Fatal(err)
	}
	uncertainMsg := UploadOutcomeUncertainPrefix + "response lost"
	if err := d.SetDeliveryError(ctx, "uncertain", uncertainMsg); err != nil {
		t.Fatal(err)
	}
	for _, ordinary := range []string{"channel_not_found", ""} {
		if err := d.SetDeliveryError(ctx, "uncertain", ordinary); err != nil {
			t.Fatal(err)
		}
		got, err := d.GetRun(ctx, "uncertain")
		if err != nil || !got.LastDeliveryError.Valid || got.LastDeliveryError.String != uncertainMsg {
			t.Fatalf("ordinary transition %q overwrote uncertain upload: run=%+v err=%v", ordinary, got, err)
		}
	}
	if err := d.DisableSlack(ctx, "uncertain"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetDeliveryError(ctx, "uncertain", ""); err != nil {
		t.Fatal(err)
	}
	got, err = d.GetRun(ctx, "uncertain")
	if err != nil || got.LastDeliveryError.Valid {
		t.Fatalf("explicit Slack disable did not release uncertain error: run=%+v err=%v", got, err)
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

	if err := d.ResolveOwnerInput(ctx, "active", "1.1", "applied", "2026-09-21T00:05:00Z"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("resolve before claim = %v, want ErrOwnerInputNotPending", err)
	}
	if claimed, err := d.ClaimOwnerInput(ctx, "active", "1.1", "2026-09-21T00:04:00Z"); err != nil || !claimed {
		t.Fatalf("ClaimOwnerInput(1.1) = %t, %v; want claimed", claimed, err)
	}
	if claimed, err := d.ClaimOwnerInput(ctx, "active", "1.1", "2026-09-21T00:04:01Z"); err != nil || claimed {
		t.Fatalf("duplicate ClaimOwnerInput(1.1) = %t, %v; want not claimed", claimed, err)
	}
	if ts, err := d.ClaimedOwnerInput(ctx, "active"); err != nil || ts != "1.1" {
		t.Fatalf("ClaimedOwnerInput = %q, %v; want 1.1", ts, err)
	}
	if _, err := d.PendingOwnerInput(ctx, "active", "1.1"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("PendingOwnerInput after claim = %v, want ErrOwnerInputNotPending", err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "9.9", "applied", "t"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("resolve of a missing input = %v, want ErrOwnerInputNotPending", err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.1", "bogus", "t"); err == nil || errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("outcome outside the CHECK constraint = %v, want a constraint error", err)
	}
	if ts, err := d.ClaimedOwnerInput(ctx, "active"); err != nil || ts != "1.1" {
		t.Fatalf("failed resolve lost its claim: ClaimedOwnerInput = %q, %v", ts, err)
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
	got, ok, err = d.OldestUnhandledInput(ctx, "active")
	if err != nil || !ok || got.MessageTS != "1.2" {
		t.Fatalf("OldestUnhandledInput after resolving 1.1 = %+v, %t, %v; want the 1.2 row", got, ok, err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.2", "answered", "t"); !errors.Is(err, ErrOwnerInputNotPending) {
		t.Fatalf("resolve before claim = %v, want ErrOwnerInputNotPending", err)
	}
	if claimed, err := d.ClaimOwnerInput(ctx, "active", "1.2", "2026-09-21T00:06:00Z"); err != nil || !claimed {
		t.Fatalf("ClaimOwnerInput(1.2) = %t, %v; want claimed", claimed, err)
	}
	if err := d.ResolveOwnerInput(ctx, "active", "1.2", "answered", "t"); err != nil {
		t.Fatalf("resolve claimed input = %v", err)
	}
	if _, ok, _ := d.OldestUnhandledInput(ctx, "active"); ok {
		t.Fatal("input still pending after both were resolved")
	}
}

// mainSchemaSQL is an earlier coordinator schema; Open upgrades it in place.
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
);`

func TestOpenUpgradesExistingCoordinatorData(t *testing.T) {
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
		t.Fatalf("Open on an earlier database: %v", err)
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
		"runs", "owner_inputs", "terminal_notices", "jira_backlinks",
	}
	for _, name := range want {
		if !got[name] {
			t.Errorf("table %s missing after Open", name)
		}
	}
	if len(got) != len(want) {
		t.Errorf("sqlite_master lists %d tables %v, want %d", len(got), got, len(want))
	}
	legacyRun, err := d.GetRun(context.Background(), "r1")
	if err != nil {
		t.Fatalf("row written before the upgrade is unreadable: %v", err)
	}
	if legacyRun.StatusMessageTS.Valid {
		t.Fatalf("legacy run unexpectedly has a status-card timestamp: %+v", legacyRun.StatusMessageTS)
	}
}

func TestTransactRollsBackOnErrorAndRefusesNesting(t *testing.T) {
	d, err := Open(filepath.Join(t.TempDir(), "state.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer d.Close()
	ctx := context.Background()
	run := Run{RunID: "r1", OwnerUserID: "U1", ChannelID: "D1", ThreadTS: "1.0", Permalink: "p", Lifecycle: "active", SlackMode: SlackEnabled, StartedAt: "t"}
	failure := errors.New("second write failed")
	err = d.Transact(ctx, func(tx *DB) error {
		if err := tx.InsertRun(ctx, run); err != nil {
			return err
		}
		if err := tx.Transact(ctx, func(*DB) error { return nil }); err == nil {
			t.Error("nested transaction was accepted")
		}
		return failure
	})
	if !errors.Is(err, failure) {
		t.Fatalf("Transact = %v, want callback error", err)
	}
	if _, err := d.GetRun(ctx, run.RunID); !errors.Is(err, ErrRunNotFound) {
		t.Fatalf("rolled-back run visible: %v", err)
	}
	if err := d.Transact(ctx, func(tx *DB) error {
		if err := tx.InsertRun(ctx, run); err != nil {
			return err
		}
		_, err := tx.InsertOwnerInput(ctx, OwnerInput{RunID: run.RunID, MessageTS: "1.1", Text: "steer", ReceivedAt: "t"})
		return err
	}); err != nil {
		t.Fatal(err)
	}
	input, found, err := d.OldestUnhandledInput(ctx, run.RunID)
	if err != nil || !found || input.Text != "steer" {
		t.Fatalf("committed input = %+v, %t, %v", input, found, err)
	}
}
