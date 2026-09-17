---
task: [task slug]
type: app-test
summary: "[Two to four sentences: what was tested and on which surface, the status, the failing or missing items, and what the next phase needs from this file.]"
status: passed | failed | blocked
kind: web | ios | android
target: "[URL, bundle id, package, or path launched; empty when blocked before launch]"
---

# App Test

## Launch

- Revision: [`git rev-parse HEAD` and branch]
- Launched with: [`<exact command or URL>`]
- Driven with: [`agent-browser`, Playwright, Puppeteer, Maestro, idb, or adb]
- Graded by: [typed-judgment helper, or own judgment because the helper was unavailable]

## Steps

| Id | Action | Expected | Observed | Verdict | Severity |
|---|---|---|---|---|---|
| S1 | [What the tester did, with the element named as the snapshot names it.] | [Outcome the artifacts promise, with its source line.] | [One-line digest of the recorded screen text.] | pass \| fail \| unreachable | 0 \| 1 \| 2 \| 3 |

Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

[Failed only; `None.` otherwise. One entry per failed step.]

- [S3: expected `<text>` (from `<artifact>:<line>`); observed `<quoted screen text>`; severity 2.]

## Missing

[Blocked only; `None.` otherwise. Exactly what would let the app launch or be driven, one item per line.]

- [Simulator runtime, emulator, browser driver, credential purpose, build fix, or data needed.]

## Human Review

### Review targets

- [The steps table, then the findings or the missing list.]

### Verify

- [ ] [Launch with `<command>`; the app reaches `<start state>`.]
- [ ] [Re-run step `<id>`: `<action>`; it shows `<expected>`.]

### Known limits

- [Steps not reachable, environments not tried, `unclear` rows decided by hand, or `None.`]
