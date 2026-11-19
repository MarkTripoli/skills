---
name: retrospect
description: Decides whether a finished agent run, a stuck session, a user's correction, a review catch, a revert or a recurring kind of bug holds a lesson worth keeping, and only when it does, records it in a lessons ledger and opens one draft pull request that changes the lesson's owner; later answers its review comments, carries out accepted actions and checks that the lesson held. Use when the user runs /retrospect or /retrospect follow-up, or asks what to learn from a run, a task, a mistake or a correction they just made; not for fixing the bug itself (/fix-bug), reviewing a change (/review-code) or diagnosing a skill's structure (/skill-doctor).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Retrospect

Find out whether something went wrong in a way that will happen again, and if so, turn it into one change a person can accept or reject. A lesson is done when it held, not when its PR merged. Most runs hold no lesson: "Nothing to learn" with a one-line reason is the usual, correct result. `<skill-dir>` is the directory holding this SKILL.md.

## Requirements

- `git`, and Node.js for `<skill-dir>/scripts/ledger.mjs`.
- `gh`, signed in, for product PRs, review threads and PR states. Without it every ledger command still works locally and reports what it skipped. GitHub is the only host the script reaches; for another host, the user opens the PR by hand from the branch the report names.

## Inputs

- `/retrospect`: about this conversation, such as a correction the user just made. Their account is the evidence.
- `/retrospect <path-or-PR>`: a task directory under the configured task root (default `.agents/tasks/`), a session transcript or log file, or a PR number or URL.
- `/retrospect follow-up`: skip the steps below and follow [references/follow_up.md](references/follow_up.md).

## Guardrails

- Products are for people. Open every product as a draft PR. Never merge it, mark it ready or enable auto-merge. Merging it is the user's approval.
- One product per lesson, at most three products per run. Past three, record the rest as `watching` and say so.
- Never change a skill or instruction file that the run under review is still using; the product PR changes it for later runs.
- In an interactive conversation, ask one clarifying question only when the evidence cannot settle who owns the lesson. An unattended run decides by the rules in [references/products.md](references/products.md) and says how it decided.
- The reply is the announcement. Post nowhere else unless the user asks; mention once that they can ask for a post.

## Steps

```
Retrospect progress:
- [ ] 1. Gate: a signal found, or stop with "Nothing to learn"
- [ ] 2. Timeline written from the evidence
- [ ] 3. Ledger read
- [ ] 4. Each candidate held to the bar
- [ ] 5. Products opened
- [ ] 6. Ledger recorded and published
- [ ] 7. Reported
```

1. **Gate.** Look for a signal in what exists. Stop at the first match that holds; with none, reply `Nothing to learn: <one line on why the run was clean>` and stop without touching the ledger.
   - The user corrected the agent in this conversation, or says it repeated a past mistake.
   - A task directory's records show a failed or blocked status, a verification or review that found something after the builder said done, or a phase rerun.
   - `git log --oneline -30` on the branch shows a `Revert` commit, or `fixup!` or fix commits that follow a review.
   - The PR has review threads that asked for a change (`gh pr view <n> --comments`, or `gh api repos/{owner}/{repo}/pulls/<n>/comments`).
   - The session log shows the agent stuck: the same failing command three or more times, or a stop waiting on the user that the evidence could have answered.
   - The same kind of bug appears in the ledger or in recent fix commits.
2. **Timeline.** Read what the signal points at and write five to ten lines: what should have happened, what did, and where time or the user's effort went. Check the current state as well as the record; a run's own account can be stale.
3. **Ledger.** Find the ledger repository: `--repo <dir>`, else `SKILLS_LESSONS_DIR`, else the current repository. Run `node <skill-dir>/scripts/ledger.mjs start [--repo <dir>]`; it prints a fresh `worktree` on a new `lessons/` branch. Run `node <skill-dir>/scripts/ledger.mjs list --repo <worktree>` and keep the lessons in mind.
4. **The bar.** Read [references/bar.md](references/bar.md) and hold each candidate to it. Each ends as one of:
   - no lesson: drop it with a one-line reason;
   - another occurrence of a ledger lesson: record it; a `watching` lesson reaching two occurrences is promoted to `proposed` by the script;
   - a new lesson: `proposed` when the cost test passes, otherwise `watching`.
   A lesson in `acting`, `verifying` or `held` that happened again did not hold: record the occurrence (`sync` marks it `not-held`) and propose a stronger product. A `rejected` lesson stays rejected unless the evidence is new in kind.
5. **Products.** For each newly `proposed` lesson, read [references/products.md](references/products.md) and open its draft PR. A product that fails to open is recorded with `--product none` and the failure in the occurrence.
6. **Record and publish.** A new lesson's file has `## What happened`, `## Cause` and `## Rule`; the Rule is the one thing a later run or reviewer does differently.

   ```sh
   node <skill-dir>/scripts/ledger.mjs record --repo <worktree> --slug <slug> --evidence "<occurrence text with links>" \
     [--title "<title>" --target <target> --lesson-file <lesson.md>] [--status proposed --product <PR url> --verify "<how to tell it held>" --verify-after <YYYY-MM-DD>]
   node <skill-dir>/scripts/ledger.mjs sync --repo <worktree>
   node <skill-dir>/scripts/ledger.mjs publish --repo <worktree> --message "docs(lessons): <summary>"
   ```

   `publish` commits only `lessons/`, pushes, and opens a normal PR for the user to merge. Without `gh`, a GitHub remote or any remote, it keeps the commit on the local branch and its `note` says what the user does next.
7. **Report.** One line per lesson: title, new or repeated, status, product link or why there is none. Then the ledger PR or its `note`. When nothing passed the bar, say "Nothing to learn" and give each dropped candidate's reason. End with one line offering to post the report somewhere if the user wants that.

## Example

Input: `/retrospect` after the user wrote "you said the fix was done again without running the failing test".

1. Gate: a correction in this conversation.
2. Timeline: the agent edited `parse.ts`, ran the type check, and reported done; the user ran `npm test -- parse` and it failed. The ledger holds one earlier occurrence from five days ago.
3. Ledger: `claim-done-without-failing-test` is `watching` with one occurrence.
4. Bar: concrete (two transcripts), owned by `skill:verify-implementation`, recurring, cost a correction each time. The second occurrence promotes it to `proposed`.
5. Product: a draft PR adding a check to the verification skill that fails when the report names no run of the test that reproduced the bug, with a test that fails without it.
6. Recorded with the PR and `--verify "no done claim without the failing test's run in the next 14 days"`; the ledger PR is open for the user.

Reply: `claim-done-without-failing-test: repeated, proposed, <draft PR url>. Ledger: <ledger PR url>.`

## Troubleshooting

- `ledger.mjs` exits 1 with "not inside a git repository": pass `--repo <dir>` or set `SKILLS_LESSONS_DIR` to the ledger checkout.
- `sync` lists URLs under `unknown`: `gh` is missing, signed out, or cannot see that repository. Run `gh auth status`; statuses stay as they were until it can read them.
- The session log is gone: work from the task records, `git log` and the PR, and say the log was missing.
