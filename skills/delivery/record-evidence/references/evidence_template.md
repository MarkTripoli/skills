---
type: evidence
status: passed
summary: "[One or two sentences: the result line (tests passed, failed, untested), the surfaces recorded, the revision under test, and where the video was posted. Downstream phases read this instead of the report.]"
---

# Evidence Receipt

`status` is the worst result across every test: `passed`, `untested`, or `failed`.

## Revision

- commit: [sha]
- branch: [name]
- environment: [OS / browser / device / deployment]

## Sessions

- [Label]: `evidence/<session>/report.md`, `evidence/<session>/evidence.mp4`
- composite: `evidence/composite/report.md`, `evidence/composite/composite.mp4` (when several surfaces were composed)

## Results

| Test | Result | Video time |
|---|---|---|
| [It should ...] | passed | 00:12 |

## Caveats

- [Untested items and why, timing notes, or `None.`]

## Posted to

- [PR comment link, tracker issue link, or `requester only`]
