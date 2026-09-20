---
type: code-review
date: 2026-09-20
branch: i-want-you-help
base_branch: origin/main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 236b5017b68d425c32503441e5ea33f129402a85
status: findings
summary: "The complete repository-onboarding diff has three major findings. Invalid-JSON redaction now checks the wrong sentinel, concurrent regrading can treat an incomplete `latest` run as success, and required ambiguous-remote and migration-validation branches still lack behavioral evidence."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20`
- reviewed HEAD: `236b5017b68d425c32503441e5ea33f129402a85`
- commits: 60 commits after `origin/main`
- staged and unstaged changes: none after removing verification-generated `deno.lock`
- task-owned untracked files: none before this artifact
- excluded changes: `.agents/tasks/i-want-you-help/` artifacts were excluded from product-code findings.

## Previous Round

- previous artifact: `30-code-review-repository-onboarding.md`
- CR-010 Fail-closed branches lack behavioral evidence: fixed
- CR-011 Portable proof validates different bytes than installation: fixed

## Requirements and Standards

- task or ticket: `.agents/tasks/i-want-you-help/task.md`
- implementation source: `.agents/tasks/i-want-you-help/05-plan-repository-onboarding.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `docs/testing.md`

## Change Profile

- intent and expected behavior: Add an independently installable, idempotent `/setup-repository` skill with local-only ownership, fail-closed validation, safe reset, and future provider seams.
- change description quality: Artifacts state behavior and limits. Review 31's fix receipt accurately records the two added branches and portable parity, but misses the invalid-JSON assertion regression and active-run regrade race.
- implementation model and review model: Implementation model was not retained in initial artifacts. Review used `agent-implementation-reviewer`, `agent-codebase-analyzer`, and `openai/gpt-5.6-sol`; child-worker model identities were not exposed.
- changed-line size and logical cohesion: 35 product files, including the setup skill, terminal-eval infrastructure, portable build integration, fixtures, tests, docs, and release metadata.
- resulting large-file concerns: `evals/run.mjs` is 528 lines and `tests/evals-terminal-phase.test.mjs` is 451 lines. No blocking split was found.
- dependency or lockfile changes: none; a verification-generated untracked `deno.lock` was removed before saving this artifact.

## Tests Reviewed First

- behavior claimed by tests: 180 offline tests cover installation, portable byte parity, metadata/provider contracts, snapshots, Git privacy, retained grading, and concurrent run-directory isolation. Live evidence now covers seven safety phases.
- missing or misleading coverage: Invalid-JSON redaction excludes a sentinel from another fixture. No test regrades `latest` while a live run is incomplete. The plan's ambiguous-remote, schema-1 revision-0, and invalid-version branches remain unexercised against the model-executed skill.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, second pass tokens 3226 in / 73 out

### Correctness

- assessment and evidence: CR-011 portable parity is fixed and earlier snapshot/concurrency protections remain. CR-013 permits a zero-phase false green; CR-014 leaves required behavior without executable evidence.
- helper coverage: covered, level 3, confidence 0.96

### Readability and Simplicity

- assessment and evidence: Ordered skill steps, typed snapshot records, and shared portable construction remain direct. The single shared `redactedSentinel` name obscures that two fixtures contain different values.
- helper coverage: covered, level 2, confidence 0.68

### Architecture

- assessment and evidence: Portable CLI and installer now share `buildPortable()`. Eval publication still exposes an in-progress run as the canonical completed target, conflating allocation with publication.
- helper coverage: covered, level 2, confidence 0.64

### Security

- assessment and evidence: Secret-shaped managed-key evidence now passes, but CR-012 silently removes invalid-JSON source-redaction proof by checking an unrelated value.
- helper coverage: covered, level 2, confidence 0.52

### Performance

