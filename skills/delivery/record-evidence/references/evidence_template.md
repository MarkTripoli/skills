---
type: evidence
status: passed
summary: "[One or two sentences: the result line, captured surfaces, exact revision under test, and hosted capture/comment location. Downstream phases read this instead of the report.]"
---

# Evidence Receipt

`status` is the worst result across every test: `passed`, `untested`, or `failed`.

## Revision

- commit: [sha]
- branch: [name]
- environment: [OS / browser / device / deployment]

## Sessions

- [UI label]: `evidence/<session>/report.md`, `evidence/<session>/evidence.mp4`
- composite: `evidence/composite/report.md`, `evidence/composite/composite.mp4` (when several surfaces were composed)
- [CLI/API/agent label]: `evidence/<session>/report.md`, captured terminal/probe/transcript file, and the command or script that reproduces it

## Results

| Test | Result | Capture timestamp or line |
|---|---|---|
| [It should ...] | passed | 00:12 or output line 24 |

## Caveats

- [Untested items and why, timing notes, or `None.`]

## Posted to

- PR description: [hosted capture URL or `describe-pr pending` before the PR exists]
- PR comment: [comment URL or `describe-pr pending` before the PR exists]
- Tracker issue: [link or `not attached`]
