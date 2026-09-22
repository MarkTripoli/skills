---
type: code-review
date: 2026-09-22
branch: a-dm-request-runs
base_branch: epic-slack-assistant-bot-dms
base_sha: 4b632ce1d6b8b1da71a0b09067f70729a4c1e691
head_sha: 15dafeb9fd3c9e9170d767590f679458a363332b
status: findings
summary: "Reviewed commit 15dafeb (dispatcher, prompt, delivery, db functions, tests) against task.md; the named proof passes and four of five acceptance criteria are proven by tests. One major finding: a run killed by daemon shutdown is never recorded, because deliver writes the row through the cancelled dispatcher ctx, so the row stays running and permanently occupies a slot after restart. The fix round must write terminal rows with a non-cancellable ctx and keep a regression test for the shutdown path."
---

# Code Review

## Scope

- merge base: `4b632ce1d6b8b1da71a0b09067f70729a4c1e691` (`epic-slack-assistant-bot-dms`, from `task.md` `base:`; no pull request exists for the branch)
- reviewed HEAD: `15dafeb9fd3c9e9170d767590f679458a363332b`
- commits: one, `15dafeb feat(slack-coordinator): run queued DM requests and answer in the ack`
- staged and unstaged changes: none (`git status --short --branch` clean)
- task-owned untracked files: none
- excluded changes: `.agents/tasks/a-dm-request-runs/task.md` (task artifact, committed on the epic branch)

Changed files (14, +997/-7): `tools/slack-coordinator/internal/assistant/{dispatcher.go,deliver.go,prompt.go,service.go,skill/ASSISTANT.md,dispatcher_test.go,deliver_test.go,requests_test.go}`, `internal/db/{assistant_runs.go,dm_requests.go}`, `internal/daemon/daemon.go`, `internal/cli/{dm_request_test.go,run_start_test.go}`, `.changeset/dm-request-runs-agent.md`.

## Previous Round

- previous artifact: None.

## Requirements and Standards

