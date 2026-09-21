---
type: code-review
date: 2026-09-21
branch: one-thing-i-m
base_branch: origin/main
base_sha: 1837afdde1ce8d17e892c379d39ef5e585e9dfc3
head_sha: 2e67fcdaf07045dfa0b95b264e43b89ec51c95dd
status: clean
summary: "The complete origin/main...HEAD routing diff satisfies the portable model-routing request, including configure-model-routing, cross-harness generation, transactional profile replacement, project-only verification, and deliver reachability. Prior Codex invocation, rollback-safety, and environment-shadowing findings are fixed; current checks pass with no actionable findings."
---

# Code Review

## Scope

- merge base: `origin/main` at `1837afdde1ce8d17e892c379d39ef5e585e9dfc3`
- reviewed HEAD: `2e67fcdaf07045dfa0b95b264e43b89ec51c95dd`
- commits: 36 commits after the merge base
- staged and unstaged changes: none before this artifact revision
- task-owned untracked files: none
- excluded changes: task artifacts under `.agents/tasks/one-thing-i-m/` were not implementation review subjects, except the task, plan, passed verification artifact, prior review artifacts, and PR description used as requirements and evidence

## Previous Round

- previous artifact: `13-code-review-one-thing-i-m.md`, revised in place for this review
- CR-001 changeset level disagreed with the approved plan: fixed
- CR-002 automatic Herdr Stop hook omitted native model arguments: fixed in `00dbe01`
- CR-003 standalone selective route-model installation had no usable JEV-unavailable path: fixed in `00dbe01` and covered by `tests/install.test.mjs`
- CR-004 standalone routing did not fall back when the helper lacked `systemOne`: fixed in `2f83f59` and covered by `tests/route-model.test.mjs`
- CR-005 Stop-hook cleanup could leak a created tab when its identity field was absent: fixed in `2f83f59` and covered by the Herdr contract test
- CR-006 Codex setup invocation used the slash form: fixed in `0c49c2b` across the skill, Codex adapter, and onboarding docs
- CR-007 profile replacement was not explicitly transactional: fixed in `0c49c2b` with same-directory temporary validation, atomic replacement, backup restore, and cleanup instructions
- CR-008 project verification could be shadowed by `SKILLS_MODEL_CANDIDATES_FILE`: fixed in `2b19167` with `--project-only` lookup and regression coverage

## Requirements and Standards

