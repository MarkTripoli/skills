---
name: resolve-pr-reviews
description: Run for /resolve-pr-reviews requests. Address pull request review threads, reply with evidence, and repeat until approved.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Resolve Pull Request Reviews

Inspect the current branch's GitHub PR, repair actionable feedback, reply to every handled review thread, and record approval state. External replies and resolutions require the user's action-time confirmation.

Run in the existing pull request's worktree, with its branch checked out and its committed task directory present. Reuse that branch and merge target; do not create a new task branch for review resolution.

## Setup

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists). Read `references/pr_review_template.md`, `pr_review_pending_answer.md`, `pr_review_approved_answer.md`.

## Identify target

Use GitHub for the origin remote. Verify `gh` is installed and authenticated. Find the open PR for the current branch; record its URL, number, base SHA, and head SHA. Stop if there is not exactly one target.

## Fetch state

Fetch PR metadata, submitted reviews, comments, and status checks with `gh pr view <number> --json url,number,baseRefOid,headRefOid,reviewDecision,reviews,statusCheckRollup,comments`. For review threads, run GitHub GraphQL against `repository.pullRequest(number: <number>).reviewThreads(first: 100)` and follow every `pageInfo.hasNextPage` cursor. A thread is unresolved when `isResolved` is false; preserve its GraphQL thread ID and each comment ID, author, body, path, line, and diff hunk. Do not treat green checks, no comments, or mergeability as an approval. Keep the head SHA on conclusions and ensure required checks refer to the current head. No open review threads plus an approved review decision: save the approved artifact and finish.

Get `<owner>` and `<repo>` from `gh repo view --json owner,name`. Fetch a thread page with `gh api graphql -f query='query($owner: String!, $repo: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $repo) { pullRequest(number: $number) { reviewThreads(first: 100, after: $after) { nodes { id isResolved isOutdated path line startLine comments(first: 100) { nodes { id author { login } body url diffHunk path line } pageInfo { hasNextPage endCursor } } } pageInfo { hasNextPage endCursor } } } } }' -F owner='<owner>' -F repo='<repo>' -F number='<number>' -F after='<cursor-or-null>'`. Omit `after` on the first request; repeat with each returned `endCursor` until `hasNextPage` is false, including comment pages where needed.

For each confirmed reply, use `gh api graphql -f query='mutation($threadId: ID!, $body: String!) { addPullRequestReviewThreadReply(input: {pullRequestReviewThreadId: $threadId, body: $body}) { comment { id url } } }' -F threadId='<thread-id>' -F body='<reply>'`. Once the reply and requested action are complete, resolve with `gh api graphql -f query='mutation($threadId: ID!) { resolveReviewThread(input: {threadId: $threadId}) { thread { id isResolved } } }' -F threadId='<thread-id>'`. Keep replies concise enough to safely pass as arguments; verify each returned comment or resolved state before continuing.

## Triage

Write the unresolved review threads as `[{id, author, body, hunk}]` to a temporary JSON file outside the repository (`mktemp`); `hunk` is the few lines of current code the thread points at, omitted when the thread has no location. Run `node <skills dir>/typed-judgment/judge.mjs triage-threads <file> --json`, where `<skills dir>` is the directory that contains this skill, then delete the file. Take the helper's `disposition` where it is not `null`; classify the rest yourself as `fix`, `discuss`, `decline`, `clarify`. `addressed` of 0.8 or more signals that the current code may already do what the thread asks: verify against the code before drafting that reply. Each answered run writes one line to stderr, `judge: model <model>, tokens <n> in / <m> out`; do not discard stderr, and copy that line's model and counts into the template's `helper triage` field so a later disagreement can be attributed to a version. Helper unavailable (exit 3, no `node`, no `TYPESAFE_API_KEY`): classify every thread yourself, write `unavailable` in the template's `helper triage` field, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line.

Verify `fix` items against code. Research conventions/sources before `decline`/`discuss`. Default `fix` when no evidence declines. Draft a complete reply per review thread: result/evidence, no tooling mentions. Present the numbered triage with each thread's disposition, `confidence`, and `requests_change`, proposed edits, and exact replies. Wait for confirmation.

## Apply

After confirmation, make the smallest root-cause fixes, add regressions, and run the required checks/gates. Commit and push only when authorized, staging explicit code paths and keeping task artifacts out of code commits. Reply to each handled thread with evidence and the verified head SHA using GitHub's `addPullRequestReviewThreadReply` GraphQL mutation; resolve a thread with `resolveReviewThread` only after its reply and action are complete. Use the exact GraphQL thread ID from the fetched thread, and verify each mutation's result before continuing. Never resolve declined, discussed, or clarified feedback without a confirmed disposition.

## Save

Fetch state again after push and replies. Record the next immutable `pull-request.review` iteration through the conventions' Recording an artifact flow using the template. Record thread/comment IDs, dispositions, replies, head SHA, tests, review threads, checks, and approval. Commit its canonical path and `index.json` explicitly as `docs(task): pr-review artifact`.

## Next

- Head approved + no open review threads: use `references/pr_review_approved_answer.md`.
- Else: use `pr_review_pending_answer.md`. Repeated command is human gate; no poll/auto-run.

Use the template only. Fill `{artifact_link}` with the saved canonical task-root-relative path. End with one fenced `text` command. A legacy task without `index.json` follows the conventions' legacy rules.
