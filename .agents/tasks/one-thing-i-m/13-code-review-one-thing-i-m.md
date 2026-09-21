---
type: code-review
date: 2026-09-21
branch: one-thing-i-m
base_branch: origin/main
base_sha: 1837afdde1ce8d17e892c379d39ef5e585e9dfc3
head_sha: 4091674e7dc0dd78e38d85792911a97381dd49d3
status: clean
summary: "The complete origin/main...HEAD routing diff satisfies the revised portable-routing plan and the passed verification artifact. Earlier release, Herdr, standalone fallback, helper-shape, and Stop-hook cleanup findings are fixed; no current critical, major, or advisory findings remain."
---

# Code Review

## Scope

- merge base: `origin/main` at `1837afdde1ce8d17e892c379d39ef5e585e9dfc3`
- reviewed HEAD: `4091674e7dc0dd78e38d85792911a97381dd49d3`
- commits: 30 commits after the merge base
- staged and unstaged changes: none before this artifact
- task-owned untracked files: none
- excluded changes: task artifacts under `.agents/tasks/one-thing-i-m/` were not implementation review subjects, except the task, revised plan, passed verification artifact, prior review findings, and PR description used as requirements and evidence

## Previous Round

- previous artifact: `11-code-review-one-thing-i-m.md`
- CR-001 changeset level disagreed with the approved plan: fixed
- CR-002 automatic Herdr Stop hook omitted native model arguments: fixed in `00dbe01`
- CR-003 standalone selective route-model installation had no usable JEV-unavailable path: fixed in `00dbe01` and covered by `tests/install.test.mjs`
- CR-004 standalone routing did not fall back when the helper lacked `systemOne`: fixed in `2f83f59` and covered by `tests/route-model.test.mjs`
- CR-005 Stop-hook cleanup could leak a created tab when its identity field was absent: fixed in `2f83f59` and covered by the Herdr contract test

## Requirements and Standards

- task or ticket: `.agents/tasks/one-thing-i-m/task.md`
- implementation source: `.agents/tasks/one-thing-i-m/05-plan-one-thing-i-m.md`
- passed verification: `.agents/tasks/one-thing-i-m/08-verification-one-thing-i-m.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`

## Change Profile

- intent and expected behavior: Route eligible non-mutating phases through one exact-candidate JEV helper across portable harnesses and Atomic, keep economy policy for implementation and unknown phases, enforce native Herdr model arguments when available, and preserve fail-closed Atomic behavior.
- change description quality: The task, revised plan, PR description, runtime guidance, model-routing contract, and passed verification artifact describe the same portable helper, profile precedence, candidate boundaries, fallback distinction, and Atomic delegation.
- implementation model and review model: Implementation is in the shared Node helper, with Atomic as an adapter and shell/skill runtime handoffs as consumers; review was performed inline with focused tests and full-suite checks.
- changed-line size and logical cohesion: 35 files are in scope, with the product changes centered on one helper, its Atomic adapter, runtime handoffs, documentation, and focused tests. Task artifacts are excluded from product size assessment.
- resulting large-file concerns: None.
- dependency or lockfile changes: None.

## Tests Reviewed First

- behavior claimed by tests: Candidate validation, expected-loss selection, profile precedence, standalone fallback, Atomic `requireJev` fail-closed behavior, installed Atomic loading, Herdr argument contracts, selective installation, runtime validation, and the complete repository suite.
- missing or misleading coverage: No current gap was found. The Stop-hook shell path is covered by syntax validation and static contract assertions; native Herdr/provider execution and account availability remain documented caller-owned limits.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, 2747 tokens in / 73 out

### Correctness

- assessment and evidence: `route-model.mjs` validates exact candidates, preserves economy for mutation and unknown phases, falls back only for standalone JEV unavailability, and rejects the same failures with `requireJev`. Atomic always passes `requireJev: true`; the Stop hook routes before pane creation and appends `-- --model` only after successful configured routing. Focused tests and the passed verification items A1-A9 cover these paths.
- helper coverage: covered, level 3, confidence 0.97

### Readability and Simplicity

- assessment and evidence: Policy ownership is consolidated in `skills/delivery/route-model/route-model.mjs`; `atomic/lib/models.mjs` adapts inputs instead of duplicating selection logic. The Stop hook has explicit routing, cleanup, and native-argument branches.
- helper coverage: covered, level 3, confidence 0.55

### Architecture

- assessment and evidence: Installed Atomic resolves the helper from the installed skills directory, selective portable installs remain independent, and runtime documentation keeps catalog discovery caller-owned. The passed verification items A2, A3, A5, and A10 match the changed ownership boundaries.
- helper coverage: covered, level 3, confidence 0.89

### Security

- assessment and evidence: Candidate identifiers and descriptions are caller-supplied, credentials remain in the typed-judgment environment/key path, task routing records do not include credentials, and provider-private catalog scraping or proxy interception is absent. The passed verification item A11 and direct inspection support this assessment.
- helper coverage: covered, level 3, confidence 0.70

### Performance

- assessment and evidence: JEV is skipped for mutation, implementation, tool-oriented, unknown, fixed, and single-candidate phases. The Stop hook routes before creating panes, so failed profile or required-JEV checks do not allocate Herdr resources.
- helper coverage: covered, level 3, confidence 0.73

## Verification Story

- command or inspection: `npm test`; `node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs tests/install.test.mjs`; `bash -n skills/delivery/herd-next/references/stop_hook.sh`; `git diff --check origin/main...HEAD`; `npm run check-commits -- origin/main..HEAD`; direct inspection of the complete diff, revised plan, passed verification artifact, runtime paths, and installed Atomic path.
- result: Full suite passed with 165 tests; focused routing, Atomic, and installer tests passed; shell syntax and diff whitespace checks passed; 30 commit subjects passed. The passed verification artifact records all 11 acceptance items as passed, including four generated runtime trees.
- manual, screenshot, or before-and-after evidence: No native provider-account or live Atomic session was run; caller-supplied availability remains the documented limit.

## Critical and Required Findings

None.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None.
- dependency findings: None.

## Verdict

- decision: approve
- overall code-health change: The diff establishes one portable routing policy, keeps Atomic and standalone failure behavior distinct, and documents the harness boundaries without adding a proxy or provider registry dependency.
- rationale: The complete pinned diff satisfies the task and revised plan; prior findings are fixed with focused coverage, and no current concrete actionable issue remains.

## Review Limits

- blocked or unavailable checks: None.
- residual manual verification: Native Herdr argument acceptance, provider account availability, and live Atomic execution remain outside this repository's test environment.
