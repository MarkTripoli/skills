---
type: code-review
date: 2026-09-20
branch: feat/jev-ios
base_branch: main
base_sha: fd28a8e868e4aac524652d6939d10aa7e0dba2c3
head_sha: be49ab348068f35f8454969df31e66dd2649116c
status: findings
summary: "The current iOS safety repair is product-safe and its native receipts reconcile to Casey/Jordan PID 9661 and standalone Name PID 29301, but the literal preservation requirement remains unmet because two earlier failed original recordings were deleted and cannot be recovered."
---

# Code Review

## Scope

- merge base: `fd28a8e868e4aac524652d6939d10aa7e0dba2c3` (`main`)
- reviewed HEAD: `be49ab348068f35f8454969df31e66dd2649116c`
- commits: `fd28a8e..be49ab3` (45 commits)
- staged and unstaged changes: none
- task-owned untracked files: none
- excluded changes: unrelated task directories and ignored native media; task-owned committed evidence and current safety-repair documentation were reviewed

## Previous Round

- previous artifact: `13-code-review-jev-ios.md`
- `None.` The previous artifact's critical/required findings section was `None.`

## Requirements and Standards

- task or ticket: `.agents/tasks/jev-ios/task.md`, especially evidence preservation, independent native observations, same-PID replacement, standalone execution, truthful failures, and cleanup
- implementation source: `safety-repair-current.md`, `evidence-recovery-current.md`, `native-safety-current.md`, `evidence-inventory.md`, `14-repair-verification-jev-ios.md`, and current task handoff artifacts
- repository instructions: `AGENTS.md`, `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `skills/delivery/review-code/SKILL.md`

## Change Profile

- intent and expected behavior: reject unusable parsed iOS app-state records, revalidate the focused iOS target and frame before TYPE_TEXT dispatch, and reconcile standalone evidence without relabeling blocked history
- change description quality: current receipts explicitly identify passing PID 16750/PID 29301 evidence, preserve blocked evidence as non-green, and state that the deleted PID 98075 and replacement originals are not recovered
- implementation model and review model: product code, tests, and diagnostics are attributed to `openai-codex/gpt-5.6-luna-fast`; this review independently inspected the changed source, exact probes, receipts, manifests, reports, and frames
- changed-line size and logical cohesion: product repair is focused in cleanup parsing and iOS text dispatch; the current HEAD delta is documentation/evidence reconciliation
- resulting large-file concerns: none introduced by the current repair
- dependency or lockfile changes: none

## Tests Reviewed First

- behavior claimed by tests: parsed-but-unusable cleanup records are rejected while `[]` and Unknown/null-PID remain valid; focused iOS frames are revalidated before text dispatch; iOS post-text WAIT behavior remains bounded; cleanup failures remain non-green
- missing or misleading coverage: no product-safety gap found. The literal preservation criterion is not a testable code regression: the retained recovery record documents irreversible historical loss rather than fabricating recovered media.

## Five-Axis Assessment
- helper axis-coverage: second pass: correctness covered level 3 confidence 0.99; readability covered level 2 confidence 0.71; architecture covered level 3 confidence 0.81; security covered level 3 confidence 0.71; performance covered level 3 confidence 0.90. Stderr provenance: `judge: model jev-1.13.0, tokens 3227 in / 73 out`.

### Correctness

- assessment and evidence: Product safety is approved. `node /tmp/jev-ios-risk-diagnostic.mjs` rejects `{}`, error objects, and PID-without-state records while accepting valid `[]` and Unknown/null-state. `node /tmp/jev-ios-production-observe-probe.mjs` dispatches `set-value` at the reobserved `109,93` frame and rejects the unobserved raw-text result. `npm test` passes 152/152. The literal evidence-preservation requirement remains unmet because `evidence-recovery-current.md:22-30` records destructive deletion of the failed replacement attempt and PID 98075 standalone originals, with no original media recovered.
- helper coverage: covered, level 3, confidence 0.99

### Readability and Simplicity

- assessment and evidence: The repair uses narrow boundary checks and focused regressions. Evidence documents distinguish actual copied PID 16750/PID 29301 passes from blocked historical receipts and reconstructed transcript data.
- helper coverage: covered, level 2, confidence 0.71

### Architecture

- assessment and evidence: Process-state validation remains in `acceptance.mjs`; focused-target identity/frame validation remains in `ios.mjs`; evidence reconciliation stays in task artifacts. No new dependency or pass-through abstraction was introduced.
- helper coverage: covered, level 3, confidence 0.81

### Security

- assessment and evidence: The repair adds no credentials, uploads, device resets, or destructive recovery operations. Exact probes use mocked owned calls, and the native receipt records the authorized simulator, app bundle, driver, and PID. The recovery record states that post-inspection copying used unique destinations and did not delete or overwrite existing evidence.
- helper coverage: covered, level 3, confidence 0.71

### Performance

- assessment and evidence: The repair adds one bounded re-observation before iOS text dispatch and bounded app-state validation. No unbounded loop, query, or dependency was introduced; the aggregate suite completed in 6.5 seconds.
- helper coverage: covered, level 3, confidence 0.90

## Verification Story

- command or inspection: `node /tmp/jev-ios-risk-diagnostic.mjs`; `node /tmp/jev-ios-production-observe-probe.mjs`; `npm test`; `jq`/`ffprobe` on `/tmp/jev-ios-native-safety-current-20260920T084236-2488/replacement-corrected-1789908188-8659` and `standalone-1789908337-26043`; inspected `final.png` frames and current recovery/handoff artifacts
- result: both exact probes exited 0 with expected safety behavior; aggregate tests report 152 passed and 0 failed; same-launch Casey then Jordan observations retain simulator/app/PID `9661`; standalone `Confirmed Name` retains simulator/app/PID `29301`; both recordings and reports are verified. The standalone final frame visibly shows `Confirmed Name via Email.`
- manual, screenshot, or before-and-after evidence: inspected the standalone final PNG and receipt observations; inspected replacement receipt observations showing independent `Confirmed Casey via Email.` and `Confirmed Jordan via Email.` statuses under the same PID. No device action was performed by this review.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Historical recording preservation remains unmet

- type: Potential issue
- severity: major
- category: Data integrity and integration
- location: `.agents/tasks/jev-ios/evidence-recovery-current.md:22-30`
- failure mode: The task requires preserving evidence for every native run, but earlier destructive retries deleted the failed replacement recording and the PID 98075 standalone original recording. The current recovery copies and reconstructed receipt/transcript preserve provenance and acknowledge the loss, but they cannot restore the deleted original media; marking the literal task complete would therefore assert an unproven preservation criterion.
- evidence or reproduction: The retained Luna-fast transcript records `rm -rf /tmp/jev-ios-current-replacement` before retry and `rm -rf /tmp/jev-ios-current-standalone` after the PID 98075 run. The current recovery artifact states that bounded read-only searches found no original PID 98075 video/report/frame/manifest and no original replacement attempt bytes. The actual passing PID 16750 and PID 29301 receipts are separate later runs and do not satisfy preservation of those deleted attempts.
- fix direction: No safe in-repository code fix exists. The integration owner must obtain an external backup/source if one exists, or record the objective as irreversibly unmet and obtain the required user resolution. Do not rerun, relabel, reconstruct as media, delete more evidence, or claim `stop_review_loop true` from green product tests alone.

## Advisories

None.

## Dead Code and Dependency Review

- newly orphaned code: none found
- dependency findings: none

## Verdict

- decision: request_changes
- overall code-health change: Product safety is improved and independently demonstrated; literal delivery acceptance remains blocked by the irreversible historical preservation loss.
- rationale: The repaired cleanup and focused-coordinate invariants hold under exact diagnostic probes and 152 aggregate tests. The current native receipts reconcile to the actual passing same-PID and standalone runs, and the artifacts do not fabricate recovery. The preservation criterion is still a major unmet requirement, so the batch cannot be called complete.

## Review Limits

- blocked or unavailable checks: No additional safe recovery source was found in the bounded sources named by the recovery artifact; no further repeated search is warranted. Native device actions, uploads, deletes, pushes, PR operations, old-run resumption, and Android interaction were not performed.
- residual manual verification: External resolution of the deleted recordings is required for the literal preservation objective; product safety verdict does not depend on another native rerun.
