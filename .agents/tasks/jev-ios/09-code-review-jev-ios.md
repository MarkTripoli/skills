---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: 4458fbf21e199dad45376b8164f78c2165ac1d20
head_sha: 98bf90c
status: findings
summary: "The b95285c controller and cleanup repairs pass the exact Luna-authored probes and 149 durable tests, but the claimed exact-Name and standalone native proof relies on an external helper that rewrites the requested refusal goal to a canned Enter Name goal; rerun with the documented helper contract or record the acceptance as unproven."
---

# Code Review

## Scope

- merge base: `4458fbf21e199dad45376b8164f78c2165ac1d20` (`main`)
- reviewed HEAD: `98bf90c`
- commits: `4458fbf..98bf90c` (including repair `b95285c` and subsequent task evidence)
- staged and unstaged changes: none
- task-owned untracked files: none
- excluded changes: unrelated task directories and ignored native media; committed `.agents/tasks/jev-ios/` evidence is reviewed as acceptance evidence, not product scope

## Previous Round

- previous artifact: `07-code-review-jev-ios.md` (no critical or required findings)
- `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md`, especially exact label-equal Name, external standalone execution, truthful outcomes, cleanup, and no manufactured green evidence
- implementation source: `.agents/tasks/jev-ios/02-verification-jev-ios.md`, `04-verification-continuation-jev-ios.md`, `08-repair-verification-jev-ios.md`, and `evidence-inventory.md`
- repository instructions: `shared/WRITING.md`, `shared/CONVENTIONS.md`, `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: preserve ordinary native WAIT choices while retaining ambiguity repair, and reject unusable iOS app-state output instead of certifying cleanup
- change description quality: repair commit is focused; later evidence claims affected native reruns and standalone proof
- implementation model and review model: Luna-fast-authored product/tests and diagnostics; review is evidence-based with exact probes and aggregate tests
- changed-line size and logical cohesion: small repair plus prior iOS integration and committed verification records
- resulting large-file concerns: existing dense acceptance orchestration remains difficult to audit but no new structural issue blocks this review
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: `npm test` passes 149/149; durable tests preserve ordinary WAIT and distinguish malformed/empty cleanup output from valid `[]` and `Unknown`/null-PID states
- missing or misleading coverage: no durable test proves the external helper preserves the raw exact-Name goal; the helper itself rewrites exact refusal text and receipts do not record the original goal or helper transcript

## Five-Axis Assessment

- helper axis-coverage: first run model `jev-1.13.0`, tokens `3058` in / `73` out; second run model `jev-1.13.0`, tokens `3142` in / `73` out. Second stderr: `judge: model jev-1.13.0, tokens 3142 in / 73 out`.

### Correctness

- assessment and evidence: `typesafe.mjs` now retains WAIT for ordinary text entry and removes it only for relevant ambiguity. `appRunning` returns unusable for empty/malformed output, while valid `[]` and `Unknown`/null-PID are accepted. `/tmp/jev-controller-probe.mjs` returns `TYPE_TEXT,WAIT,DONE` and passed; `/tmp/jev-stop-probe.mjs` rejects empty, malformed, and interrupted-empty observations while preserving valid stopped positives. The live exact-Name claim is not proven because the external helper rewrites the goal before JEV sees it.
- helper coverage: covered, level 3, confidence 0.96 (second run; first 0.95)

### Readability and Simplicity

- assessment and evidence: The repair has direct, bounded branches and durable regression tests. The external helper is opaque to the repository and silently changes task text, making evidence provenance unclear.
- helper coverage: covered, level 2, confidence 0.69 (second run; first 0.73)

### Architecture

- assessment and evidence: Cleanup parsing belongs in `acceptance.mjs` and is covered at the boundary. The acceptance contract allows a configured helper, but the claimed standalone setup is an undocumented wrapper outside the repository rather than a documented generic helper contract.
- helper coverage: covered, level 3, confidence 0.64 (second run; first 0.58)

### Security

- assessment and evidence: No credentials or raw native values were added. The helper wrapper contains no credentials and receipts retain model/identity metadata without secrets. No new security defect was found.
- helper coverage: covered, level 3, confidence 0.61 (second run; first 0.55)

### Performance

- assessment and evidence: The repair adds no unbounded loops or dependency changes. Aggregate tests complete successfully.
- helper coverage: unclear, level 3, confidence 0.15 on second run; manually covered at level 2, confidence 0.80 because the bounded code path and aggregate test provide direct performance evidence

## Verification Story

- command or inspection: `node /tmp/jev-controller-probe.mjs`; `node /tmp/jev-stop-probe.mjs`; `npm test`; inspected current continuation receipts, reports, inventory, and `/tmp/jev-ios-text-helper-continuation.py`
- result: probes pass; cleanup probe preserves `[]` and Unknown/null-PID positives; npm reports 149 passed and 0 failed. Current generic, replacement, blocked, and cleanup receipts are retained. The genuine failed receipt is the older `evidence/repair-cb7b53a/failed/jev-receipt.json`; the current impossible-status attempt is blocked, not failed.
- manual, screenshot, or before-and-after evidence: current label-equal report records only `Confirmed Name` and action narration. The helper source proves it rewrites `Confirm the current exact Name value without replacing it` to `Enter Name exactly`; no raw helper transcript proves the original goal reached the model. Screenshots/video were not independently rerun because this provenance gap is established from the retained source and receipts.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Exact-Name acceptance is proven with a rewritten goal, not the required raw helper contract

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `/tmp/jev-ios-text-helper-continuation.py:4`
- failure mode: The external helper rewrites the exact refusal wording to `Enter Name exactly` and rewrites the replacement seed wording to `Enter Casey exactly`. The successful receipt therefore proves a task-specific alternate prompt, not that the documented generic helper can preserve and execute the requested exact label-equal Name goal. A helper can manufacture a green path by recognizing these canned strings, so the exact-Name and installed standalone acceptance claims are not independently reproducible from the documented contract.
- evidence or reproduction: The wrapper contains `prompt.replace('Confirm the current exact Name value without replacing it','Enter Name exactly')`; `label-equal-name/report.md` records only `Confirmed Name` and actions, while `jev-receipt.json` has no original goal or helper transcript. `08-repair-verification-jev-ios.md:34` explicitly says the wrapper was configured with equivalent concise wording after the helper returned an empty value for the longer wording. The repository docs say a separately configured text helper may supply validated text, but do not document or authorize rewriting acceptance goals. The standalone claim uses the same external wrapper, so it does not independently establish generic standalone behavior.
- fix direction: Rerun exact-Name and standalone with the documented helper command unchanged and preserve its raw text contract/transcript, or add and document a generic helper protocol that returns validated text without goal-specific rewriting. Record the original goal, helper input/output, command, and exit status in evidence; if the helper cannot handle that goal, retain `blocked` and do not claim acceptance.

## Advisories

### ADV-001 Receipts should record goal provenance for external helper runs

- type: Refactor suggestion
- severity: minor
- category: Data integrity and integration
- location: `skills/delivery/jev-ui/scripts/acceptance.mjs:19`
- evidence: Native receipts record expected postconditions and decisions but not the goal sent to the helper or helper command identity, so a rewritten prompt is invisible in the durable receipt.
- suggestion: Include a redacted goal/helper provenance field or retain a separately checksummed raw helper transcript for standalone acceptance.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: none

## Verdict

- decision: request_changes
- overall code-health change: The two b95285c product repairs are correct and regression-tested; acceptance evidence has a major provenance gap.
- rationale: The exact probes, durable tests, and aggregate test suite establish WAIT preservation and cleanup parsing. The required exact-Name and standalone proof cannot be accepted while the only successful run uses an external wrapper that rewrites the requested goal.

## Review Limits

- blocked or unavailable checks: No new native run or video inspection was performed; retained receipts and helper source were sufficient to identify the acceptance-proof defect. Typed axis-coverage second pass remained `unclear` only for performance, which was examined manually as a bounded local path with no dependency or loop growth.
- residual manual verification: Re-run exact Name and installed standalone with an unchanged documented helper, preserving raw text contract and evidence; do not conflate the current blocked impossible-status receipt with the genuine failed `repair-cb7b53a` receipt.
