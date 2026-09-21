---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/124-code-review-safety-dance.md
reviewed_head_sha: c8f1773
fixed_head_sha: e2c5b5c
status: blocked
summary: "CR-402 and CR-405 are fixed: strict recovery now sweeps the completeness-checked process/CWD snapshot, and existing GitHub pull requests publish evidence through additive comments without replacing authored bodies. CR-401 and CR-404 still require an unforgeable OS or daemon capability, and CR-403 has no native Windows reparse-point execution proof; focused Go, race, vet, Windows cross-compilation, and root aggregate checks passed."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` remains the merge target; review 124 covered `c8f1773`, and this repair commit is `e2c5b5c`.
- unrelated changes preserved: existing `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` remain untouched.

## Finding Dispositions

### CR-401

- disposition: blocked
- evidence: Mutation authorization now also requires a complete ancestry ending at the verified root and a verified interactive shell, but this does not provide the required daemon-issued capability or OS containment identity after a validation descendant daemonizes and reparents.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon` passed; a daemonized-descendant capability regression remains required.

### CR-402

- disposition: fixed
- evidence: `SweepRunWorktreeStrict` now passes its completeness-checked process and CWD maps directly to `sweepSnapshot`; it no longer calls the best-effort API or re-enumerates processes between preflight and matching.
- files changed: `tools/safety-dance/internal/procreap/procreap.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/procreap` passed.

### CR-403

- disposition: blocked
- evidence: Windows evidence opens and resolves the managed root handle before opening the candidate, then compares the candidate handle path against the pinned root path and closes both handles on every branch. Native Windows reparse-point replacement execution and handle-level proof are unavailable in this checkout.
- files changed: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows.go`
- regression check: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps` passed; native replacement execution remains required.

### CR-404

- disposition: blocked
- evidence: Managed-hook checks now consume `SD_MANAGED_HOOK` when available and retain gate/ref process checks, but the authorization still relies on mutable process metadata and has no unforgeable per-gate capability or OS handle provenance.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/envmarker.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/git ./internal/daemon` passed; adversarial same-user forged-argv execution remains required.

### CR-405

- disposition: fixed
- evidence: Existing GitHub pull requests with evidence now use the additive `gh pr comment` surface through `scm.PRCommenter`; authored PR bodies are not read-then-replaced, and the dead conditional PATCH block was removed. Providers without the comment capability retain the existing conditional-update contract.
- files changed: `tools/safety-dance/internal/scm/host.go`, `tools/safety-dance/internal/scm/github/github.go`, `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/scm/... ./internal/pipeline/steps` passed; the full root aggregate passed with 137 tests.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: passed.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps -o /tmp/safety-dance-steps.test.exe && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon -o /tmp/safety-dance-daemon.test.exe`
- result: passed.
- command: `npm test`
- result: passed with 137 Node tests, identity scanning, Go race tests, vet, local end-to-end tests, and release-contract tests.
- code commit: `e2c5b5c` (`fix(safety-dance): preserve recovery and PR evidence boundaries`).

## Remaining Blocks

- CR-401 requires a daemon-issued mutation capability or OS containment identity that survives validation-descendant reparenting, with a built-binary regression.
- CR-403 requires native Windows reparse-point replacement and handle-level regression proof.
- CR-404 requires an unforgeable managed-hook capability or OS-verified receive-process provenance, with adversarial forged-argv coverage.
- Hosted release execution and authorized live-provider concurrency remain unavailable.
