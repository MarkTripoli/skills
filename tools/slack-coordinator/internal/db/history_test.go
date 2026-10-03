package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"reflect"
	"testing"
)

// This fixture represents historical data from the removed automation feature.
// Opening the coordinator must leave its schema and rows intact without using it.
const historicalAutomationSQL = `
CREATE TABLE tasks (
  task_id INTEGER PRIMARY KEY AUTOINCREMENT,
  state TEXT NOT NULL, instruction TEXT NOT NULL, trigger TEXT NOT NULL,
  schedule TEXT, debounce_seconds INTEGER, deliver_to TEXT NOT NULL,
  request_root_ts TEXT NOT NULL, created_at TEXT NOT NULL, due_at TEXT,
  last_run_started_at TEXT, last_result_at TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0, ended_at TEXT
);
CREATE TABLE task_channels (
  task_id INTEGER NOT NULL REFERENCES tasks(task_id), channel_id TEXT NOT NULL,
  PRIMARY KEY (task_id, channel_id)
);
CREATE TABLE collected_messages (
  channel_id TEXT NOT NULL, ts TEXT NOT NULL, thread_ts TEXT, user_id TEXT NOT NULL,
  text TEXT NOT NULL, permalink TEXT NOT NULL, received_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, ts)
);
CREATE TABLE assistant_runs (
  run_id TEXT PRIMARY KEY, kind TEXT NOT NULL, root_ts TEXT, task_id INTEGER,
  state TEXT NOT NULL, queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  pid INTEGER, pgid INTEGER, daemon_pid INTEGER, exit_code INTEGER,
  timed_out INTEGER NOT NULL DEFAULT 0, result_source TEXT, failure TEXT
);
CREATE TABLE task_messages (
  task_id INTEGER NOT NULL REFERENCES tasks(task_id), channel_id TEXT NOT NULL,
  ts TEXT NOT NULL, run_id TEXT REFERENCES assistant_runs(run_id),
  PRIMARY KEY (task_id, channel_id, ts),
  FOREIGN KEY (channel_id, ts) REFERENCES collected_messages(channel_id, ts)
);
CREATE TABLE dm_requests (
  root_ts TEXT PRIMARY KEY, channel_id TEXT NOT NULL, received_at TEXT NOT NULL,
  ack_ts TEXT, pending_proposal TEXT, last_message_at TEXT NOT NULL
);
CREATE TABLE dm_messages (
  root_ts TEXT NOT NULL REFERENCES dm_requests(root_ts), ts TEXT NOT NULL,
  author TEXT NOT NULL, text TEXT NOT NULL, run_id TEXT,
  PRIMARY KEY (root_ts, ts)
);
CREATE TABLE refused_users (user_id TEXT PRIMARY KEY, refused_at TEXT NOT NULL);
INSERT INTO tasks (state, instruction, trigger, deliver_to, request_root_ts, created_at, due_at)
  VALUES ('active','historical instruction','schedule','{"dm":true}','1.0','t','t');
INSERT INTO task_channels VALUES (1,'C1');
INSERT INTO collected_messages VALUES ('C1','2.0',NULL,'U1','historical message','p','t');
INSERT INTO assistant_runs (run_id, kind, root_ts, task_id, state, queued_at)
  VALUES ('historic','task','1.0',1,'queued','t');
INSERT INTO task_messages VALUES (1,'C1','2.0','historic');
INSERT INTO dm_requests VALUES ('1.0','D1','t','1.1','{"pending":true}','t');
INSERT INTO dm_messages VALUES ('1.0','1.0','owner','historical request','historic');
INSERT INTO refused_users VALUES ('U2','t');
`

func TestOpenPreservesHistoricalTablesAndDurableRunInput(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.sqlite")
	old, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := old.Exec(mainSchemaSQL + historicalAutomationSQL + `
INSERT INTO runs (run_id, owner_user_id, channel_id, thread_ts, permalink, lifecycle, started_at)
  VALUES ('r1','U1','D1','3.0','p','active','t');
INSERT INTO owner_inputs (run_id, message_ts, text, received_at)
  VALUES ('r1','3.1','durable steering','t');`); err != nil {
		t.Fatal(err)
	}
	tables := []string{"tasks", "task_channels", "collected_messages", "task_messages", "dm_requests", "dm_messages", "assistant_runs", "refused_users"}
	snapshot := func(raw *sql.DB) map[string][]any {
		t.Helper()
		result := make(map[string][]any)
		for _, table := range tables {
			var schema string
			if err := raw.QueryRow(`SELECT sql FROM sqlite_master WHERE name = ?`, table).Scan(&schema); err != nil {
				t.Fatal(err)
			}
			rows, err := raw.Query(`SELECT * FROM ` + table)
			if err != nil {
				t.Fatal(err)
			}
			columns, err := rows.Columns()
			if err != nil {
				t.Fatal(err)
			}
			result[table] = []any{schema}
			for rows.Next() {
				values := make([]any, len(columns))
				pointers := make([]any, len(columns))
				for i := range values {
					pointers[i] = &values[i]
				}
				if err := rows.Scan(pointers...); err != nil {
					t.Fatal(err)
				}
				result[table] = append(result[table], values)
			}
			if err := rows.Err(); err != nil {
				t.Fatal(err)
			}
			rows.Close()
		}
		return result
	}
	before := snapshot(old)
	if err := old.Close(); err != nil {
		t.Fatal(err)
	}
	for i := range 2 {
		d, err := Open(path)
		if err != nil {
			t.Fatal(err)
		}
		if after := snapshot(d.root); !reflect.DeepEqual(before, after) {
			t.Fatalf("historical tables changed on open %d: before=%v after=%v", i, before, after)
		}
		run, err := d.GetRun(context.Background(), "r1")
		if err != nil || run.Lifecycle != "active" || run.ChannelID != "D1" {
			t.Fatalf("durable run changed: %+v, %v", run, err)
		}
		input, found, err := d.OldestUnhandledInput(context.Background(), "r1")
		if err != nil || !found || input.Text != "durable steering" {
			t.Fatalf("durable input changed: %+v, %t, %v", input, found, err)
		}
		if err := d.Close(); err != nil {
			t.Fatal(err)
		}
	}
}
