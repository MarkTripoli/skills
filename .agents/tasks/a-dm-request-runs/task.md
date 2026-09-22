---
slug: a-dm-request-runs
title: "a DM request runs the agent and its answer replaces the Working on it ack"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - agent-runner-spawns-an
  - owner-dms-are-recorded
issue: 55
---
In `tools/slack-coordinator/internal/assistant/`, add the dispatcher and the success path of DM delivery.

`skill/ASSISTANT.md` (new, embedded with `//go:embed skill/ASSISTANT.md`): the text the headless agent reads. It states the run-directory contract (`prompt.md` and `messages.jsonl` are inputs; write the answer to `result.md`; write `proposal.json` only when proposing a standing task, with the schema `{"watch": ["#name"|"C…"], "trigger": {"kind": "schedule"|"window_end"|"each_message", "daily": "HH:MM", "tz": "<IANA>", "every_hours": n, "at": "<RFC3339>", "debounce_seconds": n}, "instruction": "…", "deliver_to": {"dm": true} | {"channel_id": "C…", "thread_ts": "…"}, "summary": "one line"}`), what the approval level permits (draft results at `edits`, run commands at `full`), and the rules: never delete the run directory, never contact Slack, keep writes inside the run directory, the workspace, and the listed extra dirs.

`prompt.go`: `renderPrompt(p promptInput) string` producing `# Assistant run <run-id>`, `kind: dm request · approval: <level>`, the embedded skill text, `## Request` (the newest owner message), `## Thread so far` (every `dm_messages` row of the root in ts order as `owner: …` / `bot: …`), `## Collected messages` (`0 messages in messages.jsonl`). `writeInputs(runDir, prompt string)` writes `prompt.md` and an empty `messages.jsonl` (0600).

`dispatcher.go`: `RunDispatcher(ctx, period time.Duration)` loops on a `time.Ticker` and `s.wake`, calling `Tick`. `Tick(ctx) error` in this child is `spawnQueued`: while `CountRunsByState(running) < 3`: `OldestQueued()` (by `queued_at`); none → return. `paths.EnsureWorkspace()`; write inputs; `handle, err := s.Runner.Start(ctx, agent.RunSpec{RunDir: s.Paths.RunDir(id), Approval: s.Agent.Approval, ExtraDirs: s.Agent.ExtraDirs, Timeout: s.Agent.Timeout})`; on error (including `agent.ErrBinaryMissing`) `FinishRun(id, failed, failure=err.Error())` and continue; else `MarkRunning(id, pid, pgid, os.Getpid(), started_at)` committed before any Slack call; if the stored ack text (`dm_messages` bot row with ts `ack_ts`) starts with `Queued behind`, `UpdateMessage(channel, ack_ts, "Working on it")`; `go s.deliver(ctx, run, handle.Wait())`. `Service` gains `Runner agent.Runner`; `daemon.Serve` builds `agent.NewRunner(adapter)` from `agent.Lookup(cfg.Agent.Command)` when `cfg.AgentEnabled()`, adds `background.Go(func() { svc.RunDispatcher(ctx, dispatcherPeriod) })`, and `daemon.Options` gains `DispatcherPeriod time.Duration` with `DefaultDispatcherPeriod = 5 * time.Second`.

`deliver.go`: `deliver(ctx, run, outcome)` for `kind = dm`: `ExitCode == 0 && !TimedOut && Result != ""` and `utf8.RuneCountInString(Result) <= 4000` → `UpdateMessage(channel, ack_ts, Result)`, `InsertDMMessage{author bot, text Result, run_id}`, `FinishRun(id, done, exit 0, result_source)`; a longer result: `UpdateMessage(ack, "Done")` then one `PostMessage` in the thread with the full text (a sibling adds chunking). Any other outcome: `FinishRun(id, failed, exit_code, timed_out, failure = "exit <code>" | "timed out after <Timeout>" | "agent wrote no result")` and no Slack call (a sibling adds the `Failed` reply). Post first, record after; no transaction spans a Slack call. Log `run <id>: result.md missing, answered from stdout` when `ResultSource == "stdout"`.

Db functions in `internal/db/assistant_runs.go`: `OldestQueued`, `MarkRunning`, `FinishRun(id, state string, exitCode int, timedOut bool, resultSource, failure, finishedAt string)`, `GetAssistantRun`.

Tests (`dispatcher_test.go`, `deliver_test.go`) with a `fakeRunner` recording `RunSpec`s and returning scripted `RunOutcome`s, fixed clock, fake `SlackSurface`: 4 queued → 3 `running`, fourth spawned after one delivers and its `Queued behind` ack edited to `Working on it`; short answer edits the ack and inserts the bot row; `prompt.md` contains the request text and a sentence from the skill text; exit 3 → row `failed` with `exit 3`; wake triggers a tick within 50 ms with a 10 s period. One `internal/cli` test drives a DM end to end through `daemon.Serve` with `Options.Inbound`, `DispatcherPeriod: 10ms`, `agent.command: omp` in config, and a `PATH` whose `omp` is a copy of `internal/agent/testdata/fake-agent.sh` (`FAKE_MODE=result`), asserting the `chat.update` text at the fake Slack server.

Proof: `go test -race ./internal/assistant ./internal/daemon ./internal/cli`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN a `queued` DM run exists and fewer than three rows are `running`, the dispatcher tick shall write `prompt.md` (embedded skill text, approval level, the request) and an empty `messages.jsonl` into `paths.RunDir(run_id)`, spawn the configured adapter, set the row `running` with `pid`, `pgid`, `daemon_pid`, `started_at`, and, for a row acked as `Queued behind`, edit that ack to `Working on it`.
- WHILE three rows are `running`, the tick shall spawn nothing, so the oldest `queued` row starts on the first tick after one of them finishes.
- WHEN the run exits 0 with a non-empty result of at most 4,000 characters, the daemon shall `chat.update` the ack to that text, insert `dm_messages{author bot, run_id}`, and set the row `done` with `finished_at`, `exit_code`, and `result_source`.
- WHEN a DM request is inserted, the wake channel shall make the dispatcher tick before its next timer period.
- IF the run exits non-zero, times out, or produces an empty result, THEN the daemon shall set the row `failed` with `failure` text and leave the ack unchanged.
