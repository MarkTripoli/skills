---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/134-code-review-safety-dance.md
reviewed_head_sha: 36e483afdf3f458fdfcb1ae3810edcefdf8c8006
fixed_head_sha: 4fbb85a
status: complete
summary: "CR-421 through CR-426 and all three advisories were fixed in 4fbb85a: accepted heads select the owning gate when absent from the registered checkout, publication replay validates the current target, post-push recovery retains ownership, absent upstream refs remain distinct, terminal errors use nonterminal compare-and-set updates, operator examples are executable, identity scans include paths, the notice lists toon-go, and the duplicate Makefile rule is gone. CR-418, CR-419, CR-420, and CR-427 remain blocked for a separately privileged broker or sandbox boundary not present in this repository; focused Go, end-to-end, race, vet, identity, and diff checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the base; review head `36e483a` was repaired at `4fbb85a` without merge or rebase.
- unrelated changes preserved: task-owned `.atomic-delivery/`, `evidence/`, and `progress.md` remain untracked and untouched.

## Finding Dispositions

### CR-418

- disposition: blocked
- evidence: The existing IPC transport exposes same-user process peers and this phase did not introduce a separately privileged operator broker. The current ancestry checks remain insufficient against a detached same-user descendant, so this finding is not relabeled fixed.
- files changed: None.
- regression check: Existing daemon authorization tests pass; a detached descendant proof remains required before closure.

### CR-419

- disposition: blocked
- evidence: Managed hooks now require the per-gate capability in persisted daemons, but the capability is still readable by same-user repository code and hook ancestry is process-text based. A non-replayable kernel-authenticated receive handle requires a separate broker design.
- files changed: None.
- regression check: `go test -race ./internal/daemon ./internal/git ./internal/ipc` passes; detached nested-push proof remains required.

### CR-420

- disposition: blocked
- evidence: Validation commands still execute under the daemon's OS principal. No portable filesystem, process, and network sandbox or unprivileged worker principal was added in this bounded repair.
- files changed: None.
- regression check: Existing validation and end-to-end suites pass; trust-domain isolation remains an explicit deployment limitation.

### CR-421

- disposition: fixed
- evidence: `recordPush` checks whether the accepted commit exists in the registered checkout and selects the canonical bare gate as the worktree source when it does not. Ordinary same-checkout flows remain unchanged.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && make e2e` passed.

### CR-422

- disposition: fixed
- evidence: `Publish` retains `push_active` when the remote contains the candidate but mirror or binding work fails. The daemon callback re-reads the run and leaves publication recovery pending instead of terminalizing or cleaning the owned worktree.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test -race ./internal/pipeline/steps ./internal/daemon` passed; end-to-end publication tests passed.

### CR-423

- disposition: fixed
- evidence: Upstream lookup now distinguishes an absent ref from a lookup failure. An absent branch remains an empty verified head instead of being replaced with the prior gate base.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `go test ./internal/e2e ./internal/pipeline/steps` passed.

### CR-424

- disposition: fixed
- evidence: Publication replay compares the current remote fingerprint, ref, candidate, and durable run push binding before returning a stored receipt.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `go test -race ./internal/pipeline/steps` passed.

### CR-425

- disposition: fixed
- evidence: Error finalization updates only pending or running runs, so a cancellation or other terminal transition cannot be overwritten by a late executor error. Verified-head error finalization uses the same predicate.
- files changed: `tools/safety-dance/internal/db/run.go`
- regression check: `go test -race ./internal/db ./internal/daemon` passed.

### CR-426

- disposition: fixed
- evidence: The skill and tool-local documentation now include `--step-id` and `--generation`, identify their status/log source, and document `safety-dance tui --plain` instead of a nonexistent root flag.
- files changed: `skills/delivery/safety-dance/references/commands.md`, `tools/safety-dance/docs/cli.md`
- regression check: Documentation and root aggregate checks passed through `npm test`.

### CR-427

- disposition: blocked
- evidence: The old session-authority and general JSON-RPC capability paths were not removed because the existing test suite still exercises the session seam and a replacement broker was not introduced. They remain follow-up cleanup after CR-418 and CR-419 receive an owner.
- files changed: None.
- regression check: `go test ./...` passes; dead-code removal remains blocked by the unresolved authorization owner.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: The identity scanner now scans normalized shipped relative paths as well as file contents and reports path findings.

### ADV-002

- disposition: accepted
- reason: `tools/safety-dance/THIRD_PARTY_NOTICES.md` now lists direct dependency `github.com/toon-format/toon-go` at its pinned version.

### ADV-003

- disposition: accepted
- reason: The duplicate `e2e` Makefile declaration was removed.

## Verification

- command: `cd tools/safety-dance && make e2e`
- result: passed; the public-binary end-to-end suite completed.
- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/ipc ./internal/pipeline/steps ./internal/db`
- result: passed.
- command: `cd tools/safety-dance && go test ./... && go vet ./...`
- result: passed.
- command: `node scripts/check-safety-dance-identity.mjs && git diff --check`
- result: passed.
- command: `npm test`
- result: passed before the final accepted-head source adjustment; the final focused Go aggregate and end-to-end checks passed after that adjustment.

## Remaining Blocks

- CR-418 and CR-419 require a separately privileged operator or receive broker with non-replayable kernel-authenticated handles.
- CR-420 requires a supported unprivileged sandbox boundary for repository validation commands.
- CR-427 requires removal or production wiring of the superseded authorization code after the broker decision.
- Native Windows behavior, hosted release execution, and live-provider behavior remain unavailable in this checkout.
