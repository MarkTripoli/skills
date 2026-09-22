---
type: code-review
date: 2026-09-22
branch: run-start-uses-the
base_branch: epic-slack-assistant-bot-dms
base_sha: d1f95113d28c1d42c350b7379dd009ee2977a2c2
head_sha: 8ff350106aebe6f75a4c795122ec9ee12bdb3664
status: clean
summary: "Reviewed commits 1154b1e and fba7982 (seven Go files, three docs/skill files, one changeset) against epic-slack-assistant-bot-dms. All three acceptance criteria are proven by tests in internal/cli and internal/coordinator; no critical or major finding. The next phase writes the pull request description; two minor advisories need no fix round."
---

# Code Review

## Scope

- merge base: `d1f95113d28c1d42c350b7379dd009ee2977a2c2` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists yet)
- reviewed HEAD: `8ff350106aebe6f75a4c795122ec9ee12bdb3664`
- commits: `1154b1e feat(slack-coordinator)!: stamp the configured owner on every run`, `fba7982 docs(slack-coordinator): name setup --owner as the only owner source`, `8ff3501 docs(task): commit artifact`
- staged and unstaged changes: none (`git status --short --branch` prints only `## run-start-uses-the`)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/run-start-uses-the/01-commit-run-start-uses-the.md` (task artifact)

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/run-start-uses-the/task.md` (oneshot, issue #40): delete `run start --owner`, stamp `Coordinator.OwnerUserID` from `cfg.Slack.OwnerUserID`, update docs and skill references, keep `setup --owner`.
- implementation source: none; `01-commit-run-start-uses-the.md` records that the oneshot was implemented from `task.md` directly.
- repository instructions: `AGENTS.md` (skill/template changes validated by `scripts/validate.mjs`; user-facing changes add a `.changeset/` entry; commits follow `scripts/check-commits.mjs`), `shared/WRITING.md`, `shared/CONVENTIONS.md`.

Acceptance criteria against the diff:

| Criterion | Decision | Evidence |
|---|---|---|
| `run start --owner U1 ...` exits 2 with an unknown-flag error before contacting the daemon | proven | `run_start_test.go:366-385` asserts `ExitUsage`, `unknown flag: --owner`, and zero fake-Slack requests. `channel.Resolve` (`run_start.go:59`) runs before `callDaemon` (`run_start.go:68`) inside `RunE`, so zero Slack requests means `RunE` never ran and the daemon was never called. |
| The daemon stores `slack.owner_user_id` in `runs.owner_user_id` and renders it as the root Owner field | proven | Render: `run_start_test.go:167-193` starts a daemon with `OwnerUserID: "U1"` and passes no owner flag; the posted text contains `*Owner:* <@U1>`. Store: `scheduler_test.go:44` sets `Coordinator.OwnerUserID: "U1"`, `inbound_test.go:28-58` starts a run without an owner and the `U2` reply is dropped by `inbound.go:73` (`msg.User != run.OwnerUserID`), which reads the row `start_run.go:82-92` inserted. |
| Skill references and docs contain no `run start --owner` while `setup --owner` stays documented | proven | `grep` for `run start.*--owner` across `skills`, `docs`, `atomic`, `README.md`, `workflows`, `evals`, `runtimes`, `agents`: no matches. `setup --owner <U…>` remains at `docs/slack-coordinator.md:9,15` and in the `commands.md` operator block; `setup.go:19` is unchanged. |

## Change Profile

- intent and expected behavior: one daemon trusts one owner. The CLI drops the `--owner` flag and its default fill; `StartRunInput` loses `OwnerUserID`; `Coordinator.OwnerUserID` (set in `daemon.go:158` from `cfg.Slack.OwnerUserID`) feeds `RenderRoot` and `db.InsertRun` (`start_run.go:70,84`).
- change description quality: `1154b1e` subject stands alone; body states the motivation (per-run owner let steering differ from the trusted owner), carries `BREAKING CHANGE:` with the migration (`setup --owner`), and `Refs: #40`. `fba7982` body is `Refs: #40` only; the docs change needs no more.
- implementation model and review model: implementation model not recorded in the commit artifact; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: 44 insertions, 21 deletions across 11 files; one behavior change plus its docs, in two commits split by type.
- resulting large-file concerns: none; `run_start_test.go` grows to 385 lines with one 20-line test.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: `TestRunStartRejectsOwnerFlagBeforeAnyCall` (new) claims cobra rejects `--owner` with exit 2 and no Slack traffic. `TestRunStartPostsOneRootMessage` (existing, unchanged) claims the Owner field renders `<@U1>` from the daemon's config with no flag. Coordinator tests (`backlink_test.go:83,113,165`, `scheduler_test.go:44,68`) claim `StartRun` succeeds without an input owner when `Coordinator.OwnerUserID` is set. `TestConsumeInboundKeepsOnlyOwnerThreadReplies` claims the stored owner gates thread replies.
- missing or misleading coverage: no test covers a `Coordinator` with an empty `OwnerUserID`; production reaches `StartRun` only through `config.Load` (`config.go:52`), whose `Validate` refuses an owner not starting with `U` or `W` (`config.go:82-83`), so the empty case is unreachable outside tests. Recorded as ADV-001.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `4212` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 4212 in / 73 out`)

### Correctness

- assessment and evidence: the refusal `in.OwnerUserID == ""` is removed and both consumers read `c.OwnerUserID` (`start_run.go:70,84`); no other reader of the deleted input field remains (`grep OwnerUserID` under `tools/slack-coordinator` shows only `config`, `db`, `messages.go`, `inbound.go`, `start_run.go`, `daemon.go`, and tests). Removing the JSON field `owner_user_id` from the wire struct is compatible: `encoding/json` ignores unknown fields on decode and `grep DisallowUnknownFields` finds no strict decoder, so an older CLI sending the field is not rejected, its value is dropped. `runs.owner_user_id` is `TEXT NOT NULL` (`schema.go:6`), satisfied by every value the daemon can hold after `config.Validate`. `go vet ./internal/cli ./internal/coordinator ./internal/daemon` passes; `go test -count=1 ./internal/cli ./internal/coordinator` passes.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: the change deletes code (flag registration, default-fill block, one switch case, one struct field) and adds one documented field on `Coordinator` (`start_run.go:25-27`) and a two-sentence doc comment on `StartRunInput` (`types.go:5-6`) saying where the owner now comes from. `Use:` and the `commands.md` usage line agree (`run_start.go:25`, `commands.md:34`). No new branching.
- helper coverage: covered, level 3, confidence 0.97

### Architecture

- assessment and evidence: owner ownership moves from a per-request input to daemon configuration, matching the trust model in `docs/slack-coordinator.md:7-9` (the daemon, not the agent, holds trust). `daemon.Serve` is the single place the coordinator literal is built (`daemon.go:158`), so there is one injection point. Test construction reuses `newTestCoordinator` (`scheduler_test.go:44`) rather than a second helper.
- helper coverage: covered, level 3, confidence 0.94

### Security

- assessment and evidence: this change closes the hole the commit body names: a caller of the CLI (any code running as the same OS user) could previously pick a steering user per run; now only `config.yaml`, written by `setup --owner`, decides whose replies become pending input (`inbound.go:73`). No new untrusted input; one input field removed from the JSON-RPC surface.
- helper coverage: covered, level 3, confidence 0.97

### Performance

- assessment and evidence: no new I/O, allocation, or query; `StartRun` performs the same `GetRun`, `PostMessage`, `Permalink`, `InsertRun` sequence. The axis does not apply beyond that.
- helper coverage: covered, level 3, confidence 0.98

## Verification Story

- command or inspection: `cd tools/slack-coordinator && go vet ./internal/cli ./internal/coordinator ./internal/daemon && go test -count=1 ./internal/cli ./internal/coordinator`
- result: `ok internal/cli 0.997s`, `ok internal/coordinator 0.316s`; targeted `-v` run: `--- PASS: TestRunStartPostsOneRootMessage`, `--- PASS: TestRunStartRejectsOwnerFlagBeforeAnyCall`, `--- PASS: TestConsumeInboundKeepsOnlyOwnerThreadReplies`
- command or inspection: `node scripts/validate.mjs`
- result: `ok: 48 skills, 59 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, Atomic entry checked`
- command or inspection: `node scripts/check-commits.mjs epic-slack-assistant-bot-dms..HEAD`
- result: `ok: 3 subjects`
- manual, screenshot, or before-and-after evidence: none; no interface surface changed. Formatters, linters, and the full `npm test` were skipped per `task.md`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 StartRun accepts an empty Coordinator.OwnerUserID

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/coordinator/start_run.go:50-57`
- evidence: the switch refuses an empty `RunID` and `ChannelID` but not an empty `c.OwnerUserID`; a coordinator built without the field stores `""` in `runs.owner_user_id` and renders `*Owner:* None`, after which `inbound.go:73` accepts no reply. Production is protected by `config.Validate` at `config.go:52,82`; only direct `Coordinator{}` construction (tests, future callers) can reach it.
- suggestion: add `case c.OwnerUserID == "": return SlackRunRef{}, errors.New("coordinator owner is not configured")` so the invariant the docs state (`messages.md:14`, "never omitted") is enforced where the row is written.

### ADV-002 RenderRoot keeps the `None` owner branch the daemon can no longer reach

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `tools/slack-coordinator/internal/coordinator/messages.go:21-24`, `messages_test.go:17`
- evidence: `RenderRoot` still renders `*Owner:* None` for an empty `OwnerUserID`; `messages.md:14` now says the field is never omitted. The branch is pre-existing and exercised by the empty-message test, so it is not task-caused dead code.
- suggestion: none required; if ADV-001 is taken, the branch remains a formatter fallback and needs no change.

## Dead Code and Dependency Review

- newly orphaned code: none. `grep OwnerUserID` shows every remaining reference has a caller; the deleted `StartRunInput.OwnerUserID` had readers only in `start_run.go` and tests, all updated.
- dependency findings: none; `go.mod` and lockfiles unchanged.

## Verdict

- decision: approve
- overall code-health change: improves. One trust decision now lives in one configured field; the CLI surface and the wire struct each lose a field; the docs describe the single owner source.
- rationale: all three acceptance criteria are proven by existing or new tests, the named commands pass, the commit subjects validate, and both advisories are outside the gate.

## Review Limits

- blocked or unavailable checks: none; the axis-coverage judgment ran once and returned `covered` on every axis, so no second run was needed.
- residual manual verification: none needed; no UI surface. A live Slack post was not exercised; the fake server in `run_start_test.go` stands in for it.
