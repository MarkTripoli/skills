---
date: 2026-09-22T01:48:21Z
git_commit: c0ceada5a88d59057d66b1449b3d87fc787217fc
branch: we-need-do-something
repository: skills
topic: "How the delivery skills decompose work and decide task/PR granularity today"
type: research
summary: "Documents where this collection decides slicing and PR granularity today: shared/SLICING.md defines one unit = one pull request with four tests (one obligation, one vertical slice, one day, safe to merge alone) and a split table. create-epic-plan is the only skill that cuts work into separately mergeable children, sizes each against the four tests, and routes/sizes them with the typed-judgment helper; create-structure-outline sizes phases against the same guide; create-prd reuses only its one-obligation acceptance rule. create-plan inherits phase granularity from the outline and does not reference SLICING. start-epic-delivery materializes children into task dirs, computes dependency waves, and files issues, but re-validates slice fields rather than linking SLICING. PR-size expectations live as prose (reviewer-in-one-sitting, one-day, review-code's ~100/~300/~1000 heuristic), not a line-count target like the inspiration repo's 200-400. A later phase uses this to decide where to strengthen granularity and stacking rules."
tags: [research, codebase]
status: complete
---

# Research: How the delivery skills decompose work and decide task/PR granularity today

**Date**: 2026-09-22T01:48:21Z
**Git Commit**: c0ceada5a88d59057d66b1449b3d87fc787217fc
**Branch**: we-need-do-something
**Repository**: skills

## Research Question

1. In `skills/delivery/create-epic-plan`, how is an epic decomposed into child tasks, and what determines each child task's number, size, workflow type, and dependencies?
2. The collection keeps slicing and sizing rules in `shared/SLICING.md`. Which delivery skills reference that guide, and how does each one use its four tests and split table?
3. In `skills/delivery/create-structure-outline`, how is work broken into phases today, and what granularity or sizing criteria are applied to each phase?
4. In `skills/delivery/create-plan`, how does the plan artifact express implementation units or tasks, including their structure, identifiers, and granularity?
5. `shared/CONVENTIONS.md` documents task, artifact, and commit conventions. What does it state about task, artifact, and commit granularity, and about the relationship between a child task and a pull request?
6. `skills/delivery/start-epic-delivery` creates child task directories from an approved epic plan. How does it create those directories and handoffs, and how does it determine the first ready wave and dependencies?
7. Across the delivery skills, how are pull-request size, reviewability, and stacking expectations currently documented or enforced?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

Sources examined: `shared/SLICING.md`, `shared/CONVENTIONS.md`, and the `SKILL.md` files plus reference templates for `create-epic-plan`, `create-structure-outline`, `create-plan`, `start-epic-delivery`, `create-prd`, `review-code`, and `describe-pr`. A repository-wide `grep` fixed which skills reference `SLICING`. The task's `01-sources-engineering-standards.md` supplied the external inspiration repo for comparison but is not the subject; findings below are the collection's own current state.

### Known limits

- None.

## Summary

Granularity in this collection is defined in one place and applied by a small set of skills. `shared/SLICING.md` states the governing rule — "One unit of work is one pull request" — and gives four decidable tests (one obligation, one vertical slice, one day, safe to merge alone), a symptom→split table, EARS acceptance patterns, and a `depends_on` rule (`shared/SLICING.md:1-72`).

`create-epic-plan` is the only skill that actually cuts work into separately mergeable child tasks. It lists the behaviors an epic delivers, makes each behavior one candidate child, sizes every candidate against the four tests, splits failures by their named symptom, and writes EARS acceptance per child; it then calls the typed-judgment helper to check each child's `workflow` (`route-workflow`) and size (`size-children`) (`skills/delivery/create-epic-plan/SKILL.md:22-46`). A child's number is emergent — one child per independently mergeable change, not a preset count. Size is the four tests, workflow is a per-child field validated by the helper, and dependencies are a minimal `depends_on` list.

