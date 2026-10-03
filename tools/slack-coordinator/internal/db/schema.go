package db

// schemaSQL creates coordinator tables. Existing unrelated tables are left
// untouched, and timestamps are RFC 3339 UTC text.
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
CREATE TABLE IF NOT EXISTS terminal_notices (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  message_ts TEXT NOT NULL,
  PRIMARY KEY (run_id, message_ts)
);
CREATE TABLE IF NOT EXISTS owner_inputs (
  run_id      TEXT NOT NULL REFERENCES runs(run_id),
  message_ts  TEXT NOT NULL,
  text        TEXT NOT NULL,
  received_at TEXT NOT NULL,
  handled_at  TEXT,
  claimed_at  TEXT,
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
`

// migrationStatements are idempotent ALTER TABLE statements later schema
// versions append; Open tolerates "duplicate column name".
var migrationStatements = []string{
	`ALTER TABLE runs ADD COLUMN next_status_due TEXT`,
	`ALTER TABLE runs ADD COLUMN last_status TEXT`,  // JSON of coordinator.WorkEvent
	`ALTER TABLE runs ADD COLUMN root_message TEXT`, // JSON of coordinator.RootMessage; NULL for pre-upgrade runs
	`ALTER TABLE runs ADD COLUMN status_interval_seconds INTEGER NOT NULL DEFAULT 10800`,
	`ALTER TABLE runs ADD COLUMN last_root_update TEXT`,    // UTC time of most recent root post or status-card edit
	`ALTER TABLE runs ADD COLUMN last_delivery_error TEXT`, // failed Slack delivery; uncertain uploads remain gated until explicit disable
	`ALTER TABLE runs ADD COLUMN status_message_ts TEXT`,   // Slack timestamp of the editable thread status card
	`ALTER TABLE owner_inputs ADD COLUMN claimed_at TEXT`,
	`ALTER TABLE owner_inputs ADD COLUMN stale_notice_at TEXT`, // UTC time the unread-reply notice was posted
}
