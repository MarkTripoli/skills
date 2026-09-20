---
task: i-want-to-take-4cf09814
type: verification
summary: "Repository checks passed except two required aggregate commands, which failed after the public-binary build left a generated executable in the source tree for the validator to scan. Verification failed because `init`, mutation commands, daemon lifecycle, publication durability, recovery, and the promised pipeline, end-to-end, CLI, wizard, service, and TUI scenario tests are incomplete or absent. The next implementation phase must address the failed items and rerun every check against the full working tree."
status: failed
revision: 7b90756
target: origin/main
---

# Verification

## Run

- Revision: `7b90756` on `safety-dance`; uncommitted Safety Dance source directories, `tools/safety-dance/Makefile`, `.atomic-delivery/`, and retained verification evidence are present.
- Target: `origin/main`; 102 files changed at `HEAD`, 19 of them test, fixture, or check files.
- Checks from: `package.json`, `tools/safety-dance/Makefile`, `.github/workflows/commits.yml`, and `.github/workflows/safety-dance-release.yml`.
- Coverage: 27 acceptance items; 22 claimed by a receipt, 5 claimed by none.
- Graded by: typed-judgment helper (`grade-steps --kind command` and `grade-steps --kind diff`); model `jev-1.13.0`, tokens `9771` in / `1316` out for commands and `6372` in / `687` out for diffs. Deterministic exit codes and exact output contradictions took precedence; unclear rows named under Known limits were decided by hand.

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Root aggregate test. | `npm test` | Exits 0 with no failing test. | Exit 0; validation found 44 skills and 0 banned tokens, plugin sync passed, and 136 tests passed. | pass | 1.00 | 0 |
| C2 | Safety Dance aggregate test. | `npm run test:safety-dance` | Exits 0 with no failing test. | Exit 0; identity, Go race, vet, build, and two release tests passed; the build wrote an untracked source-tree binary. | pass | 1.00 | 0 |
| C3 | Runtime build. | `npm run build -- --runtime claude-code --dest <temp>` | Exits 0. | Exit 0; built 44 skills and 7 workers. | pass | 1.00 | 0 |
| C4 | Commit CI check. | `npm run check-commits -- origin/main..HEAD` | Exits 0. | Exit 0; 22 subjects passed. | pass | 1.00 | 0 |
| C5 | Go test target. | `cd tools/safety-dance && make test` | Exits 0 with no failing test. | Exit 0; current packages passed, with many reporting no test files. | pass | 1.00 | 0 |
| C6 | Go race target. | `cd tools/safety-dance && make test-race` | Exits 0 with no failing test. | Exit 0; current packages passed under the race detector. | pass | 1.00 | 0 |
| C7 | Go lint target. | `cd tools/safety-dance && make lint` | Exits 0. | Exit 0; `go vet ./...` printed no diagnostics. | pass | 1.00 | 0 |
| C8 | Local end-to-end target. | `cd tools/safety-dance && make e2e` | Exits 0. | Exit 0; `internal/e2e` passed, though its only test has an empty body. | pass | 1.00 | 0 |
| C9 | Go build target. | `cd tools/safety-dance && make build` | Exits 0. | Exit 0; `go build ./...` completed. | pass | 1.00 | 0 |
| T1 | `.github/workflows/safety-dance-release.yml`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added tag validation, five native targets, packaging, checksums, and release upload; no check was removed or skipped. | pass | 0.82 | 0 |
| T2 | `scripts/check-safety-dance-identity.mjs`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added scoped identity scanning, binary/task exclusions, and one legal-license allowlist. | pass | 0.86 | 0 |
| T3 | `scripts/validate.mjs`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Excluded task history and accounted for the added skill; existing validation categories remain. | pass | 0.85 | 0 |
| T4 | `tests/install.test.mjs`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added all-runtime and portable install, reference, preservation, uninstall, adaptation, plugin, and non-worker assertions. | pass | 0.89 | 0 |
| T5 | `tests/safety-dance-identity.test.mjs`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added legal/task exclusion, path-and-line finding, and missing-license cases; none skipped. | pass | 0.88 | 0 |
| T6 | `tests/safety-dance-release.test.mjs`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added tag/matrix and executable archive/checksum tests; none skipped. | pass | 0.89 | 0 |
| T7 | `internal/config/config_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added unknown-global-key and repository-default cases; none skipped. | pass | 0.88 | 0 |
| T8 | `internal/daemon/admission_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added authenticated admission, replay, mismatch, and notification assertions. | pass | 0.88 | 0 |
| T9 | `internal/daemon/daemon_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added singleton ownership coverage; none skipped. | pass | 0.89 | 0 |
| T10 | `internal/daemon/hook_e2e_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added executable hook admission, preserved input, notification, replay, and mismatch coverage; skips only without Unix shell/IPC. | pass | hand | 0 |
| T11 | `internal/daemon/manager_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added same-branch supersession assertions; none skipped. | pass | 0.87 | 0 |
| T12 | `internal/db/db_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added accepted-ref and guarded-transition conflict coverage. | pass | 0.91 | 0 |
| T13 | `internal/gate/gate_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added initialization, repair, move/copy, preservation, cleanup, hook isolation, and credential-redaction coverage. | pass | 0.88 | 0 |
| T14 | `internal/git/hook_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added script, preservation, tamper, notification, push-option, hooks-path, worktree, and install coverage with capability-only skips. | pass | 0.81 | 0 |
| T15 | `internal/git/testdata/hook-helper/main.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this fixture's strength. | Added a test-only adapter for admission and notification that rejects unsupported commands. | pass | hand | 0 |
| T16 | `internal/ipc/ipc_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added gate/ref token binding and single-use coverage. | pass | 0.89 | 0 |
| T17 | `internal/paths/paths_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added root, repository, worktree, log, environment, default, and directory-creation cases. | pass | 0.87 | 0 |
| T18 | `internal/worktrees/worktrees_test.go`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added ownership recording and unknown-directory preservation cases. | pass | 0.89 | 0 |
| T19 | `tools/safety-dance/scripts/package-release.sh`. | `git diff origin/main...HEAD -- <path>` | The change keeps this check's strength. | Added platform executable naming, archive creation, and checksum output. | pass | 0.90 | 0 |
| A1 | Desired gate flow; `05-plan-safety-dance.md:48-49`, claimed: no. | Temporary repositories, built binary, `safety-dance init`, then `git remote get-url safety-dance`. | Init creates the local gate remote and enables authenticated durable branch runs. | Init exited 0, then Git exited 2: `error: No such remote 'safety-dance'`. | fail | 1.00 | 3 |
| A2 | Public mutation and daemon controls; `05-plan-safety-dance.md:52`, claimed: no. | Built binary: `safety-dance run`; `safety-dance daemon start`. | Mutation and lifecycle commands operate through authenticated IPC. | Run exited 1 with `daemon admission is unavailable`; daemon start only printed `daemon start requested`. | fail | 1.00 | 3 |
| A3 | Guarded durable publication; `05-plan-safety-dance.md:50-51`, claimed: no. | Source observation plus focused-test inventory. | Publication follows reviewed head, live head, explicit lease, published-ref verification, mirror update, durable binding, and replay-safe recovery. | Live-head and lease code exists, but push-active persistence, mirror update, binding, recovery owner, and focused tests are absent. | fail | hand | 3 |
| A4 | Phase 1 race packages; `05-plan-safety-dance.md:177`, claimed: yes. | Exact plan command. | Command passes. | Exit 0; listed packages passed, while types had no tests. | pass | 1.00 | 0 |
| A5 | Phase 1 focused gate checks; `05-plan-safety-dance.md:178`, claimed: yes. | Exact plan command. | Command passes. | Exit 0. | pass | 1.00 | 0 |
| A6 | Phase 1 focused hook checks; `05-plan-safety-dance.md:179`, claimed: yes. | Exact plan command. | Command passes. | Exit 0. | pass | 1.00 | 0 |
| A7 | Phase 1 executable admission checks; `05-plan-safety-dance.md:180`, claimed: yes. | Exact plan command. | Command passes. | Exit 0 under the race detector. | pass | 1.00 | 0 |
| A8 | Phase 2 race packages; `05-plan-safety-dance.md:276`, claimed: yes. | Exact plan command. | Command passes. | Exit 0; custody had no test files. | pass | 1.00 | 0 |
| A9 | Phase 2 branch coordination; `05-plan-safety-dance.md:277`, claimed: yes. | Exact plan command plus test inventory. | Tests prove same-branch, different-branch, restart, singleton, and supersession behavior. | Exit 0, but only singleton and same-branch supersession tests match; different-branch and restart cases are absent. | fail | hand | 2 |
| A10 | Phase 2 worktree custody; `05-plan-safety-dance.md:278`, claimed: yes. | Exact plan command plus test inventory. | Tests prove ownership, cleanup, recovery, and preservation. | Exit 0; ownership and preservation cases exist, but no focused recovery case exists. | fail | hand | 2 |
| A11 | Phase 3 race packages; `05-plan-safety-dance.md:385`, claimed: yes. | Exact plan command. | Agent, branchsync, and pipeline tests pass. | Exit 0, but every listed package reported `[no test files]`. | fail | 1.00 | 2 |
| A12 | Phase 3 publication boundary; `05-plan-safety-dance.md:386`, claimed: yes. | Exact plan command. | Focused reviewed-head, remote-head, lease, published-ref, mirror, binding, and cancellation tests pass. | Exit 0 with `[no test files]`; no focused test matched. | fail | hand | 3 |
| A13 | Phase 3 end-to-end scenarios; `05-plan-safety-dance.md:387-389`, claimed: yes. | `cd tools/safety-dance && make e2e` plus test observation. | Local upstream scenarios cover success and every stale, failed, superseded, cancelled, lease, and restart case. | Exit 0, but the only e2e test is `func TestLocalFixture(t *testing.T) {}`. | fail | 1.00 | 3 |
| A14 | Phase 4 race coverage; `05-plan-safety-dance.md:488`, claimed: yes. | Exact plan command. | CLI, wizard, TUI, and service tests pass. | Exit 0; CLI, wizard, and TUI had no test files, and daemon reported no service tests to run. | fail | 1.00 | 3 |
| A15 | Phase 4 built-binary flow; `05-plan-safety-dance.md:489,492`, claimed: yes. | Exact plan command. | Built binary completes the temporary-repository gate flow. | Exit 0, but `make e2e` ran only the empty fixture test. | fail | 1.00 | 3 |
| A16 | Phase 4 vet; `05-plan-safety-dance.md:490`, claimed: yes. | Exact plan command. | Command passes. | Exit 0 with no diagnostics. | pass | 1.00 | 0 |
| A17 | Phase 5 aggregate; `05-plan-safety-dance.md:558`, claimed: yes. | Exact plan command. | Validation, plugin sync, and installer tests pass. | Exit 1; validation reported 17 banned-token matches in the generated source-tree binary. | fail | 1.00 | 2 |
| A18 | Phase 5 runtime matrix; `05-plan-safety-dance.md:559`, claimed: yes. | Exact plan command. | Four builds include the skill and exclude a worker. | Exit 0; all four builds and assertions passed. | pass | 1.00 | 0 |
| A19 | Phase 6 identity and root aggregate; `05-plan-safety-dance.md:638`, claimed: yes. | Exact plan command. | Identity enforcement and `npm test` pass. | Exit 1; identity passed, then validation found 17 banned-token matches in the generated source-tree binary. | fail | 1.00 | 2 |
| A20 | Phase 6 Go aggregate; `05-plan-safety-dance.md:639`, claimed: yes. | Exact plan command. | Race, vet, and public build pass. | Exit 0; the build wrote `tools/safety-dance/safety-dance` into the source tree. | pass | 1.00 | 0 |
| A21 | Phase 6 release contract; `05-plan-safety-dance.md:640`, claimed: yes. | Exact plan command. | Release tests pass. | Exit 0; 2 tests passed. | pass | 1.00 | 0 |
| A22 | Phase 6 generated metadata; `05-plan-safety-dance.md:641`, claimed: yes. | Exact plan command. | Plugin is synchronized and named paths have no diff. | Exit 0; plugin sync passed and the diff was empty. | pass | 1.00 | 0 |
| A23 | Product identity; `05-plan-safety-dance.md:16-30,671`, claimed: yes. | `node scripts/check-safety-dance-identity.mjs` after generated-output cleanup. | No retired identity exists outside the legal notice. | Exit 0 with no findings. | pass | 1.00 | 0 |
| A24 | Hosted release evidence; `05-plan-safety-dance.md:647-649`, claimed: no. | Not in this environment: no hosted tag run exists. | A real tag produces cross-platform assets and verified checksums. | No hosted workflow or release evidence was available. | untested | hand | 0 |
| A25 | Live provider behavior; `05-plan-safety-dance.md:679`, claimed: no. | Not in this environment: provider credentials and an external run are unavailable. | Live pull-request and CI integrations work. | No live provider run was available. | untested | hand | 0 |
| A26 | Imported legal notice; `05-plan-safety-dance.md:96`, claimed: yes. | Fetch upstream `LICENSE`, then `cmp` with the local file. | Notice is unchanged. | Exit 0; files were byte-identical. | pass | 1.00 | 0 |
| A27 | Skill and release distribution; `05-plan-safety-dance.md:556-561,614-617`, claimed: yes. | Four-runtime matrix and release-contract tests. | Supported installs receive a non-worker skill and assets follow the product contract. | Matrix exited 0 with no worker files; 2 release tests passed. | pass | 1.00 | 0 |

## Findings

- A1: temporary repository and built binary; expected gate remote creation and durable gate flow (`05-plan-safety-dance.md:48-49`); observed `error: No such remote 'safety-dance'`; severity 3.
- A2: built `safety-dance run` and `safety-dance daemon start`; expected authenticated IPC mutation and lifecycle control (`05-plan-safety-dance.md:52`); observed `daemon admission is unavailable` and `daemon start requested`; severity 3.
- A3: publication source and test observation; expected mirror reconciliation, durable binding, push-state custody, and replay-safe recovery (`05-plan-safety-dance.md:50-51`); observed those owners and tests are absent; severity 3.
- A9: focused daemon command; expected different-branch and restart coverage (`05-plan-safety-dance.md:277`); observed no matching tests for those behaviors; severity 2.
- A10: focused worktree command; expected recovery coverage (`05-plan-safety-dance.md:278`); observed no focused recovery test; severity 2.
- A11: Phase 3 race command; expected tested agent, branchsync, and pipeline behavior (`05-plan-safety-dance.md:385`); observed every package printed `[no test files]`; severity 2.
- A12: focused publication command; expected reviewed-head through cancellation coverage (`05-plan-safety-dance.md:386`); observed `[no test files]`; severity 3.
- A13: `make e2e`; expected the failure and recovery matrix (`05-plan-safety-dance.md:387-389`); observed only an empty `TestLocalFixture`; severity 3.
- A14: Phase 4 race command; expected CLI, wizard, TUI, and service coverage (`05-plan-safety-dance.md:488`); observed no test files or no tests to run; severity 3.
- A15: built-binary e2e command; expected a temporary repository to exercise the public command (`05-plan-safety-dance.md:489,492`); observed the empty fixture only; severity 3.
- A17: Phase 5 aggregate command; expected exit 0 (`05-plan-safety-dance.md:558`); observed validation exit 1 with 17 banned-token matches in `tools/safety-dance/safety-dance`; severity 2.
- A19: Phase 6 identity and aggregate command; expected exit 0 (`05-plan-safety-dance.md:638`); observed validation exit 1 with the same 17 generated-binary matches; severity 2.

## Missing

None.

## Human Review

### Review targets

- Review the Items table and every entry under Findings.
- Confirm generated build output cannot invalidate a later aggregate check or remain in product source.

### Verify

- [ ] Run `npm test`; it exits 0 with 136 passing tests.
- [ ] Run `npm run test:safety-dance`; it exits 0 without leaving build output in product source.
- [ ] Run `npm run build -- --runtime claude-code --dest <temp>`; it exits 0.
- [ ] Run `npm run check-commits -- origin/main..HEAD`; it exits 0, and check the PR title when one exists.
- [ ] Run `cd tools/safety-dance && make test`; it exits 0.
- [ ] Run `cd tools/safety-dance && make test-race`; it exits 0.
- [ ] Run `cd tools/safety-dance && make lint`; it exits 0.
- [ ] Run `cd tools/safety-dance && make e2e`; it exits 0 with non-empty scenario coverage.
- [ ] Run `cd tools/safety-dance && make build`; it exits 0.
- [ ] Re-decide A1 with a temporary working repository and upstream; `safety-dance init` creates the gate remote and an authenticated push creates a durable run.
- [ ] Re-decide A2 with the built binary; run, respond, abort, and daemon lifecycle commands mutate through authenticated IPC.
- [ ] Re-decide A3 by observing the publication path and restart; mirror reconciliation and durable binding occur in order without replay.
- [ ] Re-decide A9 with focused different-branch and restart tests.
- [ ] Re-decide A10 with a focused missing-worktree recovery test.
- [ ] Re-decide A11 and A12 with real Phase 3 tests rather than `[no test files]`.
- [ ] Re-decide A13 with the complete local remote scenario matrix.
- [ ] Re-decide A14 and A15 with focused CLI, wizard, TUI, service, and built-binary end-to-end tests.
- [ ] Re-run A17 and A19 after a binary build; both aggregate commands exit 0 without scanning generated source output.
- [ ] Re-decide A24 from a real `safety-dance-v*` hosted release with all asset names and checksums.
- [ ] Re-decide A25 with credentialed live provider pull-request and CI fixtures.
- [ ] Re-decide T10: platform skips remain limited to unavailable Unix shell or IPC behavior.
- [ ] Re-decide T15: the hook helper remains test-only and rejects unsupported commands.

### Known limits

- A24 and A25 are untested because hosted release execution and live provider credentials are unavailable locally.
- A3, A9, A10, A12, T10, and T15 were unclear to the helper and were decided by hand from the recorded observations.
- The tree contains pre-existing uncommitted `.atomic-delivery/`, `tools/safety-dance/Makefile`, and multiple Safety Dance source directories; checks ran against that tree.
- `go build ./cmd/safety-dance` wrote `tools/safety-dance/safety-dance`. A byte-identical copy is retained at `evidence/verification-generated-output/safety-dance` with SHA-256 `a821de4960a27fc7acca0be9467fa15c0b54a63384925bf077bedd16ec7f5812`; the unexpected source copy was removed after its failed checks were recorded.
- No pull request exists for `safety-dance`, so C4 could not check a pull-request title.