`create-structure-outline` sizes each *phase* against the same slicing guide but produces sequential phases inside one task, not separate pull requests (`skills/delivery/create-structure-outline/SKILL.md:24-31`). `create-prd` links the guide only to enforce one-obligation, observable-outcome behavior records — not the four tests or split table (`skills/delivery/create-prd/SKILL.md:23`). `create-plan` does **not** reference `SLICING`; it expands the outline's phases one-to-one into `## Phase N` sections and inherits their granularity (`skills/delivery/create-plan/SKILL.md:36-44`).

`start-epic-delivery` turns an approved epic plan into one task directory per child, computes dependency waves (wave 1 = children with no dependencies), files one GitHub issue per child wave-by-wave, and hands off only the first ready wave (`skills/delivery/start-epic-delivery/SKILL.md:26-53`).

PR-size and stacking expectations are prose, not a line-count gate: SLICING's reviewer-in-one-sitting / one-day tests, `create-epic-plan`'s "ship as separate pull requests," `review-code`'s `~100/~300/~1000` heuristic, and `describe-pr`'s "Reviewable in one pass." Stacking is expressed structurally through `depends_on`, epic-branch `base`, waves, and feature flags rather than a documented stacked-diff mechanism.

## Detailed Findings

### 1. `create-epic-plan` cuts an epic into one independently mergeable child per behavior, sized against the slicing guide

The skill's stated purpose is to "Split an epic into child tasks that ship as separate pull requests" (`skills/delivery/create-epic-plan/SKILL.md:10`). The decomposition procedure is:

- **Cut by behavior, not layer.** Step 4 lists "the behaviors the epic delivers in the order a caller meets them, and make each behavior one candidate," and names the shared contract (schema, endpoint shape, module seam) so siblings build against it in parallel (`skills/delivery/create-epic-plan/SKILL.md:25`).
- **Size against the four tests.** Step 5 sizes "every candidate against the slicing guide's four tests: one obligation, one vertical slice, one day, safe to merge alone," splits each failing candidate "using the split its symptom names in the guide," re-runs the tests, and records evidence per child in `## Slice Check` (`skills/delivery/create-epic-plan/SKILL.md:27`).
- **EARS acceptance.** Step 6 writes each child's acceptance criteria as EARS sentences with one behavior each, observable state, and the child's failure/boundary paths (`skills/delivery/create-epic-plan/SKILL.md:29`).

What determines each attribute:

| Attribute | Determined by |
|---|---|
| Number of children | Emergent: "One child per independently mergeable change" — not a preset count (`skills/delivery/create-epic-plan/SKILL.md:40`) |
| Size | The four slicing tests, re-run after any split (`skills/delivery/create-epic-plan/SKILL.md:27`) |
| Workflow type | Per-child `workflow` field (`full`/`lean`/`prd`/`oneshot`/`bugfix`), then `route-workflow` helper check (`skills/delivery/create-epic-plan/SKILL.md:46,53`) |
| Dependencies | Minimal `depends_on` of sibling names whose merged PR the child needs (`skills/delivery/create-epic-plan/SKILL.md:47`) |

Each child entry carries `name`, `workflow`, `slice`, `depends_on`, `acceptance`, and `prompt`, plus `flag` when a flag guards the merge (`skills/delivery/create-epic-plan/SKILL.md:41`). `slice` is `vertical` (ends at user/caller-exercisable behavior) or `enabler` (stops at a layer boundary and must name a consuming sibling); "an epic of only enablers is a horizontal batch and gets recut" (`skills/delivery/create-epic-plan/SKILL.md:42`).

The Output section adds two typed-judgment passes. Step 3 checks each child's `workflow` via `judge.mjs route-workflow --children`, adopting the helper's answer when `confidence` ≥ 0.8 unless the request named the workflow (`skills/delivery/create-epic-plan/SKILL.md:53`). Step 4 sizes children via `judge.mjs size-children --children`, and for a `split` verdict applies the named split and replaces the child (`skills/delivery/create-epic-plan/SKILL.md:54`). Both degrade to the skill's own judgment when the helper is unavailable. The template holds `## Children` (JSON fence), `## Slice Check`, `## Ordering` (waves), `## Workflow judgments`, and `## Sizing judgments` sections (`skills/delivery/create-epic-plan/references/epic_plan_template.md:24-70`).

