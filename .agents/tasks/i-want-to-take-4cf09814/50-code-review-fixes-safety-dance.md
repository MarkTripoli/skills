---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 49-code-review-safety-dance.md
reviewed_head_sha: ba710021eadf4079ec870cf2a8c39c05c533bd59
fixed_head_sha: e55db18
status: complete
summary: "This repair pass fixes the pull-request stage name, interrupted pre-push recovery, daemon service shutdown, Windows cross-compilation, worktree creation journaling, and legal-notice enforcement. Managed-hook identity, typed production validation owners, Windows mutation authorization, durable step-input binding, and full global policy routing remain blocked; the Safety Dance aggregate and root npm test pass."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed head was `ba71002`; fixes landed at `e55db18`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` paths were not modified.

## Finding Dispositions

### CR-124

- disposition: blocked
- evidence: Managed hooks now pass their exact hook path through `SD_MANAGED_HOOK`, and admission checks that path against the gate's installed hook paths while retaining parent-run rejection. A same-user process can still forge the environment marker, and complete OS-authenticated executable and receive-process ancestry proof is not implemented.
- files changed: `tools/safety-dance/internal/git/hook.go`, `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test ./internal/daemon ./internal/git`

### CR-125

- disposition: blocked
- evidence: The `pull-request` name mismatch is fixed, but production validation still dispatches configured shell commands rather than the imported typed agent, provider, response, and CI owners. The required production-path owner wiring remains unimplemented.
- files changed: `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline ./internal/pipeline/steps`

### CR-126

- disposition: fixed
- evidence: A surviving `push_active` claim now compares the live head with the candidate and the previously verified head. If the live head is still the verified pre-push head, the claim is released and publication can retry; a divergent head remains fail-closed.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test ./internal/pipeline/steps`

### CR-127

- disposition: blocked
- evidence: Shutdown now uses build-tagged cross-platform process signaling and `GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance` passes. Windows mutation authorization still lacks authenticated process-environment and ancestry inspection, so the supported Windows runtime contract is not fully repaired.
- files changed: `tools/safety-dance/internal/cli/daemon.go`, `tools/safety-dance/internal/cli/signal_unix.go`, `tools/safety-dance/internal/cli/signal_windows.go`, `tools/safety-dance/internal/cli/term_unix.go`, `tools/safety-dance/internal/cli/term_windows.go`
- regression check: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`

### CR-128

- disposition: blocked
- evidence: Worktree creation now writes a pending journal before `git worktree add`, removes it only after HEAD verification, and startup sweeps pending journals. Cleanup itself still lacks a durable removing state and complete crash-recovery state machine.
- files changed: `tools/safety-dance/internal/worktrees/ownership.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/worktrees ./internal/daemon ./internal/e2e`

### CR-129

- disposition: blocked
- evidence: Completed-step reuse remains status-only. Candidate, policy, owner, command, and validation-generation fingerprints are not durably stored and compared.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/pipeline`

### CR-130

- disposition: blocked
- evidence: Existing command merging remains in place, but global agent/provider and publication settings are not all routed through the production executor and typed owners.
- files changed: None.
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/config`

### CR-131

- disposition: fixed
- evidence: `daemon stop` stops the exact installed service definition before attempting authenticated IPC shutdown, preventing KeepAlive services from immediately relaunching the daemon.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test ./internal/cli ./internal/daemon`

### CR-132

- disposition: fixed
- evidence: The identity scanner now requires the imported copyright line in addition to the MIT and permission markers. The identity fixture constructs that line from fragments, and mutation tests continue to cover incomplete notices.
- files changed: `scripts/check-safety-dance-identity.mjs`, `tests/safety-dance-identity.test.mjs`
- regression check: `node scripts/check-safety-dance-identity.mjs && node --test tests/safety-dance-identity.test.mjs`

## Advisory Decisions

### ADV-001

- disposition: left_advisory
- reason: Unused Go dependencies were not changed because typed owner wiring remains blocked; running `go mod tidy` before that wiring settles could remove dependencies still required by the intended imported owners.

## Verification

- command: `npm run test:safety-dance`
- result: Passed. Identity scan, Go race tests, vet, temporary build, and release-contract tests passed.
- command: `npm test`
- result: Passed. Validation, plugin sync, 136 Node tests, and the Safety Dance aggregate passed.
- command: `cd tools/safety-dance && GOOS=windows GOARCH=amd64 go build ./cmd/safety-dance`
- result: Passed; the source-tree Windows binary was removed after the check.
- command: `git diff --check`
- result: Passed before the code commit.

## Remaining Blocks

- CR-124: Complete authenticated managed-hook executable and Git receive ancestry proof, including Windows.
- CR-125: Route production stages through typed validation, agent, provider, response, and CI owners.
- CR-127: Implement Windows mutation transport and ancestry authentication, or remove the Windows runtime support promise.
- CR-128: Add durable cleanup/removal state and startup recovery for every worktree lifecycle transition.
- CR-129: Bind completed-step reuse to durable candidate and trusted-policy inputs.
- CR-130: Route global agent/provider and publication policy through the production executor and responsible owners.
- Hosted release execution, live provider behavior, and Windows runtime verification remain unavailable.
