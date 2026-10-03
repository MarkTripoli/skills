---
name: resolve-pr-reviews
description: Triages open pull request review threads, fixes or answers each with evidence, resolves only handled threads, and tracks the current-head pipeline and approval state. Use when the user runs /resolve-pr-reviews, reviewers left comments on the open PR, or /describe-pr finished and review feedback is next; not for reviewing someone else's PRs (use /group-review).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Resolve Pull Request Reviews

Inspect the current branch's GitHub PR, repair actionable feedback, reply to every handled review thread, and record approval state. Explicit recorded authorization for unattended in-scope review fixes covers replies and resolutions; otherwise obtain action-time confirmation. Ambiguous or scope-expanding dispositions still require a decision. A behavior-changing fix or stale/missing evidence requires `/record-evidence` then `/describe-pr`: publish one real hosted recording per required surface, substantive passing test results/cues, and the complete final PR body plus a distinct same-PR comment. Approval alone never completes delivery proof.

Run in the existing pull request's worktree, with its branch checked out and its original local task directory when available; task files are not branch history. Reuse that branch and merge target; do not create a new task branch for review resolution.

Copy this checklist and tick each item:

```text
- [ ] Context and host selected
- [ ] Current target, head, threads and checks fetched
- [ ] Triage and replies drafted
- [ ] Confirmation or recorded authorization checked
- [ ] Deciding checks passed, fixes pushed, replies read back
- [ ] Current-head required checks passed, actionable threads settled
- [ ] Immutable review artifact recorded when task exists
- [ ] Observed approval and remaining delivery gates reported
```


## Setup

Locate the original task directory and read task.md when available; do not recreate task files from a hosted PR. Read references/pr_review_template.md, pr_review_pending_answer.md, pr_review_approved_answer.md and pr_review_monitored_answer.md. Select current evidence through index.json; `node <skills-dir>/deliver/contract.mjs status <task-dir>` exposes stale and missing prerequisites. A missing baseline requires authentic capture from a temporary worktree at the base commit, not invented observations.

## Identify target

Use the origin host and complete project namespace. GitHub is the personal default: require authenticated `gh` and read [its protocol](references/github.md). For an explicitly selected GitLab project, require authenticated `glab` and read [its protocol](references/gitlab.md). Never infer a second target or change the branch/merge base. Require exactly one open target.

## Fetch state

For GitHub, follow the paginated metadata/thread reads and confirmed mutations in its protocol. For GitLab, run `node <skills-dir>/resolve-pr-reviews/scripts/pr-state.mjs --branch <branch>` and preserve its IID, source/base SHA, discussion/note IDs, approval rules, head pipeline, status checks and `blocked` reasons. In either host, unavailable required state blocks completion; refetch head last and discard moved-head conclusions. Empty threads, mergeability or green checks alone do not establish approval.

## Triage

Write the unresolved review threads as `[{id, author, body, hunk}]` to a temporary JSON file outside the repository (`mktemp`); `hunk` is the few lines of current code the thread points at, omitted when the thread has no location. Run `node <skills-dir>/typed-judgment/judge.mjs triage-threads <file> --json`, where `<skills-dir>` is the directory that contains this skill, then delete the file. Take the helper's `disposition` where it is not `null`; classify the rest yourself as `fix`, `discuss`, `decline`, `clarify`. `addressed` of 0.8 or more signals that the current code may already do what the thread asks: verify against the code before drafting that reply. Each answered run writes one line to stderr, `judge: model <model>, tokens <n> in / <m> out`; do not discard stderr, and copy that line's model and counts into the template's `helper triage` field so a later disagreement can be attributed to a version. Helper unavailable (exit 3, no `node`, no `TYPESAFE_API_KEY`): classify every thread yourself, write `unavailable` in the template's `helper triage` field, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line.

