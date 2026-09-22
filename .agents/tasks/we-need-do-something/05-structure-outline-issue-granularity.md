---
task: we-need-do-something
type: structure-outline
summary: "Phases the doc-only skill edits that make future work slice into granular, reviewable pull requests. Phase 1 adds the advisory 200-400-line size signal and the corrected follower list to shared/SLICING.md. Phase 2 makes create-plan a SLICING follower with a lightweight per-phase four-tests re-check. Phase 3 adds the size-signal pre-check and the prefer-shared-contract-over-depends_on instruction to create-epic-plan. Phase 4 propagates the size-signal reference to create-structure-outline, adds a re-validation citation (no re-sizing) to start-epic-delivery, and lands one .changeset entry. Every phase's done condition is `node scripts/validate.mjs` staying green plus the named text present; the whole outline is one pull request of Markdown edits with no runtime behavior."
repo: skills
branch: we-need-do-something
sha: 61ef962f195b34ab2ee2361786344357ca62b3bd
---

# Slice future work into granular reviewable pull requests

The six resolved design questions become Markdown edits across `shared/SLICING.md` and four delivery skills. The work is documentation only: no code, no runtime behavior, no new dependency. The single mechanical gate is `node scripts/validate.mjs` (line-6 shared sentence, template shape, banned tokens), which must stay green after every phase, plus inspection that each named edit is present and internally consistent. All phases land as one pull request; a `.changeset/` entry accompanies the user-facing change.

## Desired End State

- `shared/SLICING.md` carries an advisory "Size signal" pre-check (roughly >200-400 changed lines, generated code and lockfiles excluded) ahead of the four tests, and its stated follower list names exactly `create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd`, with `start-epic-delivery` described separately as re-validating materialized slices without re-sizing.
- `create-plan` links `shared/SLICING.md` and runs a lightweight per-phase four-tests re-check that splits a failing phase by its symptom before writing implementation steps.
- `create-epic-plan` runs the size-signal pre-check ahead of its existing four-tests gate and instructs the author to prefer parallel children sharing a fixed contract over a `depends_on` edge.
- `create-structure-outline` references the size-signal pre-check ahead of the four tests it already runs; `start-epic-delivery` cites `shared/SLICING.md` when re-validating the recorded `slice` without re-sizing.
- `node scripts/validate.mjs` and `node scripts/sync-plugin.mjs --check` pass; one `.changeset/` entry describes the change.

## Phase Checklist

- [ ] Phase 1: SLICING size signal and corrected follower list
- [ ] Phase 2: create-plan becomes a SLICING follower
- [ ] Phase 3: create-epic-plan size-signal pre-check and shared-contract instruction
- [ ] Phase 4: propagate to create-structure-outline and start-epic-delivery, add changeset

---

## Phase 1: SLICING size signal and corrected follower list

`shared/SLICING.md` is the single definition every follower points at, so it changes first. Add the advisory size signal as a pre-check ahead of the four behavioral tests (the four tests stay the only binding gate), and correct the stated follower list so it names only the skills that actually link and run the guide, describing `start-epic-delivery` separately.

### Change Outline

```diff
 shared/
 └── SLICING.md   ~ add "Size signal (advisory)" pre-check; fix the follower list sentence
```

Follower-list sentence (top of the file):

```diff
-`create-epic-plan`, `start-epic-delivery`, `create-structure-outline`, and `create-prd` follow it.
+`create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` follow it.
+`start-epic-delivery` re-validates the slices materialized from an approved plan against this guide
+without re-sizing them.
```

Size signal, inserted between `## The unit` and `## Four tests` (advisory, not a fifth gate):

```diff
+## Size signal (advisory)
+
+Before running the four tests, estimate the unit's likely changed lines (generated code and
+lockfiles excluded). A candidate that would change roughly more than 200-400 lines is a signal to
+look for a split now, using the table below. The four tests remain the only binding gate; this
+signal only surfaces oversize early, when a split is cheap, instead of at review time.
```

The four tests, the split table, and acceptance criteria are unchanged.

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs`
- [ ] `grep -q "Size signal (advisory)" shared/SLICING.md`
- [ ] `grep -q "create-structure-outline\`, \`create-plan\`, and \`create-prd\` follow it" shared/SLICING.md`
- [ ] `grep -q "start-epic-delivery\` re-validates" shared/SLICING.md`

---

## Phase 2: create-plan becomes a SLICING follower

`create-plan` is the last artifact before code is written and today inherits outline phase boundaries without re-checking them. Make it a SLICING follower: add the guide link and a lightweight per-phase re-check of the four tests that splits a failing phase by its symptom before expanding it into implementation steps. Not a full re-derivation of the outline.

### Change Outline

```diff
 skills/delivery/create-plan/
 └── SKILL.md   ~ add SLICING link + per-phase four-tests re-check step (line 6 unchanged)
```

The shared line-6 sentence stays exactly as validated. Add the guide to the read step and a new re-size step in `## Steps` before phases expand into edits, mirroring the shape `create-structure-outline` already uses:

```text
Re-size each outline phase against shared/SLICING.md's four tests; split a failing phase by the
symptom's named split before writing its implementation steps. This is a per-phase re-check, not a
re-derivation of the outline.
```

