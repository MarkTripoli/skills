---
slug: running-rows-from-a
title: "running rows from a previous daemon pid are killed and reported as Failed"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-failed-dm-run
issue: 63
---
In `tools/slack-coordinator/internal/assistant/dispatcher.go`, add `reapOrphans(ctx)` as the first step of `Tick`: select `assistant_runs WHERE state='running' AND daemon_pid != ?` (this pid); for each, `syscall.Kill(-pgid, syscall.SIGKILL)` (log `ESRCH` and continue), `FinishRun(id, failed, ..., failure="daemon restarted")`, and for `kind = dm` call `deliverFailure(ctx, run, "daemon restarted", "")`. Task-kind rows only get the row update in this child (task delivery is a sibling). Also track live `*agent.Handle`s in the `Service` (map guarded by a mutex) so `RunDispatcher` kills every live group when `ctx` is done, before returning; `daemon.Serve` already cancels and waits for background loops.

Tests: insert a `running` row with `daemon_pid = 1` and a `pgid` of a process the test starts (`sleep` in its own group via `Setpgid`), run `Tick`, assert the process is dead, the row is `failed` with `daemon restarted`, and the fake Slack received the `Failed` edit and the reply; a row whose `pgid` is a nonexistent pid still ends `failed`; cancelling the dispatcher context kills a fake-runner handle (assert its `Kill` was called).

Proof: `go test -race ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN the dispatcher ticks and an `assistant_runs` row is `running` with `daemon_pid != os.Getpid()`, it shall send `SIGKILL` to `-pgid`, set the row `failed` with `failure = daemon restarted`, and for a DM run edit the ack to `Failed` and post `daemon restarted` in the thread.
- WHEN daemon shutdown begins, every `running` row's process group shall receive `SIGKILL` before `Serve` returns.
- IF the recorded `pgid` no longer exists, THEN the reap shall still mark the row `failed` and log the kill error.
