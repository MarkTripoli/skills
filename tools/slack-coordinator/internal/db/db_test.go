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
