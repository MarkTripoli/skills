---
task: fix-bug-regression
type: reproduction
summary: "formatCents drops the leading zero of single-digit cents; the reproduction test fails today and the cause is the unpadded remainder."
status: reproduced
revision: "fixture"
---

# formatCents drops a zero Reproduction

## Observed and expected

- Observed: `formatCents(105)` returns `"1.5"`.
- Expected: `"1.05"`.
- Source: bug report in `task.md`.

## Reproduction

- Test or command: `tests/money.test.mjs`, test "pads single-digit cents".
- Run: `node --test tests/money.test.mjs`
- Result today: fails; `'1.5' !== '1.05'`.
- Pre-mutation policy/baseline: none recorded.
- Delivery checkpoint: fix pending.

## Cause

`src/money.mjs:4` interpolates `cents % 100` without padding, so 5 cents prints as `5`.

## Fix

1. `src/money.mjs` `formatCents`: pad the remainder to two digits with `padStart(2, "0")`. Proves it: `node --test tests/money.test.mjs`, plus `npm test`.

## Human Review

### Review targets

- The failing test and the one-line cause.

### Verify

- [ ] Run `node --test tests/money.test.mjs`; it fails with `'1.5' !== '1.05'`.

### Known limits

- None.
