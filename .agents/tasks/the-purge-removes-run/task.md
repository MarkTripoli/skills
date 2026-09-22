---
slug: the-purge-removes-run
title: "the purge removes run directories of deleted and orphaned runs"
workflow: oneshot
created: 2026-09-22
parent: slack-assistant-bot-dms
base: epic-slack-assistant-bot-dms
depends_on:
  - a-daily-purge-deletes
issue: 70
---
In `tools/slack-coordinator/internal/assistant/purge.go`, after `Purge` commits: for each returned id `os.RemoveAll(s.Paths.RunDir(id))`; then `os.ReadDir(filepath.Join(s.Paths.Workspace(), "runs"))` (absent directory → nothing) and for each entry whose name has no row (`AssistantRunExists(id)` in `internal/db/assistant_runs.go`) `RemoveAll` it. Log each failure with `slog.Error("run directory not removed", "path", ..., "error", ...)` and continue; the next daily run repeats the scan. Report the removed count in the purge log line.

Tests in `purge_test.go`: directories for two deleted runs, one orphan, and one live run exist before; after `RunPurge`'s tick the first three are gone and the live one remains; a directory made unremovable (a read-only parent, skipped when running as root) is logged and left, and the tick returns without error.

Proof: `go test ./internal/assistant`. Skip formatters, linters, and the full `npm test`.

## Acceptance criteria

- WHEN `Purge` returns deleted run ids, the daemon shall `RemoveAll` `workspace/runs/<id>/` for each of them.
- WHEN the purge scans `workspace/runs`, it shall remove every directory whose name has no `assistant_runs` row and keep every directory that has one.
- IF a directory removal fails, THEN the purge shall log the path and error and retry it on the next daily run.
