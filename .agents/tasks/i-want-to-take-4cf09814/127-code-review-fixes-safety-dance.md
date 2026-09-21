---
type: code-review-fixes
date: 2026-09-21
branch: safety-dance
review_artifact: .agents/tasks/i-want-to-take-4cf09814/126-code-review-safety-dance.md
reviewed_head_sha: 4c81b88997aeb3394255016c91e51f7e1a321fa2
fixed_head_sha: fca4597
status: blocked
summary: "CR-406 and CR-407 are fixed by requiring kernel process-session continuity for mutation peers and removing the forgeable managed-hook environment marker. CR-408 has a Windows junction regression test and cross-compilation proof, but native Windows execution remains unavailable; origin/main also advanced since the review and requires re-review against the moved base."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: `origin/main` advanced beyond the review base while `safety-dance` remains two commits behind it; the repair commit is `fca4597`.
- unrelated changes preserved: `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/`, `.agents/tasks/i-want-to-take-4cf09814/evidence/`, and `progress.md` remain untouched.

## Finding Dispositions

### CR-406

- disposition: fixed
- evidence: `AuthorizeMutationPeer` now binds the verified shell ancestry to the kernel-reported process session of the IPC peer. A daemonized descendant that reparents into a different session is rejected, while the existing parent-run marker and complete-ancestry checks remain enforced.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/session_unix.go`, `tools/safety-dance/internal/daemon/session_windows.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: `go test -race ./internal/daemon` passed; `make e2e` passed with the built `safety-dance` binary and exercised authenticated mutation control.

### CR-407

- disposition: fixed
- evidence: managed-hook authorization no longer reads `SD_MANAGED_HOOK` or any caller-controlled environment path. Hook scripts no longer set that marker; authorization requires the managed hook path in the OS-reported ancestry together with `git-receive-pack`.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/daemon/envmarker.go`, `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/daemon/admission_test.go`
- regression check: the adversarial environment-marker test and `go test -race ./internal/daemon ./internal/git` passed.

### CR-408

- disposition: blocked
- evidence: Windows-specific `evidence_open_windows_test.go` now creates a junction to an outside directory and asserts that confined evidence reading rejects the escape. The Windows test binary cross-compiled successfully, but this Linux checkout cannot execute the native reparse-point race and handle-level test.
- files changed: `tools/safety-dance/internal/pipeline/steps/evidence_open_windows_test.go`
- regression check: `GOOS=windows GOARCH=amd64 go test -c ./internal/pipeline/steps -o /tmp/safety-dance-steps.test.exe` passed; native Windows execution remains unavailable.

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/git ./internal/pipeline/steps && go vet ./...`
- result: passed.
- command: `cd tools/safety-dance && make e2e`
- result: passed, including the built-binary smoke path.
- command: `npm test`
- result: passed with 137 Node tests, identity scanning, Go race tests, vet, local end-to-end tests, and release-contract tests.
- code commit: `fca4597` (`fix(safety-dance): harden hook and mutation authorization`).

## Remaining Blocks

- CR-408 requires native Windows junction/reparse-point replacement execution and handle-level proof.
- `origin/main` moved after the reviewed base; the complete resulting diff must be reviewed against the current merge target.
- Hosted release execution and authorized live-provider concurrency remain unavailable.