#### Testing patterns

No automated tests found for this skill. Validation is self-checking prose: Output step 2 re-checks every child against the Child Rules (`name` ≤120 chars, `prompt` ≤10000 chars, `workflow` in the allowed set, `slice` valid with every enabler consumed, `acceptance` one to five single-obligation EARS sentences, `depends_on` acyclic and referencing existing siblings) and fixes violations in the file before replying (`skills/delivery/create-epic-plan/SKILL.md:52`).

### 2. Four skills relate to `SLICING.md`, but only two apply its four tests as sizing gates

A repository-wide search for `SLICING` returns `create-prd`, `create-epic-plan`, `create-structure-outline`, and the `typed-judgment` skill/helper. `SLICING.md` itself claims a wider set of followers: "`create-epic-plan`, `start-epic-delivery`, `create-structure-outline`, and `create-prd` follow it" (`shared/SLICING.md:3`) — note this list includes `start-epic-delivery` and omits `create-plan`, while the actual link appears in `create-prd`, `create-epic-plan`, and `create-structure-outline` only. How each relates:

| Skill | Links `SLICING`? | How it uses the four tests / split table |
|---|---|---|
| `create-epic-plan` | Yes (`SKILL.md:17`) | Sizes every candidate child against all four tests; splits by the symptom's named split; re-runs tests (`SKILL.md:27`) |
| `create-structure-outline` | Yes (`SKILL.md:21`) | Sizes each phase against the four tests; splits a failing phase by its symptom (`SKILL.md:21`) |
| `create-prd` | Yes (`SKILL.md:23`) | Uses only the one-obligation / observable-outcome rule to record each behavior; not the four tests or split table |
| `start-epic-delivery` | No link | Re-validates the epic plan's `slice` field values but references no guide (`SKILL.md:20`) |
| `create-plan` | No | Does not reference SLICING; inherits phase granularity from the outline |
| `typed-judgment/judge.mjs` | Yes (in code) | Backs the `size-children` question `create-epic-plan` calls |

`SLICING.md` supplies the four tests (`shared/SLICING.md:13-16`), a symptom→split table including "one layer changed for every feature at once … this is horizontal batching, not slicing" (`shared/SLICING.md:29`), EARS acceptance patterns (`shared/SLICING.md:33-51`), and the `depends_on` rule that "a shared shape is not a dependency" (`shared/SLICING.md:53-55`).

#### Testing patterns

No tests found. `shared/SLICING.md` is a prose guide with no executable checks of its own; its tests are applied by the skills above and by `judge.mjs size-children`.

### 3. `create-structure-outline` breaks work into sequential phases, each sized against the four tests but shipped within one task

Step 4 directs "smallest useful views per phase," each phase producing "a verifiable increment crossing necessary layers," and explicitly forbids layer-batching: "Do not batch the whole schema, then the whole API, then the whole UI, then tests. Avoid batching by layer; prefer smallest working flow" (`skills/delivery/create-structure-outline/SKILL.md:19`). Step 5 sizes "each phase against the slicing guide … one obligation, one vertical slice, one day of work, and safe to land alone," splits a failing phase by its symptom, and states the phase's done condition "as the observable state its validation command or check decides, never as work performed" (`skills/delivery/create-structure-outline/SKILL.md:21`). Step 6 emits a checkbox per phase for implementation tracking (`skills/delivery/create-structure-outline/SKILL.md:22`).

The template captures this as a `## Phase Checklist` (`- [ ] Phase N`) plus per-phase `## Phase N` sections with Change Outline and Validation (Automated Verification / Deferred human evidence) (`skills/delivery/create-structure-outline/references/structure_outline_template.md:19-59`). The granularity criteria are identical to `create-epic-plan`'s four tests; the difference is that outline phases are sequential steps within a single task/pull request, whereas epic children are separate pull requests.

#### Testing patterns

No automated tests found. Validation is the per-phase Automated Verification commands the outline itself must list, plus the self-check in the Output/Human Review sections of the template.

