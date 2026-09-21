---
type: code-review-fixes
date: 2026-09-20
branch: safety-dance
review_artifact: 61-code-review-safety-dance.md
reviewed_head_sha: ccbdded66f32eabd83099a003fbe84da20f87b20
fixed_head_sha: 23a101b
status: complete
summary: "CR-175, CR-176, CR-177, CR-178, CR-179, CR-180, CR-181, CR-183, CR-185, CR-186, CR-187, and CR-188 were addressed in the Safety Dance runtime. Admission rejects nested-run markers, receipts survive delayed receive completion, stale notifications are ignored, startup recovery precedes reconciliation, uncertain pushes are reconciled, orphan-gate insertion rollback restores snapshots, Windows tasks receive a valid schedule, PR targets are persisted and checked, CLI exit classes and durable prompts are exposed, legal-boundary scanning is stricter, and setup/TUI fields are surfaced. CR-182 remains blocked because non-GitHub provider hosts are not implemented; CR-184 remains blocked because typed evidence is schema-validated but not yet persisted as a durable step record."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: The reviewed head was `ccbdded`; code repairs advanced the branch through `479b249` and `23a101b`. The merge base remains `4458fbf21e199dad45376b8164f78c2165ac1d20`.
- unrelated changes preserved: Existing untracked `.agents/tasks/i-want-to-take-4cf09814/.atomic-delivery/` and `evidence/` directories were not staged or changed.

## Finding Dispositions

### CR-175

- disposition: fixed
- evidence: Managed-hook ancestry now rejects `SD_PARENT_RUN_ID` in command text or decoded environment markers before issuing a token. Existing hook and receive ancestry checks remain required.
- files changed: `tools/safety-dance/internal/daemon/admission.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon`

### CR-176

- disposition: fixed
- evidence: Receipt reconciliation no longer deletes a receipt while the admitted ref is absent or temporarily old. The receipt remains available for post-receive delivery after pre-receive and preserved-hook execution completes.
- files changed: `tools/safety-dance/internal/daemon/admission.go`, `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon ./internal/cli`

### CR-177

- disposition: fixed
- evidence: Push notification handling compares the gate ref with the notification's accepted SHA before replacing a branch run, so a delayed older notification cannot supersede the current ref's run.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`

### CR-178

- disposition: fixed
- evidence: Receipt reconciliation now starts only after configured-root worktree recovery and durable manager recovery complete.
- files changed: `tools/safety-dance/internal/cli/daemon.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/worktrees`

### CR-179

- disposition: fixed
- evidence: A push error is reconciled against the remote with a bounded non-cancelled context. If the candidate landed, publication continues to mirror and durable binding instead of treating the cancelled run as unpublished.
- files changed: `tools/safety-dance/internal/pipeline/steps/push.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps`

### CR-180

- disposition: fixed
- evidence: Database insertion failure now restores the complete pre-provision gate snapshot before preserving or removing the gate directory according to prior ownership.
- files changed: `tools/safety-dance/internal/gate/gate.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/gate`

### CR-181

- disposition: fixed
- evidence: Windows scheduled-task creation now supplies `/SC ONLOGON` and `/RL LIMITED` in addition to the task action and force flag.
- files changed: `tools/safety-dance/internal/daemon/service.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/daemon && GOOS=windows GOARCH=amd64 go test -c ./internal/daemon`

### CR-182

- disposition: blocked
- evidence: The centralized SCM factory still fails closed for non-GitHub providers. GitLab, Bitbucket, Azure DevOps, Forgejo, and Gitea host implementations are outside this repair round and remain required before those advertised provider paths can execute.
- files changed: None.
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/scm`

### CR-183

- disposition: fixed
- evidence: The resolved PR base branch is persisted before provider lookup. Existing PRs expose their live base when supported and are retargeted only through the provider's explicit retargeter; unsupported retargeting fails closed.
- files changed: `tools/safety-dance/internal/db/run.go`, `tools/safety-dance/internal/pipeline/steps/pr.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/db ./internal/pipeline/steps ./internal/cli`

### CR-184

- disposition: blocked
- evidence: Typed validation now requires verdict, findings, and evidence in its structured schema and rejects missing evidence. The current step owner does not yet persist the validated output and attempt/output references into a durable step record, so the full requirement remains blocked.
- files changed: `tools/safety-dance/internal/pipeline/steps/validation.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/pipeline/steps`

### CR-185

- disposition: fixed
- evidence: The CLI maps usage, daemon-unavailable, rejected, blocked, and generic run failures to stable classes 2, 3, 4, 6, and 5, while allowing explicit `ExitCodeError` values to override classification.
- files changed: `tools/safety-dance/internal/cli/root.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`

### CR-186

- disposition: fixed
- evidence: Status now prints awaiting step names and valid response actions alongside each run, allowing the distributed command guidance to discover the durable prompt before calling `respond`.
- files changed: `tools/safety-dance/internal/cli/status.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli`

### CR-187

- disposition: fixed
- evidence: The identity scanner checks permission and software notice fragments, permits only the root project license and the allowlisted Safety Dance license, and excludes its own scanner/test source from self-matches. Outside copied permission text remains a finding.
- files changed: `scripts/check-safety-dance-identity.mjs`
- regression check: `node scripts/check-safety-dance-identity.mjs && npm run test:safety-dance`

### CR-188

- disposition: fixed
- evidence: The public wizard now prompts for upstream, gate, provider, commands, and service in order. The shared TUI semantic model and renderer expose publication and key-control hints in every width mode.
- files changed: `tools/safety-dance/internal/cli/wizard.go`, `tools/safety-dance/internal/tui/model.go`, `tools/safety-dance/internal/tui/view.go`
- regression check: `cd tools/safety-dance && go test -race ./internal/cli ./internal/tui ./internal/wizard`

## Advisory Decisions

None.

## Verification

- command: `cd tools/safety-dance && go test -race ./... && go vet ./...`
- result: Passed.
- command: `npm run test:safety-dance`
- result: Passed identity scan, full Go race suite, vet, temporary binary build, and release-contract tests.
- command: `git diff --check`
- result: Passed for the repair changes.

## Remaining Blocks

- CR-182 requires concrete non-GitHub SCM host implementations and provider-backed integration tests.
- CR-184 requires durable persistence of typed findings, evidence, attempts, and output references.
- Hosted Windows service execution, live provider-backed PR/CI behavior, and hosted `safety-dance-v*` release execution remain unavailable.
