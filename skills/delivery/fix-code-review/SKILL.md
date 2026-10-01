---
name: fix-code-review
description: Run for /fix-code-review requests. Validate and fix every actionable finding from a code review artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Code Review Findings

Repair the reviewed change, verify, and send through another code review before PR creation. The delivery workflow's review loop (or the user, by hand) alternates `/review-code` and `/fix-code-review` until a review is clean, three rounds pass, or a round makes no progress (`contract.mjs review` reports `limit_reached` and `progress`).

## Setup

Locate the task directory and read `task.md` per the conventions, creating one from the request when none exists. Resolve explicit `@file`; otherwise use current `review.code` when its status is `findings` or `blocked`. Read it completely, then read the fix templates.

When the latest evidence inspection failed, reserve the repair: use the attempt id your assignment names and do not reserve again; with no id, call `node <skills-dir>/deliver/contract.mjs repair-begin "$TASK" <attempt-id>` before editing and `repair-complete` after. `node <skills-dir>/deliver/contract.mjs status <task-dir>` reports artifact currency and what publication lacks; optional for manual work.

## Validate

Resolve the merge target as the review did: the base of the existing pull request (`gh pr view --json baseRefName`), else `base:` from `task.md` when present, else the repository default branch. Compare artifact base/head SHAs with current state (`git status --short --branch`, `git diff --name-status <base>...HEAD`). Preserve unrelated changes. If base moved or edits invalidate scope, record drift; re-check findings.

Per critical/major-severity finding: reproduce/prove failure, trace callers, mark `fixed`, `disputed: <evidence>`, or `blocked`. A disputed finding is left for the human, not re-litigated.

minor/trivial/info not mandatory. Address when in scope and reduces risk/complexity without displacing required work; else left advisory. Ask before deleting uncertain code.

## Fix

Fix validated findings in shared location owning behavior. Reuse existing code/platform before adding helpers/dependencies. Do not broaden beyond review/requirements. Each non-trivial fix needs smallest regression check. Keep security, validation, accessibility, data-loss protections intact.

For a `/deliver` task with delegated execution, assign each bounded independent repair to a child worker. The stage owner verifies the diff and tests and integrates the work. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable. Do not send two workers into the same files at once.

## Verify

Run focused tests, then required gates. Record commands/outcomes. Missing gate remains blocked; do not relabel it as clean. When a `blocked` finding or gate needs a human decision or access, report it to the orchestrator; run by hand, post one blocker to the task's Slack thread per `agent-slack-control-plane` [feature-thread mode](https://github.com/MarkTripoli/skills/blob/main/skills/delivery/agent-slack-control-plane/SKILL.md#post-a-blocker).

## Save receipt

Allocate the next immutable iteration through the conventions. Write `<task-root>/<slug>/artifacts/review/fixes/<NNNN>.md` using the template. Map Critical/Required ids to `fixed` or `disputed: <evidence>` with evidence and record advisories separately. Save the receipt locally. Commit code fixes separately using explicit paths, excluding the resolved task root; never stage, commit, or push task artifacts.

Record source identity, baseline/policy paths, and remaining current verification/review/evidence. Source changes invalidate the older verification and recording as well as the review.

## Review again

Use `references/code_review_fixes_answer.md` exactly. Fill `{artifact_link}` with the saved canonical task-root-relative path. Final command: `/review-code`, even when all findings are fixed. Only a fresh clean review proceeds to PR. A legacy task without `index.json` follows the conventions' legacy rules.
