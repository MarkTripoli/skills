---
type: code-review
date: 2026-09-21
branch: we-need-do-something
base_branch: main
base_sha: b85f65b9657b3c30e0b9790e4cbbb51ac8dec7be
head_sha: 06d428d4e9c485789316cafadebcb4332bf282ba
status: clean
summary: "Reviewed the documentation-only slicing change (shared/SLICING.md plus four delivery SKILL.md files and one changeset) against merge base b85f65b. validate.mjs and sync-plugin.mjs --check pass, line 6 is unchanged in every edited skill, the corrected follower sentence is accurate, and no critical- or major-severity finding exists. One trivial advisory: create-epic-plan:27 introduces an em dash that WRITING.md bans. Next phase is /describe-pr."
---

# Code Review

## Scope

- merge base: `b85f65b9657b3c30e0b9790e4cbbb51ac8dec7be`
- reviewed HEAD: `06d428d4e9c485789316cafadebcb4332bf282ba`
- commits: 12 on `we-need-do-something` ahead of `main`; the product-code content is the slicing edits, the rest are task-artifact commits.
- staged and unstaged changes: none; tree clean except an untracked `.pi/` scratch directory (not a review subject).
- task-owned untracked files: none; the task directory is committed.
- excluded changes: the nine `.agents/tasks/we-need-do-something/*.md` artifacts (task memory, not review subjects).

Product code under review: `shared/SLICING.md`, `skills/delivery/create-epic-plan/SKILL.md`, `skills/delivery/create-plan/SKILL.md`, `skills/delivery/create-structure-outline/SKILL.md`, `skills/delivery/start-epic-delivery/SKILL.md`, `.changeset/slice-granular-pull-requests.md`.

## Previous Round

- previous artifact: none
- `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/we-need-do-something/task.md`; one change that makes the skills slice future work into granular, reviewable, testable, stackable pull requests.
- implementation source: `06-plan-issue-granularity.md` (type `plan`); verified against `08-verification-issue-granularity.md` (status `passed`, all 13 items `pass`).
- repository instructions: `AGENTS.md` (change boundaries for skill/template and installation edits), `shared/WRITING.md` (prose rules, including "No em dashes"), `shared/CONVENTIONS.md` (task/artifact/commit rules). `scripts/validate.mjs` is the mechanical contract.

## Change Profile

- intent and expected behavior: make `create-plan` a slicing-guide follower, add an advisory size signal to `shared/SLICING.md` and its followers, add a prefer-shared-contract-over-`depends_on` rule to `create-epic-plan`, and have `start-epic-delivery` cite the guide when re-validating a materialized slice without re-sizing. Documentation only; no runtime code, no new dependency.
- change description quality: the changeset body states the four edits in one patch entry; accurate and self-contained.
- implementation model and review model: implementation model not recorded (implementer inline; `07-implementation`); review performed by this session's model.
- changed-line size and logical cohesion: ~40 changed content lines across five files plus the changeset; one coherent documentation unit. Well within the slicing guide's own size signal.
- resulting large-file concerns: none; every edit is a localized sentence or section.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: none authored; the change is Markdown-only. The binding automated gates are `node scripts/validate.mjs` (layout, line-6 shared sentence, template shape, banned tokens) and `node scripts/sync-plugin.mjs --check` (generated plugin surface). Both pass at HEAD.
- missing or misleading coverage: `validate.mjs` does not assert the size-signal prose or follower wording; those are confirmed here by direct file inspection and grep, consistent with the plan's stated known limit. No test is warranted for prose edits.

## Five-Axis Assessment

- helper axis-coverage: model `jev-1.13.0`, tokens `3398` in / `73` out
- provenance: `judge: model jev-1.13.0, tokens 3398 in / 73 out`

### Correctness

- assessment and evidence: the corrected follower sentence in `shared/SLICING.md:3` names `create-epic-plan`, `create-structure-outline`, `create-plan`, `create-prd`; all four genuinely reference the guide (`create-plan/SKILL.md` read-inputs step and `create-prd/SKILL.md:23` confirmed), and `start-epic-delivery` is described separately as re-validating without re-sizing (`SLICING.md:4-5`, `start-epic-delivery/SKILL.md:20`). The old sentence is gone. `create-plan` gains both the guide link and a per-phase four-tests re-check with correct step renumbering (re-size step 4, write step 5). The size signal sits between `## The unit` and `## Four tests` and preserves the four tests as the only binding gate. `08-verification` records all 13 acceptance items `pass`; re-inspection at HEAD matches.
- helper coverage: covered, level 3, confidence 0.95