Verify `fix` items against code. Research conventions/sources before `decline`/`discuss`. Default `fix` when no evidence declines. Draft a complete reply per review thread: result/evidence, no tooling mentions. Present the numbered triage with each thread's disposition, `confidence`, and `requests_change`, proposed edits, and exact replies. Wait for confirmation only when the task lacks recorded authorization for these in-scope actions.

## Apply

After required confirmation or under recorded unattended authorization, make the smallest root-cause fixes, add regressions, and run the required checks/gates. Commit and push only when authorized, staging explicit code paths and keeping task artifacts out of code commits.

After checks and an authorized push, apply only planned replies/resolutions through the selected host protocol. Include the verified head SHA, preserve exact thread/discussion IDs and read back each mutation. A declined, discussed or clarified disposition needs confirmation before resolution. State recapture/publication prerequisites separately; stale captures are not proof of a fix.

## Checks and follow-up

When the delivery brief requests PR follow-up, inspect current-head required checks and review threads after creation and every push. A missing, pending, cancelled, skipped or failed required check does not pass; an older head never counts. Read failed-job logs, fix the root cause under the same authorization, run the affected local check, commit/push only source paths and recheck the new head. Persist checked head and check-run IDs/statuses plus handled thread/comment IDs so resumed work does not duplicate replies. Refetch head after fetching checks and review state; discard conclusions if it moved. Poll at a bounded interval only while an active session or persistent scheduled run exists; never claim unattended monitoring without one. Stop follow-up when current-head required checks pass and no actionable thread remains, or an observed external blocker prevents progress. Report approval separately; green checks never imply approval.

## Save

Fetch state again after push and replies. When the original task exists, record the next immutable `pull-request.review` iteration through the conventions' Recording an artifact flow using the template. Record thread/comment IDs, dispositions, replies, head SHA, tests, review threads, checks, and approval based on current PR review state. For evidence, record only verified hosted capture URLs/types for every required surface, tested SHA, current head, substantive passing results/cues and exact same-PR comment permalink; otherwise note stale/missing proof and required follow-up as a remaining gate, not a change in approval state. Save the review locally without committing task files. Do not create or mutate evidence during this stage. Record the source fingerprint and remaining current verification, review, capture, inspection and publication gates; source-changing fixes invalidate them all. If the original task is unavailable, report in the PR itself rather than creating task metadata.

## Next

- Head approved + no open review threads + current-head required checks passed: use `references/pr_review_approved_answer.md`. If behavior changed or any required capture is stale/missing, hand off `/record-evidence` after restoring current verification/review, then `/iterate-evidence` to seal inspection and `/describe-pr` to publish the complete current body/comment. The deliver orchestrator dispatches later phases; standalone use retains fresh-session handoffs. If every hosted recording remains current but publication is incomplete, hand off `/describe-pr`; do not treat a partial Evidence section as final.
- Required checks passed + no actionable threads, but approval pending: use pr_review_monitored_answer.md with status pending and the observed approval state; follow-up is complete, delivery proof is not.
- Otherwise use `pr_review_pending_answer.md`; report any evidence still needing recapture or publication in the review artifact. Another round is a human gate without recorded authorization; do not claim a background poll that is not active.

If you own an existing slack_run_id, send observed head/check/thread/approval status through run event. Finish only after requested proof and follow-up are complete; keep a human-blocked run active. Direct feature-thread mode edits only its existing root.

Use the template only. `{artifact_link}` is the saved canonical *review* artifact path, never a recording/report/description. In the approved template, `{evidence_status}` is either verified capture URL/type per required surface and both complete published links, or "Evidence publication remains pending; PR approval does not complete delivery." `{next_action}` is `Delivery evidence is complete.` only after full hosted proof passes; otherwise use the conventions' `Next action:` and `Open a new session in {run_location}, then run:` lines followed by one fenced `text` command for `/record-evidence` (or `/describe-pr` when only publication remains). Legacy tasks without `index.json` follow the conventions' legacy rules.