Add the guide to `## Plan Guidelines` or the read-inputs step as a linked reference so the skill both links and runs the guide.

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs` (confirms line 6 is still the shared sentence)
- [ ] `grep -q "shared/SLICING.md" skills/delivery/create-plan/SKILL.md`
- [ ] `grep -qi "re-size each outline phase" skills/delivery/create-plan/SKILL.md`

---

## Phase 3: create-epic-plan size-signal pre-check and shared-contract instruction

`create-epic-plan` already sizes every candidate against the four tests and re-runs them after a split. Slot the size signal in as a pre-check ahead of that gate, and add an explicit instruction to prefer parallel children sharing a fixed contract over a `depends_on` edge, so a shared shape is never recorded as a dependency and fewer waves are needed.

### Change Outline

```diff
 skills/delivery/create-epic-plan/
 └── SKILL.md   ~ size-signal pre-check ahead of step 5's four tests; shared-contract ordering rule
```

Pre-check ahead of the four-tests step (step 5, "Size every candidate against the slicing guide's four tests"):

```text
Before the four tests, apply the slicing guide's advisory size signal: a candidate that would
change roughly more than 200-400 lines (generated code and lockfiles excluded) is a signal to look
for a split now. The four tests remain the binding gate.
```

Child-ordering instruction (step 4 "Decomposition" or the `depends_on` Child Rule):

```text
Prefer parallel children that share a fixed contract over a depends_on edge; a shared shape is not
a dependency, so do not record it as one.
```

The `judge.mjs size-children` call and the existing four-tests gate are unchanged.

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs`
- [ ] `grep -qi "size signal" skills/delivery/create-epic-plan/SKILL.md`
- [ ] `grep -qi "shared shape is not a dependency" skills/delivery/create-epic-plan/SKILL.md`

---

## Phase 4: propagate to create-structure-outline and start-epic-delivery, add changeset

Close the remaining two followers and record the change. `create-structure-outline` already links SLICING and runs the four tests; add the size-signal reference ahead of them. `start-epic-delivery` re-validates the recorded `slice` and gets a citation to SLICING for that re-validation without re-sizing (it does not become a four-tests follower; re-sizing there duplicates `create-epic-plan`'s gate). Add one `.changeset/` entry for the user-facing change.

### Change Outline

```diff
 skills/delivery/create-structure-outline/
 └── SKILL.md            ~ reference the advisory size signal ahead of the four tests (step 5)
 skills/delivery/start-epic-delivery/
 └── SKILL.md            ~ cite shared/SLICING.md when re-validating the slice (no re-sizing)
 .changeset/
 └── <generated>.md      + user-facing changeset entry
```

`create-structure-outline` step 5, before "Size each phase against the slicing guide ... four tests":

```text
Apply the slicing guide's advisory size signal first (roughly >200-400 changed lines is a signal to
split now), then run the four tests.
```

`start-epic-delivery` step 4 (the `slice` re-validation) gains a citation:

```text
Re-validate the recorded slice against shared/SLICING.md's slice definition without re-sizing it;
sizing was decided in create-epic-plan.
```

### Validation

#### Automated Verification

- [ ] `node scripts/validate.mjs`
- [ ] `node scripts/sync-plugin.mjs --check`
- [ ] `grep -qi "size signal" skills/delivery/create-structure-outline/SKILL.md`
- [ ] `grep -q "shared/SLICING.md" skills/delivery/start-epic-delivery/SKILL.md`
- [ ] `ls .changeset/*.md | grep -qv -e README -e config` (a new changeset entry exists)

---

## Open Questions

- None. The six design questions are resolved; this outline only sequences their edits.

## Human Review

### Review targets

- Phase boundaries: one phase per follower area (SLICING source of truth first, then create-plan, then create-epic-plan, then the two remaining followers plus changeset), each landing a coherent self-consistent doc state.
- The exact size-signal number (200-400 changed lines, generated code and lockfiles excluded) and wording carried into SLICING and referenced by the followers.
- That `start-epic-delivery` gets a re-validation citation only, not a four-tests follower link, matching the resolved decision.
- The corrected follower-list sentence naming exactly the four followers plus the separate `start-epic-delivery` description.

### Verify

- [ ] `node scripts/validate.mjs` passes after each phase and line 6 stays the shared writing-guide/conventions sentence in every edited skill.
- [ ] `shared/SLICING.md` names exactly `create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` as followers and describes `start-epic-delivery` separately.
- [ ] `create-plan` both links `shared/SLICING.md` and runs a per-phase four-tests re-check.
- [ ] `create-epic-plan` runs the size signal ahead of its four tests and carries the prefer-shared-contract-over-`depends_on` instruction.
- [ ] One `.changeset/` entry describes the change and `node scripts/sync-plugin.mjs --check` passes.

### Known limits

- The work is documentation only; `node scripts/validate.mjs` checks layout, the line-6 shared sentence, template shape, and banned tokens, but does not assert the size-signal prose or the follower-list wording, so those are confirmed by the `grep` checks and human inspection rather than a bespoke test.
- The size-signal number was fixed by the orchestrator's decision, not derived; live-eval proof of the reworded skills (`npm run evals`) is out of scope for this doc change and not run here.
