Task: `we-need-do-something`

## Purpose

Make the delivery skills slice future work into granular, reviewable, stackable pull requests by giving `shared/SLICING.md` an advisory size signal and aligning every skill that references the guide.

## Special things to note

- Documentation only: no runtime code, no new dependency, no change to `judge.mjs`, `validate.mjs`, or `sync-plugin.mjs` logic. The four tests stay the only binding gate; the size signal is advisory and surfaces oversize early.
- The `200-400` changed-line number lives in `shared/SLICING.md` alone; the four followers reference the guide rather than restating it, so there is a single owner.
- `start-epic-delivery` is intentionally kept a re-validator (re-checks a recorded `slice` without re-sizing), not a four-tests follower, to avoid duplicating `create-epic-plan`'s sizing gate.

## Change outline

Source-of-truth edit in `shared/SLICING.md`: corrected follower list and a new advisory section between `## The unit` and `## Four tests`.

```diff
-`create-epic-plan`, `start-epic-delivery`, `create-structure-outline`, and `create-prd` follow it.
+`create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` follow it.
+`start-epic-delivery` re-validates the slices materialized from an approved plan against this guide
+without re-sizing them.

+## Size signal (advisory)
+
+Before running the four tests, estimate the unit's likely changed lines ... roughly more than
+200-400 lines is a signal to look for a split now ... The four tests remain the only binding gate.
```

Follower skills reference the guide/size signal at the right ownership point:

```text
skills/delivery/
  create-plan/SKILL.md            + links SLICING; + per-phase four-tests re-check (step 4), write renumbered to step 5
  create-epic-plan/SKILL.md       + size-signal pre-check (step 5); + prefer-shared-contract-over-depends_on (Child Rules)
  create-structure-outline/SKILL.md  + size-signal reference ahead of the four tests it already runs (step 5)
  start-epic-delivery/SKILL.md    + cites SLICING to re-validate recorded slice without re-sizing (step 4)
.changeset/
  slice-granular-pull-requests.md + one patch entry describing all four edits
```

Line 6 (the shared writing-guide sentence `validate.mjs` checks) is unchanged in every edited skill.

## Human Review

### Review targets

- The size-signal wording in [shared/SLICING.md](shared/SLICING.md) (200-400 changed lines, generated code and lockfiles excluded) and that it stays the sole owner of the number.
- That `start-epic-delivery` received a re-validation citation only, not a four-tests follower link.
- The corrected follower-list sentence naming exactly `create-epic-plan`, `create-structure-outline`, `create-plan`, `create-prd`.

### Verify

- [ ] Run `npm ci && npm test`; it exits 0 (validate ok, plugin in sync, 234 node tests pass, safety-dance Go suite and e2e `ok`).

### Known limits

- `validate.mjs` checks layout, line 6, template shape, and banned tokens but not the size-signal prose or follower wording; those are confirmed by direct inspection and grep in the verification and code-review artifacts.
