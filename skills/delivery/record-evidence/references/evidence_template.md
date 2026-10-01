---
type: evidence
status: passed
revision: "[exact contract source fingerprint]"
summary: "[Captured targets, observed result, exact source/build identity, and next required phase. Baseline uses type evidence-baseline; final uses evidence.]"
---

# Evidence Receipt

`status` matches observed required results: `passed` or `failed`. Missing required capture/inspection is `blocked` and cannot be sealed for publication. Baseline may truthfully record the old failure; new-only baseline records exemptions without fabricated media.

## Revision

- commit: [sha]
- branch: [name]
- environment: [OS / browser / device / deployment]
- source fingerprint: [contract revision output, including dirty-source identity]
- loaded build verification: [observed method, result, retained output]
- policy: `evidence-policy.json` [helper-computed SHA-256]
- original baseline: [numbered sealed evidence-baseline receipt, or this receipt in baseline mode]

## Executable checkpoint

- phase: [record-evidence-baseline or record-evidence]
- seal command: [exact helper invocation; its returned hash/sidecar checkpoint is saved separately, never inserted into this sealed receipt]
- current phase / remaining evidence: [observed `status` result before sealing, or none]
- last completed / next incomplete action: [actual boundary]

## Sessions

- [Tablet label, device and viewport]: `evidence/<session>/report.md`, `evidence/<session>/evidence.mp4`; direct video URL: [URL]; screenshots: [start path and URL], [changed-state path and URL], [final path and URL]
- [Mobile label, device and viewport]: `evidence/<session>/report.md`, `evidence/<session>/evidence.mp4`; direct video URL: [URL]; screenshots: [start path and URL], [changed-state path and URL], [final path and URL]
- existing UI composite: `evidence/composite/composite.mp4`, `report.md`; source BEFORE/AFTER paths, `--no-align`
- cross-device composite: `evidence/composite/report.md`, `evidence/composite/composite.mp4` (optional; does not replace separate sessions)
- [CLI/API/agent label]: `evidence/<session>/report.md`, captured terminal/probe/transcript file, and the command or script that reproduces it

## Results

| Test | Result | Capture timestamp or line |
|---|---|
| [It should ...] | passed | 00:12 or output line 24 |

## Inspection

| Target/surface | Source capture and sample or output lines | Observed pixels/output | Viewer/tool trace and timing limits |
|---|---|---|---|
| [policy ID] | [actual retained paths, timestamp coordinate or line range] | [actual state against expectation] | [trace, interval/cadence, limits] |

File/sample SHA-256, bytes, media probe, source/policy/receipt binding, and hosted byte verification live in the helper's sealed JSON record. Build that record using `delivery_contract.md`, not handwritten hashes.

## Caveats

- [Untested items and why, timing notes, or `None.`]

## Posted to

- Selected final capture(s): [direct hosted URLs; baseline: not required]
- Playback/readability check: [actual reopen observation and tool trace; final helper also verifies bytes]
- PR description `## UI Evidence` and distinct comment: `describe-pr pending` [publication records links later without editing this sealed receipt]
- Tracker issue: [verified link or not requested]
