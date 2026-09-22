---
task: we-need-do-something
type: plan
summary: "Turns the structure outline into concrete Markdown edits that make future work slice into granular, reviewable pull requests. Phase 1 adds the advisory 'Size signal' pre-check and corrects the follower-list sentence in shared/SLICING.md. Phase 2 makes create-plan a SLICING follower with a per-phase four-tests re-check. Phase 3 adds the size-signal pre-check plus a prefer-shared-contract-over-depends_on rule to create-epic-plan. Phase 4 propagates the size-signal reference to create-structure-outline, adds a re-validation (no re-sizing) citation to start-epic-delivery, and lands one .changeset entry. Every phase's gate is `node scripts/validate.mjs` green plus grep checks for the named text; the whole plan is one documentation-only pull request."
repo: skills
branch: we-need-do-something
sha: b7c761395027e3a42bd804e9fa562248786f56e7
---

# Slice future work into granular reviewable pull requests — Implementation Plan

## Overview

The six resolved design questions become Markdown-only edits across `shared/SLICING.md` and four delivery skills so that future epics and outlines slice into granular, reviewable, testable pull requests. There is no code, no runtime behavior, and no new dependency. The single mechanical gate is `node scripts/validate.mjs` (line-6 shared sentence, template shape, banned tokens), backed by `grep` checks that assert each named edit is present, plus `node scripts/sync-plugin.mjs --check` for the generated plugin surface. All four phases land as one pull request accompanied by one `.changeset/` entry.

## Current State Analysis

### Key Discoveries:

