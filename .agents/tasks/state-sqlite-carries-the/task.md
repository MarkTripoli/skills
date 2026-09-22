---
slug: state-sqlite-carries-the
title: "state.sqlite carries the eight assistant tables"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on: []
issue: 42
---
In `tools/slack-coordinator/internal/db/schema.go`, append these statements to `schemaSQL` after the existing three tables, unchanged in column names and constraints (later children depend on them verbatim). Add no `migrationStatements` entry and no index.

```sql
CREATE TABLE IF NOT EXISTS tasks (
  task_id              INTEGER PRIMARY KEY AUTOINCREMENT,
  state                TEXT NOT NULL CHECK (state IN ('active','paused','completed','cancelled')),
  instruction          TEXT NOT NULL,
  trigger              TEXT NOT NULL CHECK (trigger IN ('schedule','window_end','each_message')),
  schedule             TEXT,
  debounce_seconds     INTEGER,
  deliver_to           TEXT NOT NULL,
  request_root_ts      TEXT NOT NULL,
  created_at           TEXT NOT NULL,
  due_at               TEXT,
  last_run_started_at  TEXT,
  last_result_at       TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  ended_at             TEXT
);
CREATE TABLE IF NOT EXISTS task_channels (
  task_id    INTEGER NOT NULL REFERENCES tasks(task_id),
  channel_id TEXT NOT NULL,
  PRIMARY KEY (task_id, channel_id)
);
CREATE TABLE IF NOT EXISTS collected_messages (
  channel_id  TEXT NOT NULL, ts TEXT NOT NULL, thread_ts TEXT,
  user_id     TEXT NOT NULL, text TEXT NOT NULL, permalink TEXT NOT NULL, received_at TEXT NOT NULL,
  PRIMARY KEY (channel_id, ts)
);
CREATE TABLE IF NOT EXISTS task_messages (
  task_id    INTEGER NOT NULL REFERENCES tasks(task_id),
  channel_id TEXT NOT NULL, ts TEXT NOT NULL,
  run_id     TEXT REFERENCES assistant_runs(run_id),
  PRIMARY KEY (task_id, channel_id, ts),
  FOREIGN KEY (channel_id, ts) REFERENCES collected_messages(channel_id, ts)
);
CREATE TABLE IF NOT EXISTS dm_requests (
  root_ts TEXT PRIMARY KEY, channel_id TEXT NOT NULL, received_at TEXT NOT NULL,
  ack_ts TEXT, pending_proposal TEXT, last_message_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS dm_messages (
  root_ts TEXT NOT NULL REFERENCES dm_requests(root_ts), ts TEXT NOT NULL,
  author  TEXT NOT NULL CHECK (author IN ('owner','bot')), text TEXT NOT NULL,
  run_id  TEXT,
  PRIMARY KEY (root_ts, ts)
);
CREATE TABLE IF NOT EXISTS assistant_runs (
  run_id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('dm','task')),
  root_ts TEXT, task_id INTEGER,
  state TEXT NOT NULL CHECK (state IN ('queued','running','done','failed')),
  queued_at TEXT NOT NULL, started_at TEXT, finished_at TEXT,
  pid INTEGER, pgid INTEGER, daemon_pid INTEGER,
  exit_code INTEGER, timed_out INTEGER NOT NULL DEFAULT 0, result_source TEXT, failure TEXT
);
CREATE TABLE IF NOT EXISTS refused_users (user_id TEXT PRIMARY KEY, refused_at TEXT NOT NULL);
```

Column meanings for the doc comment above `schemaSQL`: `tasks.schedule` is JSON `{"daily":"09:00","tz":"Europe/Berlin"}` | `{"every_hours":6}` | `{"at":"<RFC3339>"}`; `tasks.deliver_to` is JSON `{"dm":true}` | `{"channel_id":"C…","thread_ts":"…"}`; `task_messages.run_id NULL` means unconsumed; `dm_messages.run_id NULL` on an owner row means a pending follow-up; timestamps are RFC 3339 UTC text like the existing tables. Since `task_messages` references `assistant_runs` and `collected_messages`, keep the statement order above so `foreign_keys(on)` accepts it.

Proof: in `internal/db/db_test.go`, open a temp database created by writing only the three old tables first (simulate a pre-existing file), run `db.Open`, and assert the eleven table names; insert-rejection tests for the five CHECK constraints. `go test ./internal/db`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `db.Open` runs against a `state.sqlite` created by the current `main` schema, it shall succeed and `SELECT name FROM sqlite_master WHERE type='table'` shall list `tasks`, `task_channels`, `collected_messages`, `task_messages`, `dm_requests`, `dm_messages`, `assistant_runs`, `refused_users` beside `runs`, `owner_inputs`, `jira_backlinks`.
- IF a row violates a `CHECK` constraint on `tasks.state`, `tasks.trigger`, `dm_messages.author`, `assistant_runs.kind`, or `assistant_runs.state`, THEN the insert shall fail.
- The existing `runs`, `owner_inputs`, and `jira_backlinks` DDL and `migrationStatements` shall be byte-identical to before.