- task or ticket: `.agents/tasks/a-dm-request-runs/task.md` (issue #55, oneshot child of `slack-assistant-bot-dms`). Five acceptance criteria, decided below.
- implementation source: none beyond `task.md` (oneshot; no plan, outline, TDD, or PRD artifact).
- repository instructions: `AGENTS.md` (changeset for user-facing changes, Conventional Commits, skip `npm test`); Go package conventions read from `internal/agent/run.go`, `internal/db/db.go`, `internal/assistant/requests.go`.

Acceptance criteria against the diff and tests:

| Criterion | Decision | Evidence |
|---|---|---|
| Tick writes `prompt.md` + empty `messages.jsonl`, spawns, sets `running` with pid/pgid/daemon_pid/started_at, edits `Queued behind` ack | proven | `dispatcher_test.go:136-182` checks the row fields, the prompt sections, 0600 modes, the empty file, and the two `Working on it` edits |
| Three `running` rows spawn nothing; oldest queued starts on the tick after one finishes | proven | `dispatcher_test.go:184-206` |
| Exit 0 with a non-empty result of at most 4,000 characters edits the ack, inserts the bot row, sets `done` with `finished_at`, `exit_code`, `result_source` | proven | `deliver_test.go:26-51`; end to end through `daemon.Serve` in `cli/dm_request_test.go:49-80` |
| A DM insert wakes the dispatcher before its period | proven | `dispatcher_test.go:238-262` (10 s period, spawn within 50 ms) |
| Non-zero exit, timeout, or empty result sets `failed` with `failure` text and leaves the ack unchanged | proven for process outcomes, contradicted for a timeout caused by daemon shutdown | `deliver_test.go:75-110` covers exit 3, `spec.Timeout`, and no result; CR-001 shows the shutdown kill (also `TimedOut: true`) leaves the row `running` |

## Change Profile

- intent and expected behavior: fill up to three run slots from the oldest queued DM request, write the run inputs, spawn the configured agent, edit a `Queued behind` ack to `Working on it`, and on a clean exit put the answer in the ack (or under a `Done` ack when longer than 4,000 runes); other outcomes fail the row without touching Slack.
- change description quality: the subject stands alone (70 characters, passes the repository regex). The body explains motivation and records six decisions where `task.md` left room, with reasons. One claim is false: "In-flight deliveries are counted so RunDispatcher returns only after the ended ctx has killed the agents and their rows are written"; the rows are not written (CR-001).
- implementation model and review model: implementation model not recorded in the commit; review model `anthropic/claude-fable-5-1`.
- changed-line size and logical cohesion: ~450 product lines plus ~550 test lines in one commit, one feature (dispatch + deliver), one package boundary each for db and daemon. Coherent; no split needed.
- resulting large-file concerns: none; the largest new file is `dispatcher_test.go` at 262 lines.
- dependency or lockfile changes: none. `sync.WaitGroup.Go` and `context.WithoutCancel` are available on the module's `go 1.26.6`.

## Tests Reviewed First

- behavior claimed by tests: `dispatcher_test.go` drives four routed DMs through `Tick` with a `fakeRunner` whose `Wait` blocks until released; it asserts the running row (`pid 1001`, `pgid 1001`, `os.Getpid()`, `started_at` at the fixed clock), the `RunSpec`, the prompt sections including a sentence from `ASSISTANT.md`, file modes, the ack edits, the full-slot no-op, and the backfill. `TestTickRecordsARunThatCannotStartAsFailed` proves `ErrBinaryMissing` fails both queued rows with `exit_code -1` and leaves the inputs on disk. `TestWakeTicksTheDispatcherBeforeItsPeriod` runs the real loop. `deliver_test.go` covers the short answer (ack row rewritten, `run_id` bound), the 4,001-rune answer (`Done` ack plus one thread post), and three failure outcomes with no Slack call and the stdout log line. `cli/dm_request_test.go` runs the real `fake-agent.sh` as `omp` through `daemon.Serve` and asserts the `chat.update` form at the fake Slack server.
- missing or misleading coverage: no test ends the dispatcher ctx while an agent is running, which is the one path where the terminal write goes through a cancelled ctx (CR-001). `dispatcher_test.go:144` asserts `ExtraDirs == nil` because the test config has none; the pass-through of a configured value is unproven (advisory only, the assignment at `dispatcher.go:135` is a direct field copy).

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `5667` in / `73` out (stderr: `judge: model jev-1.13.0, tokens 5667 in / 73 out`; one run, every axis covered)

### Correctness

- assessment and evidence: The loop in `spawnQueued` (`dispatcher.go:52-67`) terminates because every iteration either moves the oldest row to `running` (`MarkRunning`) or to `failed` (`FinishAssistantRun` at line 79), so `OldestQueued` never returns the same row twice; a database error ends the tick. `MarkRunning` is committed before the `Queued behind` edit (`dispatcher.go:81-89`), as required. `Handle.Wait()` is evaluated inside the `inflight.Go` closure (line 90), so the tick does not block on the agent. Delivery calls Slack first and writes the bot row and the `done` state in one transaction after (`deliver.go:48-60`); the ack row is rewritten in place with `UpsertDMMessage` because `(root_ts, ts)` is the primary key. `renderPrompt` produces every section `task.md` names (`prompt.go:39-51`), and `writeInputs` writes both files 0600 (`prompt.go:66-77`). Defect: `deliver` receives the dispatcher ctx (`dispatcher.go:90`) and `FinishAssistantRun` runs through it; when that ctx is cancelled at shutdown, the real runner's `Wait` returns `TimedOut: true` but `ExecContext` fails with `context canceled`, so the row stays `running` (CR-001, reproduced). A `GetDMRequest` error or miss at `deliver.go:41-47` also returns without finishing the row (ADV-002).
- helper coverage: covered, level 3, confidence 1.00

### Readability and Simplicity

- assessment and evidence: `spawn` / `start` / `startedRun` split the load-render-write-spawn sequence from the record-and-notify sequence, and `answer` isolates the three Slack shapes (`deliver.go:67-81`). Names match the schema and the task vocabulary (`queuedAckPrefix`, `workingAck`, `doneAck`, `maxAnswerRunes`). `failureText` (`deliver.go:84-93`) puts the three reasons in one switch. The stdout log at `deliver.go:29` uses `slog.Info(fmt.Sprintf(...))` where the rest of the package uses structured attributes; `task.md` fixes the exact text, so the form is justified. No dead code, no pass-through wrappers.
- helper coverage: covered, level 3, confidence 0.93

### Architecture

- assessment and evidence: The dispatcher lives in `assistant.Service` beside the request path that queues rows and signals `wake`, so producer and consumer share `maxRunningRuns` and the ack vocabulary (`requests.go:20`, `dispatcher.go:17-20`). `agent.Runner` is an interface injected by `daemon.Serve` (`daemon.go:179-185`) and faked in tests; the db layer gains four focused functions with NULL-when-empty handling in one helper (`assistant_runs.go:149`). `Service.Runner` is set after `New` rather than through it, matching the task's "Service gains `Runner`" wording; acceptable since `New` already takes seven arguments. Ownership of the `ASSISTANT.md` skill text is the `assistant` package via `go:embed`, which is the only reader.
- helper coverage: covered, level 3, confidence 0.94

### Security

- assessment and evidence: `prompt.md` and `messages.jsonl` are written 0600 inside a 0700 run directory (`prompt.go:70-73`, `agent.Create`), and the tests assert the modes. Owner DM text enters `prompt.md` verbatim (`prompt.go:44-47`); that is the design (the agent must read the request) and the process runs with `scrubEnv` from the existing runner, so the prompt cannot reach Slack tokens. All SQL is parameterized (`assistant_runs.go:112-142`, `dm_requests.go:101-105`). The answer text goes to Slack as plain `text`, no formatting injection surface beyond what Slack mrkdwn already permits for bot posts. `ASSISTANT.md:49` tells the agent the extra directories are "listed in the prompt"; they are passed as `--add-dir` argv instead (`adapter.go:104-105`) and the prompt never lists them (ADV-001).
- helper coverage: covered, level 3, confidence 0.89

### Performance

- assessment and evidence: Each tick issues one `COUNT` and one `LIMIT 1` query per spawned run plus one per idle check (`dispatcher.go:53-60`); with `maxRunningRuns = 3` that is bounded at seven queries per tick. `ListDMMessages` loads one thread per spawn; threads are owner DM threads and small. The prompt is built in one `strings.Builder` (`prompt.go:40`). `utf8.RuneCountInString` on the result runs once per delivery. The 5 s default period plus wake-driven ticks keeps idle cost at one `COUNT` per 5 s.
- helper coverage: covered, level 3, confidence 0.87

## Verification Story

- command or inspection: `go test -race ./internal/assistant ./internal/daemon ./internal/cli` in `tools/slack-coordinator` (the proof `task.md` names); `go vet ./internal/assistant ./internal/daemon ./internal/db`; a throwaway probe test (written, run, deleted, not committed) that ticks once with a cancellable ctx, cancels it, releases the fake agent with `{ExitCode: -1, TimedOut: true}`, waits on `inflight`, and reads the row.
- result: the three packages pass under `-race` (`ok ... internal/assistant 2.389s`, `internal/daemon 1.304s`, `internal/cli 2.552s`); `go vet` clean. The probe fails: log `ERROR run not delivered run=01M3551Z5M4B2815V64XSNB3M3 error="finish run 01M3551Z5M4B2815V64XSNB3M3 as failed: context canceled"`, then `state=running failure={String: Valid:false}`.
- manual, screenshot, or before-and-after evidence: none; the surface is a daemon with no UI. The `internal/cli` test exercises the real fake agent binary and the fake Slack HTTP server end to end.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 A run killed by daemon shutdown is never recorded and holds its slot forever

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `tools/slack-coordinator/internal/assistant/dispatcher.go:90`, `tools/slack-coordinator/internal/assistant/deliver.go:39`
- failure mode: `spawn` starts the delivery as `s.deliver(ctx, run, st.handle.Wait())` with the dispatcher ctx. When `daemon.Serve` ends that ctx, the runner kills the process group and `Wait` returns `TimedOut: true` (`agent/run.go:135-138`), and `deliverDM` calls `FinishAssistantRun(ctx, ...)` through the same cancelled ctx. `database/sql` rejects the exec with `context canceled`, the error is only logged, and the row stays `running` with a dead `pid`. On restart `CountRunsByState(running)` counts it (`dispatcher.go:53`) and `ackText` counts it (`requests.go:80`); nothing in this branch reconciles rows whose `daemon_pid` is gone (`daemon_pid` is written at `assistant_runs.go:128` and read nowhere). Three shutdowns with in-flight runs leave the dispatcher unable to spawn and every new request acked `Queued behind`. The commit body states the opposite ("their rows are written"), and the acceptance criterion for a timed-out run ("set the row `failed` with `failure` text") is not met for this timeout.
- evidence or reproduction: probe described under Verification Story; output `finish run … as failed: context canceled` followed by `state=running`. `deliver.go:31-33` logs and drops the error; no retry, no fallback ctx.
- fix direction: in `deliver` (or at the call site in `spawn`), derive the ctx for the terminal database writes with `context.WithoutCancel(ctx)` so a shutdown still records `failed` (the Slack calls may keep the cancellable ctx, or the same detached one; either is consistent with "post first, record after"). Distinguish the reason when `ctx.Err() != nil` (for example `failure = "killed at daemon shutdown"`) instead of `timed out after 1m0s`, which names a timeout that did not elapse. Keep the probe as a regression test in `dispatcher_test.go` or `deliver_test.go`: cancel the ctx after one tick, release the fake agent with `TimedOut: true`, `inflight.Wait()`, assert the row is `failed`.

## Advisories

### ADV-001 Skill text says extra directories are listed in the prompt; they are not

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `tools/slack-coordinator/internal/assistant/skill/ASSISTANT.md:42`, `:49`; `tools/slack-coordinator/internal/assistant/prompt.go:39-51`
- evidence: `ASSISTANT.md:49` reads "the extra directories listed in the prompt" and `:42` "the listed extra directories"; `renderPrompt` has no such list, and `promptInput` carries no `ExtraDirs`. The agent receives them only as `--add-dir` argv (`agent/adapter.go:104-105`).
- suggestion: either add the configured extra directories to the prompt header (one line after `approval:`) so the rule is checkable by the agent, or change the two sentences to "the extra directories the daemon opened for you" so the text stops pointing at a list that does not exist.

### ADV-002 A request lookup failure at delivery leaves the row running

- type: Potential issue
- severity: minor
- category: Stability and availability
- location: `tools/slack-coordinator/internal/assistant/deliver.go:41-47`
- evidence: a `GetDMRequest` error or `!ok` returns from `deliverDM` before any `FinishAssistantRun`; `deliver` logs it and the slot is never freed. The sibling failure path at `deliver.go:48-53` does free the slot with `deliver: <err>`. The `!ok` branch cannot occur through `newRequest` (request and run are inserted in one transaction, `requests.go:35-51`), so this is reachable only on a transient database error.
- suggestion: route this error through the same `FinishAssistantRun(..., RunFailed, ..., "deliver: "+err.Error(), ...)` path used for Slack failures, so every exit from `deliverDM` after a clean agent run either finishes the row or fails it. Folds naturally into the CR-001 change.

## Dead Code and Dependency Review

- newly orphaned code: none. `InsertDMMessage` remains used by `requests.go:41` and `:71`; `UpsertDMMessage` is new and used at `deliver.go:56`. `GetAssistantRun` is used only by tests in this branch (`dispatcher_test.go:94`); `task.md` names it explicitly, so it is required, not orphaned. `Service.Wake()` keeps its existing test callers.
- dependency findings: no `go.mod`, `go.sum`, or npm lockfile changes.

## Verdict

- decision: request_changes
- overall code-health change: positive; the dispatcher and delivery are small, direct, and tested against the acceptance criteria, and the db layer keeps its parameterized, NULL-aware style.
- rationale: one major finding. A daemon shutdown with in-flight runs leaves rows `running` permanently, which starves the three run slots after restart and contradicts both the commit description and the fifth acceptance criterion for the timeout case. The remaining criteria are proven by the named tests and the end-to-end `internal/cli` test.

## Review Limits

- blocked or unavailable checks: none; typed judgments ran (one pass, all axes covered), the named Go proof ran, and no check was blocked
- residual manual verification: no run against a real Slack workspace or a real `omp` binary; the end-to-end test substitutes `fake-agent.sh` and an HTTP fake for Slack. Shutdown behavior was proven with the fake runner, not with a real process group kill.
