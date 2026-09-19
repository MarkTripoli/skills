---
name: resolve-pr-reviews
description: Run for /resolve-pr-reviews requests. Address pull request review threads, reply with evidence, and repeat until approved.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Resolve Pull Request Reviews

Inspect current branch's PR/MR, repair actionable feedback, reply to every handled review thread, record approval state. External replies and resolutions require user's action-time confirmation.

Run in the existing pull request's worktree, with its branch checked out and its committed task directory present. Reuse that branch and merge target; do not create a new task branch for review resolution.

## Setup

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists). Read `references/pr_review_template.md`, `pr_review_pending_answer.md`, `pr_review_approved_answer.md`.

## Identify target

Prefer `ticketing.tool`/`vcs.platform` from `ai-utilities.json`; else detect GitHub/GitLab from remote. Use `gh`/`glab`. Verify CLI installed/authenticated. Find open PR for current branch; record URL, number, base SHA, head SHA. Stop if not exactly one target.

## Fetch state

Fetch submissions, unresolved review threads, changes, approvals, checks: `gh pr view --comments` and `gh api repos/<owner>/<repo>/pulls/<number>/comments` on GitHub, `glab mr note list` on GitLab. Do not treat green checks, no comments, or mergeability as an approval. Keep head SHA on conclusions. No open review threads + head approved: save approved artifact, finish.

## Triage

Write the unresolved review threads as `[{id, author, body, hunk}]` to a temporary JSON file outside the repository (`mktemp`); `hunk` is the few lines of current code the thread points at, omitted when the thread has no location. Run `node <skills dir>/typed-judgment/judge.mjs triage-threads <file> --json`, where `<skills dir>` is the directory that contains this skill, then delete the file. Take the helper's `disposition` where it is not `null`; classify the rest yourself as `fix`, `discuss`, `decline`, `clarify`. `addressed` of 0.8 or more signals that the current code may already do what the thread asks: verify against the code before drafting that reply. Each answered run writes one line to stderr, `judge: model <model>, tokens <n> in / <m> out`; do not discard stderr, and copy that line's model and counts into the template's `helper triage` field so a later disagreement can be attributed to a version. Helper unavailable (exit 3, no `node`, no `TYPESAFE_API_KEY`): classify every thread yourself, write `unavailable` in the template's `helper triage` field, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line.

Verify `fix` items against code. Research conventions/sources before `decline`/`discuss`. Default `fix` when no evidence declines. Draft a complete reply per review thread: result/evidence, no tooling mentions. Present the numbered triage with each thread's disposition, `confidence`, and `requests_change`, proposed edits, and exact replies. Wait for confirmation.

## Apply

After confirmation: smallest root-cause fixes, add regressions, run checks/gates, commit/push when authorized (stage explicit code paths; keep `.agents/tasks/` files out of the code commit), reply with evidence/SHA, resolve after reply+action complete. Never resolve declined/discussed/clarified without confirmed disposition.

## Save

Fetch state after push/replies. Take the next artifact number. Write `NN-pr-review-<summary>.md` using template. Record ids, dispositions, replies, SHA, tests, review threads, checks, approval. Save the file. Commit it with `git add <path>` as `docs(task): pr-review artifact`.

## Next

- Head approved + no open review threads: use `references/pr_review_approved_answer.md`.
- Else: use `pr_review_pending_answer.md`. Repeated command is human gate; no poll/auto-run.

Use template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-pr-review-slug.md](.agents/tasks/<slug>/NN-pr-review-slug.md)`. End with one fenced `text` command.
