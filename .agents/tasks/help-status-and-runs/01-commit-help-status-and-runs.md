---
type: commit
summary: "One feat commit adds the owner-DM verb dispatcher with !help, !status, and !runs plus the four db count/list queries and their tests; nothing was left unstaged."
---

# Commit Receipt

## Task
- slug: help-status-and-runs
- implementation artifact: none (oneshot; implemented in the deliver session)

## Git State
- branch: help-status-and-runs
- before: da39e89
- after: 77c5c5c

## Commits
- hash: 77c5c5c
- subject (Conventional Commits, validated): `feat(slack-coordinator): answer !help, !status, !runs in the owner DM`
- files:
  - tools/slack-coordinator/internal/assistant/verbs.go (new: `verb`, `verbTable`, `runVerb`, `help`, `status`, `runs`, byte helpers)
  - tools/slack-coordinator/internal/assistant/verbs_test.go (new)
  - tools/slack-coordinator/internal/assistant/router.go (`routeDM` dispatches top-level `!` DMs; `!` thread replies stay dropped)
  - tools/slack-coordinator/internal/assistant/service.go (`Paths`, `started`, `verbs`; `New` takes `*paths.Paths`)
  - tools/slack-coordinator/internal/assistant/router_test.go (test db now lives at `Paths.DB()` under a temp root)
  - tools/slack-coordinator/internal/assistant/requests_test.go (drop test no longer expects owner `!status` to be silent)
  - tools/slack-coordinator/internal/daemon/daemon.go (passes `p` to `assistant.New`)
  - tools/slack-coordinator/internal/db/tasks.go (new: `Task*` state constants, `CountTasksByState`)
  - tools/slack-coordinator/internal/db/collected_messages.go (new: `CountCollectedMessages`)
  - tools/slack-coordinator/internal/db/assistant_runs.go (`CountAssistantRuns`)
  - tools/slack-coordinator/internal/db/runs.go (`ActiveRuns`; no existing query listed all active runs, each filtered further on `slack_mode`)
  - tools/slack-coordinator/internal/db/db_test.go (`TestStatusCountsFilterByStateAndLifecycle`)

## Decisions taken without asking
- `CountTasksByState(ctx, state)` mirrors the existing `CountRunsByState(ctx, state)` shape (one query per state) rather than a `GROUP BY` map, keeping one convention in `internal/db`.
- `!status` reads Socket Mode through a nil-safe wrapper: a coordinator without `Health` reads `not_started`, the same reading `CheckBeforeWrite` uses, instead of panicking on `s.Coord.Health()`.
- Uptime is `time.Duration.String()` truncated to seconds (`up 1h30m0s`); byte sizes are 1024-based with one decimal (`2.0 KB`, `12.3 MB`) and `n B` below 1 KB.
- The `!help` table is wrapped in a Slack code fence so its columns align; the closing sentence follows the fence.
- An owner `!` message posted as a thread reply is still dropped (unchanged from before); only top-level `!` DMs dispatch, per the request.
- `!tasks`, `!show`, `!pause`, `!resume`, `!cancel` are registered in the verb map and answer `not available yet`, so they do not fall through to `!help`.
- `docs/slack-coordinator.md` does not yet describe the owner-DM assistant at all (the earlier children left it for the epic), so this child adds no partial section either.

## Verification
- command: `cd tools/slack-coordinator && go build ./... && go vet ./internal/assistant ./internal/db ./internal/daemon && go test ./internal/assistant ./internal/db`
- result: build and vet clean; `ok internal/assistant`, `ok internal/db`. New tests ran and passed: TestHelpListsEveryVerb, TestUnknownVerbAndBareBangAnswerWithHelp, TestVerbDispatchIgnoresCase, TestStatusReportsTheDaemon, TestStatusWithoutAgentOrWorkspace, TestRunsListsActiveRunsOnly, TestVerbsWriteNoRows, TestStatusCountsFilterByStateAndLifecycle. Formatters, linters, and `npm test` were skipped as the task directs.

## Skipped Files
None. The task directory receives this receipt in its own `docs(task)` commit.