### 4. `create-plan` expresses units as numbered `## Phase N` sections inheriting the outline's granularity

`create-plan` "expands the structure outline into a detailed implementation plan," and is "the last artifact before implementation" (`skills/delivery/create-plan/SKILL.md:10`). It "Convert[s] each structure-outline phase into implementation steps" (`skills/delivery/create-plan/SKILL.md:29`). The unit structure is:

- **`## Phase N: [title]`** sections, each with `### Goal`, `### Required Edits:` (numbered `#### N.1 [Area to modify]`), and `### Success Criteria:` split into `#### Automated Verification:` and `#### Deferred human evidence (recorded, not a gate):` (`skills/delivery/create-plan/references/plan_template.md:40-72`).
- **Identifiers** are the phase number and sub-numbered edits (e.g. `1.1`). When the primary input is a TDD, each `## Phase N` also carries a `**Work items**: w1, w2` line mapping to the TDD's `### Engineering Work Breakdown` ids, and `## Execution Strategy` states which dependency edge any reordering crossed (`skills/delivery/create-plan/SKILL.md:42`).

Granularity is not decided here: "Every phase must be independently testable" (`skills/delivery/create-plan/SKILL.md:35`) restates the outline's contract, but `create-plan` does not reference `SLICING` and does not re-run the four tests. It inherits the phase boundaries the outline already sized. The `human-gated: false` line per phase may be flipped to `true` on request (`skills/delivery/create-plan/SKILL.md:39`).

#### Testing patterns

No automated tests found. The plan's own `#### Automated Verification:` blocks are the runnable checks; the skill requires that "Automated verification must be runnable commands" (`skills/delivery/create-plan/SKILL.md:37`).

### 5. `CONVENTIONS.md` ties one child task to one pull request and sets artifact/commit granularity

`shared/CONVENTIONS.md` fixes the units of work and their commit relationships:

- **Task granularity.** A task lives in `.agents/tasks/<slug>/` with a two-to-four-word kebab slug; `task.md` is the only required file, and epic children additionally carry `parent`, `base`, and `depends_on`, plus optional `issue` "the GitHub issue number a child task tracks, written by `start-epic-delivery` and closed by its pull request" (`shared/CONVENTIONS.md`, "Task directory" and "task.md" sections).
- **Child-task ↔ pull-request relationship.** "The task branch carries `task.md` and every artifact with the code to the pull request" and PR target resolution is "the existing pull request base, then `task.md` `base:`, then the repository default branch" (`shared/CONVENTIONS.md`, "Commits"). Each task works "in its own git worktree on its own branch," so one task maps to one branch and one pull request (`shared/CONVENTIONS.md`, "Task worktree"). The `issue` closed by "its pull request" makes the one-child-one-PR relationship explicit.
- **Artifact granularity.** Artifacts are `NN-<type>-<slug>.md`; `NN` is the highest existing prefix plus one; iteration edits a file in place and "Never allocate a new number for a revision" (`shared/CONVENTIONS.md`, "Artifacts", "Iteration").
- **Commit granularity.** Every skill commits its artifact with explicit `git add <path>` as `docs(task): <artifact type> artifact`; "Code commits stage explicit code paths and never mix artifact files in. Never `git add -A` or `git add .` for code." Commits follow Conventional Commits with "One type per commit: a `feat` and its `test` may share a commit; a `feat` and an unrelated `fix` never do," subject ≤72 chars matching a fixed regex (`shared/CONVENTIONS.md`, "Commits").

#### Testing patterns

`scripts/check-commits.mjs` is named as the enforcer of the subject regex, including `--title` on PR titles (`shared/CONVENTIONS.md`, "Commits"). No other automated tests of the conventions were read in this pass.

### 6. `start-epic-delivery` materializes children into task dirs, computes dependency waves, and hands off wave 1

The skill "turn[s] an approved epic plan into one task directory per child and tell[s] the user which children can start now" (`skills/delivery/start-epic-delivery/SKILL.md:10`). Sequence:

