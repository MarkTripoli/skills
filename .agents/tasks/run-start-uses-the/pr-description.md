Ticket: [#40](https://github.com/MarkTripoli/skills/issues/40) | Task: `run-start-uses-the`

## Purpose

`run start --owner` let any caller of the CLI choose whose thread replies steer a run, so the daemon now stamps the `setup --owner` value from `config.yaml` on every run and the flag is removed.

## Acceptance criteria

- `run start --owner U1 --work w --goal g --scope s` exits 2 with an unknown-flag error before contacting the daemon: `TestRunStartRejectsOwnerFlagBeforeAnyCall` (`internal/cli/run_start_test.go:366`) asserts `ExitUsage`, `unknown flag: --owner`, and zero requests to the fake Slack server. Cobra rejects the flag before `RunE`, so `callDaemon` never runs.
- `run start` stores `slack.owner_user_id` in `runs.owner_user_id` and renders it as the root Owner field: `TestRunStartPostsOneRootMessage` (`run_start_test.go:167`) starts a daemon with `OwnerUserID: "U1"`, passes no owner, and reads `*Owner:* <@U1>` in the posted text; `TestConsumeInboundKeepsOnlyOwnerThreadReplies` reads the stored row and drops a reply from `U2`.
- Skill references and docs contain no `run start --owner` while `setup --owner` stays documented: `grep -- '--owner' docs skills/delivery/slack-coordinator README.md` returns only `setup --owner` (`docs/slack-coordinator.md:9,15`, `commands.md:84`) and the `messages.md:14` Owner row.

## Special things to note

- Breaking for CLI callers: `run start --owner` now exits 2. The migration is one `setup --owner <U…>` per daemon; `.changeset/run-start-configured-owner.md` records the change as `minor`.
- `StartRunInput` loses the JSON field `owner_user_id`. The daemon decodes with `encoding/json` defaults (no `DisallowUnknownFields`), so an older CLI that still sends the field is not rejected; the value is ignored and the configured owner wins.
- `StartRun` does not refuse an empty `Coordinator.OwnerUserID` (code review ADV-001). Production reaches it only through `config.Load`, whose `Validate` rejects an owner not starting with `U` or `W`; a `Coordinator{}` built by hand would store `""` and render `*Owner:* None`.

## Change outline

The owner moves from a per-request input to a daemon field set once from config.

```diff
 daemon.Serve
-  coordinator.Coordinator{DB, Slack, Now, Quiet, Health}
+  coordinator.Coordinator{DB, Slack, Now, OwnerUserID: cfg.Slack.OwnerUserID, Quiet, Health}

 cli run start
-  --owner flag; in.OwnerUserID = cfg.Slack.OwnerUserID when empty
   callDaemon(StartRunInput{RunID, ChannelID, Work, Goal, Scope, Links, JiraIssue})

 Coordinator.StartRun(in)
-  refuse in.OwnerUserID == ""
-  RenderRoot{OwnerUserID: in.OwnerUserID}; InsertRun{OwnerUserID: in.OwnerUserID}
+  RenderRoot{OwnerUserID: c.OwnerUserID};  InsertRun{OwnerUserID: c.OwnerUserID}
```

```text
tools/slack-coordinator/internal/
  cli/run_start.go              --owner flag, Use: string, default fill removed
  cli/run_start_test.go         TestRunStartRejectsOwnerFlagBeforeAnyCall
  coordinator/types.go          StartRunInput drops OwnerUserID
  coordinator/start_run.go      Coordinator.OwnerUserID; StartRun reads it
  coordinator/*_test.go         newTestCoordinator sets OwnerUserID: "U1"
  daemon/daemon.go              sets the field from cfg.Slack.OwnerUserID
docs/slack-coordinator.md       setup --owner is the only owner source
skills/delivery/slack-coordinator/references/{commands,messages}.md
.changeset/run-start-configured-owner.md   minor
```

`inbound.go:73` (`msg.User != run.OwnerUserID`) is unchanged; it now compares against the value the daemon stamped, so the reply gate and the root message can no longer disagree.

## Human Review

### Review targets

- `tools/slack-coordinator/internal/coordinator/start_run.go:50-57`: the empty-owner refusal is gone and nothing replaces it at this layer; decide whether ADV-001's `c.OwnerUserID == ""` case is wanted before merge.
- `tools/slack-coordinator/internal/coordinator/types.go`: the wire struct loses `owner_user_id`; confirm no other client of the daemon socket sends or reads it.

### Verify

- [ ] `cd tools/slack-coordinator && go test -count=1 ./internal/cli ./internal/coordinator` prints `ok` for both packages.
- [ ] `node scripts/validate.mjs` prints `ok: 48 skills, 59 answer templates, ...`.
- [ ] The `Commits` check passes on every commit on the branch and on this title.

### Known limits

- No live Slack post was exercised; the fake server in `run_start_test.go` stands in for it.
- The oneshot had no plan artifact, so no plan-versus-implementation comparison exists; the commit and code-review artifacts under `.agents/tasks/run-start-uses-the/` are the only records.

Closes #40
