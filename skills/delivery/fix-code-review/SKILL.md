---
name: fix-code-review
description: Run for /fix-code-review requests. Validate and fix every actionable finding from a code review artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Code Review Findings

Repair the reviewed change, verify, and send through another code review before PR creation. The delivery workflow's review loop (or the user, by hand) alternates `/review-code` and `/fix-code-review` until a review is clean.

## Setup

Locate the task directory and read `task.md`. Resolve explicit `@file`; otherwise use current `review.code` when its status is `findings` or `blocked`. Read it completely, then read the fix templates.

## Validate

Resolve the merge target as the review did: the base of the existing pull request (`gh pr view --json baseRefName` on GitHub, `glab mr view` on GitLab), else `base:` from `task.md` when present, else the repository default branch. Compare artifact base/head SHAs with current state (`git status --short --branch`, `git diff --name-status <base>...HEAD`). Preserve unrelated changes. If base moved or edits invalidate scope, record drift; re-check findings.

Per critical/major-severity finding: reproduce/prove failure, trace callers, mark `fixed`/`declined`/`blocked`. Decline only with concrete evidence.

minor/trivial/info not mandatory. Address when in scope and reduces risk/complexity without displacing required work; else left advisory. Ask before deleting uncertain code.

## Fix

Fix validated findings in shared location owning behavior. Reuse existing code/platform before adding helpers/dependencies. Do not broaden beyond review/requirements. Each non-trivial fix needs smallest regression check. Keep security, validation, accessibility, data-loss protections intact.

## Verify

Run focused tests, then required gates. Record commands/outcomes. Missing gate remains blocked; do not relabel it as clean.

## Save receipt

Record the next immutable `review.fixes` iteration through the conventions' Recording an artifact flow using the template. Map Critical/Required ids to disposition/evidence and record advisories separately. Commit its canonical path and `index.json` explicitly as `docs(task): code-review-fixes artifact`; fixes to code go in their own commit with explicit code paths.

## Review again

Use `references/code_review_fixes_answer.md` exactly. Fill `{artifact_link}` with the saved canonical task-root-relative path. Final command: `/review-code`, even when all findings are fixed. Only a fresh clean review proceeds to PR. A legacy task without `index.json` follows the conventions' legacy rules.