1. **Require an epic branch.** It reads `git rev-parse --abbrev-ref HEAD` and stops on `HEAD`/`main`/`master`, because children cut worktrees from the epic's committed task files; the user must `git switch -c epic-<slug>` first (`skills/delivery/start-epic-delivery/SKILL.md:16`).
2. **Parse and re-validate children** from the epic plan's `## Children` JSON fence, applying the same field checks as `create-epic-plan` and stopping with exact violations on failure (`skills/delivery/start-epic-delivery/SKILL.md:20`).
3. **Compute slugs and check conflicts.** Each child slug is "the kebab-case form of its `name`, trimmed to at most four words"; if any child directory already exists it stops and creates nothing (`skills/delivery/start-epic-delivery/SKILL.md:22`).
4. **Create child `task.md`** with frontmatter `slug`, `title`, `workflow`, `created`, `parent` (epic slug), `base` (epic branch), and `depends_on` (YAML list of dependency slugs), body = the child `prompt` verbatim, then `## Acceptance criteria` bullets, then `Feature flag: <flag>` when present (`skills/delivery/start-epic-delivery/SKILL.md:24`).
5. **Compute waves.** "Wave 1 is every child with no dependencies. Wave N+1 is every child whose dependencies are all in waves 1 to N." A child whose dependencies never resolve is a step-4 violation (`skills/delivery/start-epic-delivery/SKILL.md:26`).
6. **File one GitHub issue per child** wave-by-wave (so dependencies already have numbers) when `gh` is authenticated and origin is GitHub; otherwise it skips and records the reason under `### Known limits`. Each issue body lists `Depends on: #<n>`, `Epic:`, and `Task directory:`, and the returned number is written back as `issue:` in the child's `task.md` (`skills/delivery/start-epic-delivery/SKILL.md:28`).
7. **Commit** the child task files as `docs(task): open epic children`, then the receipt (`skills/delivery/start-epic-delivery/SKILL.md:30`).
8. **Hand off the first ready wave only.** The final answer lists each wave-1 child's slug, task directory, issue, and first manual skill; `{child_start_command}` is `/create-research-questions` for `full`/`lean`, `/create-research` for `prd`, `/reproduce-bug` for `bugfix`, and `/deliver … ` (manual mode) for `oneshot`. Each child "opens a fresh session in its own worktree, created with `git worktree add … -b <child slug> <epic branch>`," and "Children in later waves start only after every dependency's pull request is merged" (`skills/delivery/start-epic-delivery/SKILL.md:34`, Rules at `:40`).

#### Testing patterns

No automated tests found. Guardrails are runtime checks: the branch check (step 2), the field validation (step 4), the conflict check (step 5), and the `gh auth status` / GitHub-remote gate (step 8) that degrades to a `### Known limits` note rather than failing.

### 7. PR size, reviewability, and stacking are documented as prose tests and structural fields, not a line-count gate

No skill enforces a numeric PR line target. The expectations are distributed:

- **Size as reviewer effort, not lines.** `SLICING.md`: "A child task produces one pull request a reviewer reads in one sitting and merges the day it starts," and the one-day test (`shared/SLICING.md:7-16`). `describe-pr` style requires the PR be "Reviewable in one pass" (`skills/delivery/describe-pr/SKILL.md:96`).
- **A heuristic in review, not a gate.** `review-code` carries "Size: ~100 easy, ~300 coherent, ~1000 check split. Signals. Require split when bundled/worsens oversized. Review complete scope" (`skills/delivery/review-code/SKILL.md:54`) — a reviewer heuristic applied after the fact, the closest the collection comes to the inspiration repo's 200-400-line target.
- **Separate PRs as the decomposition unit.** `create-epic-plan` ships children "as separate pull requests" with "One child per independently mergeable change" (`skills/delivery/create-epic-plan/SKILL.md:10,40`); the "safe to merge alone" test requires each merge to leave the product working, additive/unreachable/flag-guarded (`shared/SLICING.md:16`).
- **Stacking expressed structurally.** Ordering is `depends_on` → waves (`skills/delivery/create-epic-plan/SKILL.md:47`, `references/epic_plan_template.md:57`; `start-epic-delivery/SKILL.md:26`). A child's pull-request target is the epic branch via `base` (`skills/delivery/start-epic-delivery/SKILL.md:24,34`), and later waves merge only after their dependencies' PRs merge (`skills/delivery/start-epic-delivery/SKILL.md:40`). Feature flags cover in-flight incomplete paths (`skills/delivery/create-epic-plan/SKILL.md:44`; `shared/SLICING.md:16`). There is no documented stacked-diff tooling (e.g. `git branch --stack` or a stacking CLI); stacking is dependency waves plus per-child branches off the epic branch.

