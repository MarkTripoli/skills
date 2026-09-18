Task: `handoff-artifact-and-run-location`

## Purpose

Handoff replies now name the artifact the next phase reads and the checkout and branch to run it in, so a by-hand session stops guessing the wrong file or opening on the wrong branch.

## Special things to note

- The fixed handoff sentence changed shape, from `Open a new session, then run:` to `Open a new session in {run_location}, then run:`. Every forward answer template (45) carries the slot; the validator and the eval reply check now reject a handoff whose location is empty, so this is a hard contract change, not a suggestion.
- `create-plan` now honors a `@file` argument that the design and TDD phases already passed but its SKILL never documented; its input resolves the named artifact before falling back to the newest design artifact. No other reader's contract changed.
- Two commits, one PR: `feat(deliver)` (start the routed Archon run) and `fix(handoff)` (this change). Each ships a changeset entry.
- `shared/CONVENTIONS.md` is linked by URL, not copied into installed skill trees, so the `{run_location}` observe-from-git rule reaches a phase only when it reads the conventions; the concrete guarantee that always renders is the slot in each answer template plus the validator gate.

## Change outline

Guard added to the validator: each forward fence must carry `@<file>` when the next skill acts on that artifact, and be bare otherwise.

```text
scripts/validate.mjs
  FENCE_ARTIFACT            declared expectation per answer, kept in sync with ANSWER_INVENTORY
  checkHandoff()            asserts @<file> presence against FENCE_ARTIFACT
                            asserts the fresh-session sentence names a non-empty {run_location}
  fillTemplate()            renders {run_location} for the check
```

Handoff sentence, before and after:

```diff
 Next action:
-Open a new session, then run:
+Open a new session in {run_location}, then run:

 ```text
-/create-research
+/create-research @{artifact_file}
 ```
```

`{run_location}` is filled from observed git state, never a guess:

```text
in a git work tree:  `<root>` on branch `<branch>`   (git rev-parse --show-toplevel / --abbrev-ref HEAD)
outside one:         this checkout
```

Files: `scripts/validate.mjs`, `evals/run.mjs`, `shared/CONVENTIONS.md`, `workflows/delivery.md`, `docs/context-management.md`, 45 answer templates, and 13 create/iterate `SKILL.md` output instructions (fill `{artifact_file}`, add no prose around the fence).

## Human Review

### Review targets

- `scripts/validate.mjs`: the `FENCE_ARTIFACT` map and the two `checkHandoff` assertions; confirm each answer's true/false matches the next skill's documented input contract.
- `skills/delivery/create-plan/SKILL.md`: the added `@file` resolution.
- The handoff sentence change across the 45 answer templates.

### Verify

- [ ] `npm test` passes (validator, plugin sync, generator staleness, unit tests, Archon dry-run/fixture/real-run).
- [ ] Reverting a fence to the bare or locationless form fails validation.

### Known limits

- The validator proves the templates are correct and the eval check rejects a bad live reply, but neither forces a session to run `git rev-parse`; a hard runtime guarantee would need Archon or a reply wrapper to substitute `{run_location}` from the run's worktree.
