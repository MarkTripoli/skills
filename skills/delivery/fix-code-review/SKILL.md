---
name: fix-code-review
description: Validates every critical and major finding in a code-review artifact, fixes the proven ones, disputes the wrong ones with evidence, and records a receipt. Use when the user runs /fix-code-review or /review-code ends with status findings; not for fixing a reproduced bug (use /fix-bug) or addressing pull request threads (use /resolve-pr-reviews).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Code Review Findings

Repair the reviewed change, verify, and send through another code review before PR creation. The delivery workflow's review loop (or the user, by hand) alternates `/review-code` and `/fix-code-review` until a review is clean.

## Setup

Locate the task and read `task.md`, creating it from the request when absent. Resolve explicit `@file`, otherwise current `review.code` with `findings` or `blocked`. Read it completely, then `references/code_review_fixes_template.md` and `references/code_review_fixes_answer.md`.

When the latest evidence inspection failed, reserve the repair: use the attempt id your assignment names and do not reserve again; with no id, call `node <skills-dir>/deliver/contract.mjs repair-begin "$TASK" <attempt-id>` before editing and `repair-complete` after.

For a delivery task, save the output of `node <skills-dir>/deliver/contract.mjs revision <task-dir>` as `revision`, never a git hash, record the policy and baseline paths, and report the evidence still missing. A source change makes earlier verification, review, recording and inspection historical. `node <skills-dir>/deliver/contract.mjs status <task-dir>` reports currency; optional for manual work.

## Validate

Resolve the merge target as the review did: the base of the existing pull request (`gh pr view --json baseRefName`), else `base:` from `task.md` when present, else the repository default branch. Compare artifact base/head SHAs with current state (`git status --short --branch`, `git diff --name-status <base>...HEAD`). Preserve unrelated changes. If base moved or edits invalidate scope, record drift; re-check findings.

Per critical/major-severity finding: reproduce/prove failure, trace callers, mark `fixed`, `disputed: <evidence>`, or `blocked`. A disputed finding is left for the human, not re-litigated.

Advisories (minor, trivial, info) are optional. Mark one `accepted` and fix it only when the fix is inside the reviewed diff and does not add a file, helper or dependency; mark it `left_advisory` otherwise; mark it `declined` with a reason when the suggestion is wrong. Ask before deleting code you are unsure about.

## Fix

Fix validated findings in shared location owning behavior. Reuse existing code/platform before adding helpers/dependencies. Do not broaden beyond review/requirements. Each non-trivial fix needs smallest regression check, and the receipt names its test file path. Keep security, validation, accessibility, data-loss protections intact.

For a `/deliver` task with delegated execution, assign each bounded independent repair to a child worker. The stage owner verifies the diff and tests and integrates the work. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable. Do not send two workers into the same files at once.

## Verify

Run the test that covers each fix, then the repository checks CI runs for the changed files (`package.json` scripts, `Makefile` targets, CI file); `/verify-implementation` re-runs the full set next. Record commands and outcomes. Missing gate remains blocked; do not relabel it as clean. A blocker that needs a human goes to the orchestrator; run by hand, post it to the task's Slack thread per [feature-thread mode](https://github.com/MarkTripoli/skills/blob/main/skills/delivery/agent-slack-control-plane/references/feature-thread.md#post-a-blocker).

## Save receipt

Allocate the next immutable iteration through the conventions. Write `<task-root>/<slug>/artifacts/review/fixes/<NNNN>.md` using the template. Map Critical/Required ids to `fixed` or `disputed: <evidence>` with evidence and record advisories separately. Save the receipt locally. Commit code fixes separately using explicit paths, excluding the resolved task root; never stage, commit, or push task artifacts.

Record source identity, baseline/policy paths, and remaining current verification/review/evidence. Source changes invalidate the older verification and recording as well as the review.

## Hand off

Use `references/code_review_fixes_answer.md` exactly. Fill `{artifact_link}` with the saved canonical task-root-relative path. Final command: `/review-code`, even when all findings are fixed. Only a fresh clean review proceeds to PR. A legacy task without `index.json` follows the conventions' legacy rules.