#### Testing patterns

No automated tests found. Enforcement is human: `review-code` applies the size heuristic and can "Require split," and `describe-pr` frames the PR for one-pass review. `check-commits.mjs --title` validates PR titles but not size (`shared/CONVENTIONS.md`, "Commits").

## Code References

### Slicing and conventions (exhaustive for the governing rules)

- `shared/SLICING.md:1-55` - One-unit-one-PR rule, four tests, split table, EARS patterns, `depends_on` rule.
- `shared/CONVENTIONS.md` - Task directory, `task.md` frontmatter (incl. `parent`/`base`/`depends_on`/`issue`), artifact numbering, worktree/one-branch-per-task, commit granularity and Conventional Commits.

### Decomposition and sizing skills (exhaustive for the researched area)

- `skills/delivery/create-epic-plan/SKILL.md:10-54` - Behavior-based cut, four-test sizing, child rules, typed-judgment `route-workflow` / `size-children` passes.
- `skills/delivery/create-epic-plan/references/epic_plan_template.md:12-90` - `## Children`, `## Slice Check`, `## Ordering`, `## Workflow judgments`, `## Sizing judgments` sections.
- `skills/delivery/create-structure-outline/SKILL.md:19-22` - Phase views, anti-layer-batching, four-test phase sizing.
- `skills/delivery/create-structure-outline/references/structure_outline_template.md:19-59` - Phase Checklist and per-phase structure.
- `skills/delivery/create-plan/SKILL.md:29-42` - Phase-to-step expansion, TDD work-item mapping; no SLICING reference.
- `skills/delivery/create-plan/references/plan_template.md:40-72` - `## Phase N` structure with `#### N.1` edits and Success Criteria.
- `skills/delivery/create-prd/SKILL.md:23` - SLICING used only for one-obligation behavior records.

### Delivery, review, and PR framing (representative for question 7)

- `skills/delivery/start-epic-delivery/SKILL.md:16-42` - Child dir creation, wave computation, issue creation, wave-1 handoff.
- `skills/delivery/review-code/SKILL.md:54` - `~100/~300/~1000` size heuristic and split requirement.
- `skills/delivery/describe-pr/SKILL.md:96` - "Reviewable in one pass."
- `skills/delivery/deliver/SKILL.md:29-41` - `oneshot`/`bugfix` routing referenced by epic children.

## Architecture Documentation

The collection separates *where granularity is decided* from *where it is materialized and reviewed*. `shared/SLICING.md` is the single definition; `create-epic-plan` and `create-structure-outline` are the two enforcement points that run its four tests (epic children as separate PRs; outline phases as sequential steps in one PR). `create-prd` borrows only the one-obligation acceptance rule, and `create-plan` inherits phase granularity without re-testing it. `start-epic-delivery` is downstream materialization: it converts a sized epic plan into task directories, encodes dependencies as `base` + `depends_on`, derives waves, and files issues, but it re-validates the plan's `slice` fields rather than re-deriving them.

Stacking and PR-size expectations are not a numeric gate; they are the reviewer-effort/one-day tests in SLICING, `review-code`'s post-hoc size heuristic, and the structural chain (per-child branch off the epic `base`, `depends_on` waves, feature flags) that `start-epic-delivery` sets up. Two seams a later phase may care about surfaced here: `SLICING.md:3` names `start-epic-delivery` as a follower and omits `create-plan`, but the actual `SLICING` link lives in `create-epic-plan`, `create-structure-outline`, and `create-prd` — so the guide's stated follower list and the linked reality differ.

## Open Questions

None.