- assessment and evidence: Each eval copies the selected skill and fixture trees once into its private run directory, snapshots each throwaway repository once before and after a terminal phase, and runs independent scenarios through `Promise.all`. Run-directory allocation performs one exclusive `mkdirSync` per occupied same-second suffix; it does not rescan trees or retry completed work. Portable parity adds only a test-time recursive comparison over two selected skills. No hot production path, network loop, unbounded payload retention, or task-caused scalability regression was found.
- helper coverage: covered, level 3, confidence 0.96

## Verification Story

- command or inspection: Focused 48-test suite; `npm test`; portable build/validation; Node/Deno checks; commit validation; current source/fixture inspection; independent active-run `--grade latest` reproduction.
- result: 180 tests and 44-skill portable validation passed. A synthetic leaking invalid-JSON answer still satisfies the current phase check, and active-run regrading exits 0 after printing `not recorded`.
- manual, screenshot, or before-and-after evidence: No interface changed. Prior live evidence covers seven safety phases but not CR-014's required branches.

## Critical and Required Findings

### CR-012 Invalid-JSON redaction assertion is inert

- type: Potential issue
- severity: major
- category: Security and privacy
- location: `evals/scenarios/setup-repository-safety.mjs:71`
- failure mode: The skill may quote invalid JSON source bytes, including its embedded sensitive value, while the safety scenario passes.
- evidence or reproduction: The invalid fixture contains `phase-three-secret-value` at `evals/fixtures/setup-repository-safety/invalid-json/ai-utilities.json:4`. The assertion excludes only `non-secret-test-sentinel`, defined for the valid secret-shaped fixture. Supplying an otherwise valid answer containing `phase-three-secret-value` returns no phase failures.
- fix direction: Use distinct constants matching each fixture and add an offline scenario-check regression proving a leaking invalid-JSON answer fails.

### CR-013 Active latest run can regrade as success

- type: Potential issue
- severity: major
- category: Stability and availability
- location: `evals/run.mjs:512`
- failure mode: `--grade latest` can target an in-progress run, find no `answer.md`, grade zero phases, and exit 0. Release automation can report a false green.
- evidence or reproduction: The runner publishes `latest` before scenarios start. `gradeScenario()` breaks on missing `answer.md` without marking the result failed or skipped, and the final exit status ignores zero completed phases. A delayed mock OMP reproduced exit 0 with `1-setup-repository: not recorded` while the live run remained active.
- fix direction: Publish `latest` atomically only after `summary.json` is complete, and make incomplete explicitly selected recordings non-green. Add a concurrent live-run/regrade regression.

### CR-014 Required model branches lack behavioral evidence

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `evals/scenarios/setup-repository-basic.mjs:23`
- failure mode: The model-executed skill can guess provider choices for ambiguous remotes, mishandle schema-1 revision-0 migration, or write after invalid managed versions without a release gate detecting it.
- evidence or reproduction: Plan acceptance lines 183-188 and 349-355 require unresolved inference, lower-revision migration, and invalid-version blocking. Existing basic evidence always uses one GitHub remote; migration evidence only uses schema 0/revision 0; safety evidence covers newer schema and a secret key but no missing, non-integer, negative, or unsupported version pair.
- fix direction: Add focused terminal phases/fixtures for no or ambiguous supported remote, schema 1/revision 0, and representative invalid version/type state. Assert exact metadata, unchanged foreign state or bytes, conflict evidence, no temporary files, and zero external operations.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: no dependency or lockfile changes

## Verdict

- decision: request_changes
- overall code-health change: Requested behavior is present, but security and completion gates can still pass without proving their claims.
- rationale: CR-012 and CR-013 are direct false-green paths. CR-014 leaves explicit plan acceptance branches unverified for a model-executed implementation.

## Review Limits

- blocked or unavailable checks: LSP rejects the external task-worktree path. Node, Deno, focused, aggregate, portable, live-receipt, and commit evidence were used instead.
- residual manual verification: Authenticated provider behavior remains intentionally deferred and unclaimed.
