---
"@marktripoli/skills": patch
---

fix(iterate-evidence): F1 frontmatter append-only + initial-zero frame; F2 quoted action labels; F3 structural continuation pause

F1: SKILL.md and receipt template now explicitly require frontmatter to be updated in place (never collapse existing fields including `type` and `limit`); both baseline and repair passes now require an initial-zero state frame opened as a separate named viewer call before any action.

F2: `actionFlow()` in `evals/evidence-flows.mjs` strips matching surrounding quotes (single, double, backtick) from charter action labels so `Click "Add one" once`, `Click 'Reset'`, and backtick forms resolve to the same flows as unquoted forms. Regression tests added for quoted, mixed, and unknown-quoted forms.

F3: Continuation pause predicate in `evals/iterate-evidence.mjs` now locates the receipt by filename pattern (`NN-evidence-iteration-*.md`) rather than `newest(..., "evidence-iteration")`, which required `type: evidence-iteration` in frontmatter. Validation uses `activeReservation` — the same structural predicate the grader uses — so a missing or misspelled `type` field no longer causes the pause to report `valid: false`. Retained control scripts `primary-controls-final.mjs` and `retained-controls-final.mjs` now accept an optional output directory argument to avoid EEXIST on re-run.