### Readability and Simplicity

- assessment and evidence: edits read directly and name the actor and action. The "using the table below" reference in `SLICING.md:14` resolves to the `## Splits that work` table later in the document; correct in reading order. No dead text, no added abstraction.
- helper coverage: covered, level 3, confidence 0.67

### Architecture

- assessment and evidence: `shared/SLICING.md` stays the single source of truth; the four followers reference it, matching the collection's existing shared-guide pattern. `start-epic-delivery` was correctly kept a re-validator, not made a four-tests follower, avoiding a duplicate sizing gate. The 200-400 line number is restated inline in two followers rather than referenced by name; see ADV-002.
- helper coverage: covered, level 3, confidence 0.97

### Security

- assessment and evidence: no code, inputs, secrets, or trust boundaries touched; documentation-only edits carry no security surface.
- helper coverage: covered, level 3, confidence 0.99

### Performance

- assessment and evidence: no runtime behavior changed; not applicable to prose edits.
- helper coverage: covered, level 3, confidence 0.97

## Verification Story

- command or inspection: `node scripts/validate.mjs`; `node scripts/sync-plugin.mjs --check`; `sed -n '6p'` on all four edited skills; `hexdump` of `create-epic-plan/SKILL.md:27`; grep for `200-400` and the follower/re-validation sentences.
- result: validate exits 0 (47 skills, 0 banned tokens, Atomic entry checked); sync exits 0 (in sync, version 3.3.0); line 6 is the shared writing-guide sentence in all four skills; the em dash at `create-epic-plan:27` is confirmed U+2014 and was absent at merge base.
- manual, screenshot, or before-and-after evidence: not applicable (no interface change).

## Critical and Required Findings

Gate: critical- or major-severity findings only.

`None.`

## Advisories

### ADV-001 Em dash violates WRITING.md

- type: Nitpick
- severity: trivial
- category: Maintainability and code quality
- location: `skills/delivery/create-epic-plan/SKILL.md:27`
- evidence: the new sentence reads "apply the guide's advisory size signal — a candidate that would change" with a U+2014 em dash (confirmed by hexdump `e2 80 94`); it was absent at merge base. `shared/WRITING.md` states "No em dashes." Only one other delivery skill (`iterate-evidence`) contains one, so this is not an established norm.
- suggestion: replace the em dash with a colon or a period plus a new sentence, for example "apply the guide's advisory size signal: a candidate that would change...".

### ADV-002 Size number duplicated inline in two followers

- type: Refactor suggestion
- severity: info
- category: Maintainability and code quality
- location: `skills/delivery/create-epic-plan/SKILL.md:27`, `skills/delivery/create-structure-outline/SKILL.md:21`
- evidence: the "200-400 lines" threshold is stated in `shared/SLICING.md:14` and restated inline in both followers, so a future change to the number requires three edits. The wording also drifts slightly ("roughly more than 200-400 lines" vs "roughly >200-400 changed lines").
- suggestion: acceptable as-is for fresh-context skills that cannot rely on the reader having opened the guide; if the number is expected to change, have the followers reference "the guide's advisory size signal" without restating the number.

## Dead Code and Dependency Review

- newly orphaned code: none; no code deleted or bypassed.
- dependency findings: none; no dependency or lockfile change.

## Verdict

- decision: approve
- overall code-health change: improves health. The slicing guide and its followers are now consistent (the previous follower sentence named skills that did not follow the guide and omitted one that does), and `create-plan` re-sizes per phase.
- rationale: the change satisfies the task and the plan's acceptance items, passes both mechanical gates, preserves line 6 everywhere, and carries no critical- or major-severity finding. The two advisories are non-blocking.

## Review Limits

- blocked or unavailable checks: none. The typed-judgment axis-coverage helper (`jev-1.13.0`) ran and returned `covered` at level 3 for all five axes.
- helper provenance: `judge: model jev-1.13.0, tokens 3398 in / 73 out`
- residual manual verification: none; the change is documentation-only and both mechanical gates plus direct inspection cover it.
