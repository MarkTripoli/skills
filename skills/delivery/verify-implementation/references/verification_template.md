---
task: [task slug]
type: verification
summary: "[Two to four sentences: what was re-run, the status, the failing or missing items, and what the next phase needs from this file.]"
status: passed | failed | blocked
revision: [short SHA verified]
target: [merge target branch]
---

# Verification

## Run

- Revision: [`<short SHA>` on `<branch>`; clean tree, or the uncommitted paths]
- Target: [`<merge target>`; `<n>` files changed, `<m>` of them tests]
- Checks from: [`package.json` scripts, `Makefile`, CI file, or none defined]
- Coverage: [`<n>` acceptance items; `<k>` claimed by a receipt, `<n - k>` claimed by none]
- Graded by: [typed-judgment helper (`grade-steps --kind command`), or own judgment because the helper was unavailable]

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | [Repository check name.] | [`<exact command>`] | [Exits 0 with no failing test.] | [One-line digest: exit code and the decisive output.] | pass \| fail | 1.00 \| hand | 0 \| 1 \| 2 \| 3 |
| T1 | [Test file changed by the diff.] | [`git diff <target>...HEAD -- <path>`] | [The change keeps this check's strength.] | [Quoted lines that weaken or keep it.] | pass \| fail | 0.00 \| hand | 0 \| 1 \| 2 \| 3 |
| A1 | [Acceptance item, with its source `<artifact>:<line>` and `claimed: yes \| no`.] | [`<command>`, `<request>`, or `<observation>`; or "not in this environment: <reason>".] | [Outcome the artifact promises, quoted.] | [One-line digest of what was recorded.] | pass \| fail \| untested | 0.00 \| hand | 0 \| 1 \| 2 \| 3 |

Verdicts: `pass`, `fail`, or `untested` (nothing in this environment could decide it). Confidence is the helper's probability for the verdict, or `hand` when decided without it; deterministic verdicts (an exit code, an exact string) record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

[Failed only; `None.` otherwise. One entry per failed item.]

- [A2: `<command>`; expected `<text>` (from `<artifact>:<line>`); observed `<quoted output>`; severity 2.]

## Missing

[Blocked only; `None.` otherwise. Exactly what would let the checks run, one item per line.]

- [Runtime, toolchain, dependency credential, service, or data needed.]

## Human Review

### Review targets

- [The items table, then the findings or the missing list.]

### Verify

- [ ] [Run `<C1 command>`; it exits 0 with `<decisive output>`.]
- [ ] [Re-decide `<id>`: `<command or observation>`; it shows `<expected>`.]

### Known limits

- [Untested items and why, `unclear` rows decided by hand, helper unavailable, uncommitted changes in the tree, no checks defined, or `None.`]