- `shared/SLICING.md` line 2 currently names the followers as `create-epic-plan`, `start-epic-delivery`, `create-structure-outline`, and `create-prd` — but `create-plan` does not link the guide today and `start-epic-delivery` does not run the four tests, so the sentence is wrong on both ends.
- `shared/SLICING.md` has `## The unit`, then `## Four tests`, then `## Splits that work`; the size signal must sit between `## The unit` and `## Four tests` (the outline's insertion point), and the four tests stay the only binding gate.
- `create-plan/SKILL.md` line 6 is the shared writing-guide/conventions sentence that `validate.mjs` checks; its `## Steps` has no SLICING link and no re-size step. Step 4 "Write the implementation plan" converts each outline phase into implementation steps without re-checking phase size.
- `create-epic-plan/SKILL.md` already links the slicing guide (step 2) and sizes candidates against the four tests (step 5); the `depends_on` rule lives in `## Child Rules` ("`depends_on` lists sibling names ... Keep it minimal"). The `judge.mjs size-children` call in Output step 4 stays unchanged.
- `create-structure-outline/SKILL.md` step 5 already links `shared/SLICING.md` and runs the four tests ("Size each phase against the slicing guide ... one obligation, one vertical slice, one day of work, and safe to land alone").
- `start-epic-delivery/SKILL.md` step 4 parses children and checks `slice` is `vertical` or `enabler` but does not cite SLICING; it is not a four-tests follower and must not become one (re-sizing there duplicates create-epic-plan's gate).
- `.changeset/` holds only `config.json` and `README.md`; package name is `@marktripoli/skills`. A new entry is any `.md` other than `README` under `.changeset/`.
- Line 6 in all four skills is byte-identical to the shared sentence; every edit must leave line 6 untouched.

## Desired End State

- `shared/SLICING.md` carries an advisory "Size signal" pre-check (~>200-400 changed lines, generated code and lockfiles excluded) ahead of the four tests, and its follower sentence names exactly `create-epic-plan`, `create-structure-outline`, `create-plan`, `create-prd`, with `start-epic-delivery` described separately as re-validating materialized slices without re-sizing.
- `create-plan` links `shared/SLICING.md` and runs a lightweight per-phase four-tests re-check that splits a failing phase by its symptom before writing implementation steps.
- `create-epic-plan` runs the size-signal pre-check ahead of its four-tests gate and instructs the author to prefer parallel children sharing a fixed contract over a `depends_on` edge.
- `create-structure-outline` references the size signal ahead of the four tests it already runs; `start-epic-delivery` cites `shared/SLICING.md` when re-validating the recorded `slice` without re-sizing.
- `node scripts/validate.mjs` and `node scripts/sync-plugin.mjs --check` pass; one `.changeset/` entry describes the change.

## What We're NOT Doing

- No runtime code, no new script, no change to `judge.mjs`, `validate.mjs`, or `sync-plugin.mjs` logic.
- Not making `start-epic-delivery` a four-tests follower or adding re-sizing there.
- Not changing the four tests, the split table, the acceptance-criteria section, or the `depends_on` definition in SLICING.
- Not deriving a new size threshold; the 200-400 line number is fixed by the orchestrator's decision.
- Not running `npm run evals` (live-eval proof of reworded skills is out of scope for this doc change).

## Execution Strategy

Edit in the outline's order so each phase leaves a self-consistent document state: SLICING (the source of truth) first, then the three followers that reference it, then the changeset. Phases are independent Markdown edits with no ordering dependency beyond keeping SLICING's new anchor text stable once phases 2-4 reference the same "size signal" wording. Run `node scripts/validate.mjs` and the phase's `grep` checks after each phase; run `node scripts/sync-plugin.mjs --check` in Phase 4 once all skill edits are in.

---

## Phase 1: SLICING size signal and corrected follower list

### Goal

`shared/SLICING.md` carries the advisory size signal ahead of the four tests and its follower sentence names exactly the four real followers, with `start-epic-delivery` described separately.

### Required Edits:

#### 1.1 Correct the follower-list sentence

**File**: `shared/SLICING.md`
**Changes**: Replace the current follower sentence (end of the intro paragraph, line 2) so it names the four skills that actually link and run the guide, and describe `start-epic-delivery` separately.

```diff
-`create-epic-plan`, `start-epic-delivery`, `create-structure-outline`, and `create-prd` follow it.
+`create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` follow it.
+`start-epic-delivery` re-validates the slices materialized from an approved plan against this guide
+without re-sizing them.
```

#### 1.2 Insert the advisory size signal

**File**: `shared/SLICING.md`
**Changes**: Add a new `## Size signal (advisory)` section between `## The unit` and `## Four tests`. The four tests remain the only binding gate.

```diff
+## Size signal (advisory)
+
+Before running the four tests, estimate the unit's likely changed lines (generated code and
+lockfiles excluded). A candidate that would change roughly more than 200-400 lines is a signal to
+look for a split now, using the table below. The four tests remain the only binding gate; this
+signal only surfaces oversize early, when a split is cheap, instead of at review time.
```

The four tests, the split table, the acceptance-criteria section, and the dependencies section are unchanged.

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `grep -q "Size signal (advisory)" shared/SLICING.md`
- [ ] `grep -q 'create-structure-outline`, `create-plan`, and `create-prd` follow it' shared/SLICING.md`
- [ ] `grep -q 'start-epic-delivery` re-validates' shared/SLICING.md`
- [ ] `grep -qv "start-epic-delivery.*create-structure-outline.*create-prd. follow it" shared/SLICING.md` (old sentence gone)

human-gated: false

---

## Phase 2: create-plan becomes a SLICING follower

### Goal

`create-plan` links `shared/SLICING.md` and re-checks each outline phase against the four tests, splitting a failing phase by its symptom before writing implementation steps — a per-phase re-check, not a re-derivation of the outline. Line 6 stays exactly the shared sentence.

### Required Edits:

#### 2.1 Add the guide to the read-inputs step

**File**: `skills/delivery/create-plan/SKILL.md`
**Changes**: In `## Steps` step 2 (read primary inputs), add the slicing guide as a linked reference so the skill both links and runs the guide, mirroring `create-epic-plan` step 2.

```diff
   - Read `references/plan_template.md` and `references/plan_final_answer.md`.
+  - Read the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`.
```

#### 2.2 Add a per-phase four-tests re-check step

**File**: `skills/delivery/create-plan/SKILL.md`
**Changes**: Add a step in `## Steps` before step 4 expands phases into edits (renumber the existing "Write the implementation plan" step accordingly).

```text
4. **Re-size each outline phase** against `shared/SLICING.md`'s four tests; split a failing phase by
   the symptom's named split before writing its implementation steps. This is a per-phase re-check,
   not a re-derivation of the outline.
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs` (confirms line 6 is still the shared sentence)
- [ ] `grep -q "shared/SLICING.md" skills/delivery/create-plan/SKILL.md`
- [ ] `grep -qi "re-size each outline phase" skills/delivery/create-plan/SKILL.md`
- [ ] `sed -n '6p' skills/delivery/create-plan/SKILL.md | grep -q "writing guide"` (line 6 unchanged)

human-gated: false

---

## Phase 3: create-epic-plan size-signal pre-check and shared-contract instruction

### Goal

`create-epic-plan` applies the advisory size signal ahead of its existing four-tests gate and instructs the author to prefer parallel children sharing a fixed contract over a `depends_on` edge. The `judge.mjs size-children` call and the four-tests gate are unchanged.

### Required Edits:

#### 3.1 Size-signal pre-check ahead of the four tests

**File**: `skills/delivery/create-epic-plan/SKILL.md`
**Changes**: In `## Steps` step 5 ("Size every candidate against the slicing guide's four tests"), add the advisory size signal as a sentence ahead of the four tests.

```diff
-5. **Size every candidate against the slicing guide's four tests**: one obligation, one vertical slice, one day, safe to merge alone.
+5. **Size every candidate against the slicing guide's four tests**: before the four tests, apply the guide's advisory size signal — a candidate that would change roughly more than 200-400 lines (generated code and lockfiles excluded) is a signal to look for a split now; the four tests remain the binding gate. Then run the four tests: one obligation, one vertical slice, one day, safe to merge alone.
```

#### 3.2 Prefer a shared contract over a depends_on edge

**File**: `skills/delivery/create-epic-plan/SKILL.md`
**Changes**: In `## Child Rules`, extend the `depends_on` bullet so a shared shape is never recorded as a dependency.

```diff
-- `depends_on` lists sibling names whose merged pull request the child needs. Keep it minimal so independent children run together.
+- `depends_on` lists sibling names whose merged pull request the child needs. Keep it minimal so independent children run together. Prefer parallel children that share a fixed contract over a `depends_on` edge; a shared shape is not a dependency, so do not record it as one.
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `grep -qi "size signal" skills/delivery/create-epic-plan/SKILL.md`
- [ ] `grep -qi "shared shape is not a dependency" skills/delivery/create-epic-plan/SKILL.md`
- [ ] `sed -n '6p' skills/delivery/create-epic-plan/SKILL.md | grep -q "writing guide"` (line 6 unchanged)

human-gated: false

---

## Phase 4: propagate to create-structure-outline and start-epic-delivery, add changeset

### Goal

`create-structure-outline` references the size signal ahead of the four tests it already runs; `start-epic-delivery` cites `shared/SLICING.md` when re-validating the recorded `slice` without re-sizing; one `.changeset/` entry records the user-facing change; `node scripts/sync-plugin.mjs --check` passes.

### Required Edits:

#### 4.1 Reference the size signal in create-structure-outline

**File**: `skills/delivery/create-structure-outline/SKILL.md`
**Changes**: In step 5, add the advisory size signal ahead of "Size each phase against the slicing guide ... four tests".

```diff
-Size each phase against the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`: one obligation, one vertical slice, one day of work, and safe to land alone.
+Apply the slicing guide's advisory size signal first (roughly >200-400 changed lines, generated code and lockfiles excluded, is a signal to split now), then size each phase against the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`: one obligation, one vertical slice, one day of work, and safe to land alone.
```

#### 4.2 Cite SLICING when re-validating the slice in start-epic-delivery

**File**: `skills/delivery/start-epic-delivery/SKILL.md`
**Changes**: In step 4 (parse the children), add a sentence that re-validates the recorded `slice` against SLICING's slice definition without re-sizing.

```diff
-`slice` is `vertical` or `enabler`; `acceptance` is a list of one to five sentences;
+`slice` is `vertical` or `enabler`; re-validate the recorded `slice` against `shared/SLICING.md`'s slice definition without re-sizing it, since sizing was decided in `create-epic-plan`; `acceptance` is a list of one to five sentences;
```

#### 4.3 Add the changeset entry

**File**: `.changeset/slice-granular-pull-requests.md` (new)
**Changes**: One patch entry describing the user-facing change.

```text
---
"@marktripoli/skills": patch
---

Slice future work into granular, reviewable pull requests: add an advisory size-signal pre-check to
shared/SLICING.md, make create-plan a slicing-guide follower with a per-phase four-tests re-check,
add the size signal and a prefer-shared-contract-over-depends_on rule to create-epic-plan, reference
the size signal in create-structure-outline, and cite the guide when start-epic-delivery re-validates
a materialized slice.
```

### Success Criteria:

#### Automated Verification:

- [ ] `node scripts/validate.mjs`
- [ ] `node scripts/sync-plugin.mjs --check`
- [ ] `grep -qi "size signal" skills/delivery/create-structure-outline/SKILL.md`
- [ ] `grep -q "shared/SLICING.md" skills/delivery/start-epic-delivery/SKILL.md`
- [ ] `ls .changeset/*.md | grep -qv -e README -e config` (a new changeset entry exists)
- [ ] `sed -n '6p' skills/delivery/create-structure-outline/SKILL.md | grep -q "writing guide" && sed -n '6p' skills/delivery/start-epic-delivery/SKILL.md | grep -q "writing guide"` (line 6 unchanged in both)

human-gated: false

---

## Human Review

### Review targets

- Phase boundaries: one phase per follower area (SLICING source of truth first, then create-plan, then create-epic-plan, then the two remaining followers plus changeset), each landing a coherent self-consistent doc state.
- The exact size-signal number (200-400 changed lines, generated code and lockfiles excluded) and wording carried into SLICING and referenced by the followers.
- That `start-epic-delivery` gets a re-validation citation only, not a four-tests follower link.
- The corrected follower-list sentence naming exactly the four followers plus the separate `start-epic-delivery` description.
- The renumbering of `create-plan` steps after inserting the re-size step (Phase 2.2).

### Verify

- [ ] `node scripts/validate.mjs` passes after each phase and line 6 stays the shared writing-guide/conventions sentence in every edited skill.
- [ ] `shared/SLICING.md` names exactly `create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` as followers and describes `start-epic-delivery` separately.
- [ ] `create-plan` both links `shared/SLICING.md` and runs a per-phase four-tests re-check.
- [ ] `create-epic-plan` runs the size signal ahead of its four tests and carries the prefer-shared-contract-over-`depends_on` instruction.
- [ ] One `.changeset/` entry describes the change and `node scripts/sync-plugin.mjs --check` passes.

### Known limits

- The work is documentation only; `node scripts/validate.mjs` checks layout, the line-6 shared sentence, template shape, and banned tokens, but does not assert the size-signal prose or the follower-list wording, so those are confirmed by the `grep` checks and human inspection rather than a bespoke test.
- The size-signal number was fixed by the orchestrator's decision, not derived; live-eval proof of the reworded skills (`npm run evals`) is out of scope for this doc change and not run here.
