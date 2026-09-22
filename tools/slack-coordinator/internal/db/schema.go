package db

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
);`

// migrationStatements are idempotent ALTER TABLE statements later schema
// versions append; Open tolerates "duplicate column name".
var migrationStatements = []string{
	`ALTER TABLE runs ADD COLUMN next_status_due TEXT`,
	`ALTER TABLE runs ADD COLUMN last_status TEXT`,         // JSON of coordinator.WorkEvent
	`ALTER TABLE runs ADD COLUMN last_delivery_error TEXT`, // last failed Slack post; NULL once a post succeeds
}
