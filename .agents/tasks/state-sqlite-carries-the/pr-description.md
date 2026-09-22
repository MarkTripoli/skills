Ticket: [#42](https://github.com/MarkTripoli/skills/issues/42) | Task: `state-sqlite-carries-the`

## Purpose

The later `slack-assistant-bot-dms` children read eight assistant tables that `state.sqlite` did not have; this PR appends them to `schemaSQL` so `db.Open` creates them on a new file and adds them in place to a file created by the current `main` schema.

## Acceptance criteria

- `db.Open` on a database created by the `main` three-table schema succeeds and `sqlite_master` lists the eleven tables: `TestOpenAddsAssistantTablesToExistingDatabase` (`tools/slack-coordinator/internal/db/db_test.go:289`) writes the three old tables with a raw `sql.Open`, inserts a `runs` row, then calls `Open` and asserts the eleven names plus a `GetRun` read of the pre-upgrade row. `go test -count=1 ./internal/db` in `tools/slack-coordinator` passes.
- Inserts violating the `CHECK` on `tasks.state`, `tasks.trigger`, `dm_messages.author`, `assistant_runs.kind`, or `assistant_runs.state` fail: `TestAssistantCheckConstraintsRejectUnknownValues` (`db_test.go:345`) inserts one valid and one `bogus` value per column; the valid row inserts, the `bogus` row errors. Same `go test` run.
- `runs`, `owner_inputs`, `jira_backlinks`, and `migrationStatements` are byte-identical: `git diff -U0 epic-slack-assistant-bot-dms...HEAD -- tools/slack-coordinator/internal/db/schema.go` removes one line, the closing ``);` ``, and `diff` of `task.md:14-65` against `schema.go:44-95` prints nothing.

## Special things to note

- No `migrationStatements` entry and no index, by task instruction: `CREATE TABLE IF NOT EXISTS` upgrades an existing file, and later children depend on the appended DDL verbatim, so edit it only through a new child task.
- The doc comment at `schema.go:12-13` attributes the statement order to `foreign_keys(on)`; SQLite resolves foreign-key parents at DML time, so the real reason is the verbatim dependency. Wording follows `task.md:68`; recorded as ADV-001 in the [code review](.agents/tasks/state-sqlite-carries-the/01-code-review-state-sqlite-carries-the.md).
- `mainSchemaSQL` in `db_test.go:255` is a hand copy of the `main` DDL, not derived from git history; `main` is frozen for this tool, so it drifts only through an intentional edit.

## Change outline

`schemaSQL` grows from three tables to eleven; `Open` (`db.go:18`) applies it unchanged in one `Exec` with `foreign_keys(on)`.

```diff
 tools/slack-coordinator/internal/db/
   schema.go
+    doc comment: JSON shapes of tasks.schedule and tasks.deliver_to,
+                 NULL run_id semantics, RFC 3339 UTC timestamps
     schemaSQL
       runs, owner_inputs, jira_backlinks           unchanged
+      tasks             state, trigger CHECKs; schedule/deliver_to JSON text
+      task_channels     (task_id, channel_id) -> tasks
+      collected_messages (channel_id, ts) key
+      task_messages     -> tasks, assistant_runs, collected_messages; run_id NULL = unconsumed
+      dm_requests       root_ts key
+      dm_messages       -> dm_requests; author CHECK; run_id NULL on owner row = pending follow-up
+      assistant_runs    kind, state CHECKs; pid/pgid/daemon_pid, exit_code, timed_out
+      refused_users     user_id key
     migrationStatements                             unchanged
   db_test.go
+    mainSchemaSQL                                   three-table main DDL
+    TestOpenAddsAssistantTablesToExistingDatabase   upgrade in place, eleven names, old row readable
+    TestAssistantCheckConstraintsRejectUnknownValues five CHECK columns, valid vs bogus
```

Review the DDL against `task.md:14-65` first; every later child in the epic reads these column names and constraints as written.

## Human Review

### Review targets

- `tools/slack-coordinator/internal/db/schema.go:44-95`: appended DDL matches the task text and the three coordinator tables above it are untouched.
- `tools/slack-coordinator/internal/db/db_test.go:289-379`: the upgrade-in-place test excludes only `sqlite_%` names, so an accidental extra table fails the count.

### Verify

- [ ] `Commits` and the Go checks on this pull request pass.
- [ ] `go test -count=1 ./internal/db` in `tools/slack-coordinator` reports `ok`.

### Known limits

- No `.changeset/` entry; the epic pull request owns the user-facing changelog entry for the assistant tables.

Closes #42
