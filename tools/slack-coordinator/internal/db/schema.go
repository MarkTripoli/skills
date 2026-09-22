package db

// schemaSQL creates every table the daemon owns. Timestamps are RFC 3339 UTC
// text. Beyond the three coordinator tables, the assistant tables use:
//
//   - tasks.schedule: JSON {"daily":"09:00","tz":"Europe/Berlin"} |
//     {"every_hours":6} | {"at":"<RFC3339>"}.
//   - tasks.deliver_to: JSON {"dm":true} | {"channel_id":"C…","thread_ts":"…"}.
//   - task_messages.run_id NULL: the collected message is not yet consumed by a run.
//   - dm_messages.run_id NULL on an owner row: a pending follow-up.
//
// task_messages references assistant_runs and collected_messages, so the
// statement order below stays as written for foreign_keys(on).
const schemaSQL = `
CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  channel_id    TEXT NOT NULL,
  thread_ts     TEXT NOT NULL,
  permalink     TEXT NOT NULL,
  lifecycle     TEXT NOT NULL CHECK (lifecycle IN ('active','completed','failed','cancelled')),
  slack_mode    TEXT NOT NULL CHECK (slack_mode IN ('enabled','slack_disabled')) DEFAULT 'enabled',
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE TABLE IF NOT EXISTS owner_inputs (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  message_ts  TEXT NOT NULL,
  text        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at  TEXT,
  outcome     TEXT CHECK (outcome IN ('applied','rejected','answered')),
  PRIMARY KEY (run_id, message_ts)
);
CREATE TABLE IF NOT EXISTS jira_backlinks (
  run_id     TEXT PRIMARY KEY REFERENCES runs(run_id),
  issue_key  TEXT NOT NULL,
  thread_url TEXT NOT NULL,
  state      TEXT NOT NULL CHECK (state IN ('pending','delivered')) DEFAULT 'pending',
  attempts   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_attempt_at TEXT NOT NULL
);
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
CREATE TABLE IF NOT EXISTS refused_users (user_id TEXT PRIMARY KEY, refused_at TEXT NOT NULL);`

// migrationStatements are idempotent ALTER TABLE statements later schema
// versions append; Open tolerates "duplicate column name".
var migrationStatements = []string{
	`ALTER TABLE runs ADD COLUMN next_status_due TEXT`,
	`ALTER TABLE runs ADD COLUMN last_status TEXT`,         // JSON of coordinator.WorkEvent
	`ALTER TABLE runs ADD COLUMN last_delivery_error TEXT`, // last failed Slack post; NULL once a post succeeds
}
