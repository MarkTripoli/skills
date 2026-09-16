---
name: fix-code-review
description: Run for /fix-code-review requests. Validate and fix every actionable finding from a code review artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Fix Code Review Findings

Repair the reviewed change, verify, and send through another code review before PR creation.

## Setup

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists). Resolve the `@file` review artifact in the task directory; read the file completely. No file: use the newest artifact of type `code-review` whose `status` is `findings` or `blocked`. If ambiguous, ask. Read `references/code_review_fixes_template.md`, `code_review_fixes_answer.md`.

## Validate

Resolve the merge target as the review did: the base of the existing pull request (`gh pr view --json baseRefName` on GitHub, `glab mr view` on GitLab), else the repository default branch. Compare artifact base/head SHAs with current state (`git status --short --branch`, `git diff --name-status <base>...HEAD`). Preserve unrelated changes. If base moved or edits invalidate scope, record drift; re-check findings.

Per critical/major-severity finding: reproduce/prove failure, trace callers, mark `fixed`/`declined`/`blocked`. Decline only with concrete evidence.

minor/trivial/info not mandatory. Address when in scope and reduces risk/complexity without displacing required work; else left advisory. Ask before deleting uncertain code.

## Fix

Fix validated findings in shared location owning behavior. Reuse existing code/platform before adding helpers/dependencies. Do not broaden beyond review/requirements. Each non-trivial fix needs smallest regression check. Keep security, validation, accessibility, data-loss protections intact.

## Verify

Run focused tests, then required gates. Record commands/outcomes. Missing gate remains blocked; do not relabel it as clean.

## Save receipt

Take the next artifact number. Write `NN-code-review-fixes-<summary>.md` using template. Map Critical/Required ids to disposition/evidence. Record advisories separately. Save the file.

## Review again

Read, use `references/code_review_fixes_answer.md` exactly. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-code-review-fixes-slug.md](.agents/tasks/<slug>/NN-code-review-fixes-slug.md)`. Final command: `/review-code`, even when all findings fixed. Only fresh clean review proceeds to PR.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
