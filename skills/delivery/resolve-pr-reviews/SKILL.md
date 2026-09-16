---
name: resolve-pr-reviews
description: Run for /resolve-pr-reviews requests. Address pull request review threads, reply with evidence, and repeat until approved.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Resolve Pull Request Reviews

Inspect current branch's PR/MR, repair actionable feedback, reply to every handled review thread, record approval state. External replies and resolutions require user's action-time confirmation.

## Setup

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists). Read `references/pr_review_template.md`, `pr_review_pending_answer.md`, `pr_review_approved_answer.md`.

## Identify target

Prefer `ticketing.tool`/`vcs.platform` from `ai-utilities.json`; else detect GitHub/GitLab from remote. Use `gh`/`glab`. Verify CLI installed/authenticated. Find open PR for current branch; record URL, number, base SHA, head SHA. Stop if not exactly one target.

## Fetch state

Fetch submissions, unresolved review threads, changes, approvals, checks: `gh pr view --comments` and `gh api repos/<owner>/<repo>/pulls/<number>/comments` on GitHub, `glab mr note list` on GitLab. Do not treat green checks, no comments, or mergeability as an approval. Keep head SHA on conclusions. No open review threads + head approved: save approved artifact, finish.

## Triage

Classify review threads: `fix`, `discuss`, `decline`, `clarify`. Verify `fix` items against code. Research conventions/sources before `decline`/`discuss`. Default `fix` when no evidence declines. Draft a complete reply per review thread: result/evidence, no tooling mentions. Present the numbered triage, proposed edits, and exact replies. Wait for confirmation.

## Apply

After confirmation: smallest root-cause fixes, add regressions, run checks/gates, commit/push when authorized (stage explicit paths; exclude `.agents/tasks/`), reply with evidence/SHA, resolve after reply+action complete. Never resolve declined/discussed/clarified without confirmed disposition.

## Save

Fetch state after push/replies. Take the next artifact number. Write `NN-pr-review-<summary>.md` using template. Record ids, dispositions, replies, SHA, tests, review threads, checks, approval. Save the file.

## Next

- Head approved + no open review threads: use `references/pr_review_approved_answer.md`.
- Else: use `pr_review_pending_answer.md`. Repeated command is human gate; no poll/auto-run.

Use template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-pr-review-slug.md](.agents/tasks/<slug>/NN-pr-review-slug.md)`. End with one fenced `text` command.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