- task or ticket: `.agents/tasks/one-thing-i-m/task.md`
- implementation source: `.agents/tasks/one-thing-i-m/05-plan-one-thing-i-m.md`
- passed verification: `.agents/tasks/one-thing-i-m/08-verification-one-thing-i-m.md`
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`

## Change Profile

- intent and expected behavior: Provide one model-invoked configure-model-routing skill for Claude Code, Codex, Oh My Pi, Pi, and portable installs; ask one question at a time; support project and user profiles; restrict discovery; validate through route-model; preserve economy and exact-candidate routing policy; integrate deliver and onboarding; and keep Atomic and Herdr behavior on shared policy.
- change description quality: The task, plan, verification artifact, runtime adapters, model-routing contract, deliver skill, onboarding docs, and current implementation describe the same profile precedence, discovery limits, helper verification, transactional replacement, Codex invocation, and project-only lookup behavior.
- implementation model and review model: The shared Node helper owns lookup and routing policy. The configure skill owns the interactive setup procedure. Atomic, runtime adapters, deliver, Herdr, generated trees, and docs consume or point to those owners rather than adding a second selector.
- changed-line size and logical cohesion: 39 product and test files are in scope, centered on route-model, configure-model-routing, Atomic adaptation, runtime generation, Herdr handoff, documentation, and focused tests. Task artifacts are excluded from product size assessment.
- resulting large-file concerns: None.
- dependency or lockfile changes: None.

## Tests Reviewed First

- behavior claimed by tests: Exact candidate validation and expected-loss selection; economy policy; standalone fallback and Atomic fail-closed behavior; profile precedence and project-only lookup; configure-model-routing contract; Herdr arguments and cleanup; selective installation; isolated Atomic loading; generated runtime trees; and the complete repository suite.
- missing or misleading coverage: No current actionable gap was found. The transactional write and discovery behavior are specified in the skill contract and checked by focused contract assertions; native provider account availability and a live Atomic session remain caller-owned limits recorded by verification.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, 3052 tokens in / 73 out
- helper provenance: `judge: model jev-1.13.0, tokens 3052 in / 73 out`

### Correctness

- assessment and evidence: The configure skill requires one-question sequencing, explicit project or user scope, pre-write candidate validation, temporary-file helper validation, same-directory atomic replacement, backup restoration or removal on final verification failure, cleanup reporting, and prior-profile retention on pre-rename failure. Codex now uses `$configure-model-routing`; project verification passes `--project-only`, which bypasses the environment profile while normal user lookup retains environment precedence. The passed verification items A2-A5, A7-A10 and current route-model tests support the assessment.
- helper coverage: covered, level 3, confidence 0.90

### Readability and Simplicity

- assessment and evidence: Profile setup, lookup precedence, and routing remain separated: `configure-model-routing/SKILL.md` describes orchestration, `route-model.mjs` owns lookup and validation, and `atomic/lib/models.mjs` remains an adapter. The project-only flag is narrow and directly documents the exceptional verification path.
- helper coverage: covered, level 3, confidence 0.57

### Architecture

- assessment and evidence: All four generated runtime trees contain both routing skills, Codex receives the correct invocation form, and deliver/onboarding point users to setup. Atomic continues to delegate selection to route-model, while project-only lookup is implemented in the shared helper rather than duplicated in the setup skill. Passed verification items C3-C6, A1, A7, and A8 cover these boundaries.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: Profiles contain only caller-supplied model metadata; the skill explicitly excludes credentials, API keys, access tokens, cookies, headers, and provider configuration. Temporary and backup files remain in the target directory, and failures are reported instead of claiming successful setup. No private catalog scraping or proxy was added. Verification item A6 and direct inspection support this assessment.
- helper coverage: covered, level 3, confidence 0.73

### Performance

- assessment and evidence: Unknown, mutation, implementation, fixed, and single-candidate paths avoid JEV. Configure verification uses an unknown phase, so setup validation does not invoke JEV. The transactional sequence adds only bounded local filesystem operations and one helper verification.
- helper coverage: covered, level 3, confidence 0.51

## Verification Story

- command or inspection: `npm test`; `node scripts/validate.mjs`; `npm run check-commits -- origin/main..HEAD`; `git diff --check 005d810^ HEAD`; passed verification artifact `08-verification-one-thing-i-m.md`; direct inspection of the complete `origin/main...HEAD` diff, configure-model-routing, route-model, runtime adapters, deliver, Atomic integration, and generated-runtime requirements.
- result: Current `npm test` passed with 166 tests; validation passed; commit validation passed with 36 subjects; diff whitespace checks passed. The passed verification artifact records all 10 acceptance items as passed, including four generated runtime trees, project-only verification while an environment profile is set, transactional profile requirements, credential exclusion, deliver reachability, and Atomic delegation.
- manual, screenshot, or before-and-after evidence: No provider-account availability or native Atomic run was exercised. Candidate availability remains caller-supplied as documented.

## Critical and Required Findings

None.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: None.
- dependency findings: None.

## Verdict

- decision: approve
- overall code-health change: The diff establishes a single portable routing policy and a reachable setup path with explicit scope, discovery, validation, rollback, and credential boundaries. The follow-up fixes close the Codex invocation, transactional replacement, and environment-shadowing risks without weakening existing routing behavior.
- rationale: The complete pinned diff satisfies the task and plan, the passed verification artifact covers the requested acceptance items, and current checks pass with no concrete actionable finding.

## Review Limits

- blocked or unavailable checks: None.
- residual manual verification: Native Herdr argument acceptance, provider account availability, and live Atomic execution remain outside this repository's test environment.
