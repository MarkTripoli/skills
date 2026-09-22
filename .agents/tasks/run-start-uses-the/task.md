---
slug: run-start-uses-the
title: "run start uses the configured owner and rejects --owner"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on: []
issue: 40
---
In `tools/slack-coordinator/`, make the configured owner the only run owner.

Change: delete the `--owner` flag from `internal/cli/run_start.go` (flag registration at the `f.StringVar(&in.OwnerUserID, "owner", ...)` line, the `Use:` string, and the default-fill `if in.OwnerUserID == ""` block). Remove `OwnerUserID` from `StartRunInput` in `internal/coordinator/types.go`. In `internal/coordinator/start_run.go`, drop the `in.OwnerUserID == ""` refusal and copy the owner from a new `Coordinator.OwnerUserID string` field (set in `internal/daemon/daemon.go` from `cfg.Slack.OwnerUserID` where the `Coordinator` literal is built) into `RenderRoot` and the `runs` insert. Update `internal/cli/run_start_test.go` and any coordinator test constructing `StartRunInput{OwnerUserID: ...}` to set the coordinator field instead.

Docs and skill: remove `[--owner <U…>]` and the `--owner` sentence from `skills/delivery/slack-coordinator/references/commands.md` (the `run start` usage block and the paragraph below it), change the Owner row in `skills/delivery/slack-coordinator/references/messages.md` to `the configured owner (\`setup --owner\`)`, and rewrite `docs/slack-coordinator.md` line 9 so only `setup --owner <U…>` names the owner. `setup --owner` and its `commands.md` operator block stay.

Proof: `go test ./internal/cli ./internal/coordinator` passes; a test in `run_start_test.go` asserts `run start --owner U1 ...` exits 2 with an unknown-flag message; `node scripts/validate.mjs` passes. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `slack-coordinator run start --owner U1 --work w --goal g --scope s` is invoked, the CLI shall exit 2 with an unknown-flag error before contacting the daemon.
- WHEN `run start` opens a run, the daemon shall store `slack.owner_user_id` from `config.yaml` in `runs.owner_user_id` and render it as the root message's Owner field.
- The skill references and docs shall contain no `run start --owner` mention while `setup --owner` stays documented.
