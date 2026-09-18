---
type: code-review-fixes
date: 2026-09-17
branch: any-time-we-do
review_artifact: 05-code-review-any-time-any-work.md
reviewed_head_sha: 566b0d06426349f627827ceeab180c0a6b8f5ba3
fixed_head_sha: a28bf231ccb5317c683e22b2d49acbf24303577d
status: complete
summary: "CR-001 fixed at `a28bf23`: the Task worktree rule now defines `<repo>` as the basename of the main worktree (`git worktree list --porcelain`, first entry) and gives `git worktree add -b <slug>` a `<target>` start point resolved in the Commits section's order; reproduced before and confirmed after in a temporary repository (a task opened from another task's worktree now has only the base commit and lands under the repository's name). ADV-001 accepted in the same commit: the skip case keys on the task's branch, the name passed to `-b`, with `epic-<slug>` named. ADV-002 left advisory. The three docs quoting the command and the changeset carry `<target>`. `node scripts/validate.mjs` passed; `npm test` not run this pass by instruction."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: base `31d9b0f` unchanged (`git merge-base main HEAD`). Head moved from `566b0d0` to `41b0865` by one commit, `docs(task): code-review artifact`, which added `05` and touched no code; findings re-checked against `41b0865` and still applied.
- unrelated changes preserved: the untracked `.ignore` was left alone; no staged or unstaged changes existed before this pass.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-001

- disposition: fixed
- evidence: Confirmed against the text at `41b0865`: `shared/CONVENTIONS.md:34` was `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug>` with no start point, and line 38 defined `<repo>` as "the basename of the project root". Reproduced in a temporary repository `myrepo` with worktree `wt/myrepo/task-a` holding one commit: from `task-a`, `basename "$(git rev-parse --show-toplevel)"` printed `task-a`, and `git worktree add ... -b task-b` gave `task-b` the `task-a` commit (`git log --oneline task-b`: `task-a work`, `base`). Fix, two clauses in the Task worktree section: `<repo>` is the basename of the main worktree, `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"` (printed `myrepo` from both the main checkout and `task-a`), and the command is `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>` with `<target>` the merge target in the Commits section's order (existing pull request base, `task.md` `base:`, else the repository default branch, `origin/HEAD` or `main`). The existing-branch clause now spells the checkout command (`git worktree add <path> <slug>`) instead of "drop `-b`", which with `<target>` present would have checked out the base detached. The skip bullet's parenthetical was rewritten to state why it holds (`<repo>` and `<target>` resolve the same from any worktree). Per the review's fix direction the changeset `task-worktree-by-default.md` names the base; the three docs that quote the command (`docs/cheatsheet.md:102`, `workflows/delivery.md:252`, `docs/getting-started.md:150`) were given the same `<target>` (`main` in the walkthrough) so no doc shows the command without it.
- files changed: `shared/CONVENTIONS.md`, `.changeset/task-worktree-by-default.md`, `docs/cheatsheet.md`, `docs/getting-started.md`, `workflows/delivery.md` (commit `a28bf23`, `fix: give the task worktree a stable repo name and a start point`)
- regression check: in the same temporary repository, from the `task-a` worktree, the fixed rule (`<repo>` from `git worktree list --porcelain`, `git worktree add wt/myrepo/task-d -b task-d main`) created `wt/myrepo/task-d` whose `git log --oneline task-d` is the single `base` commit; the main checkout stayed on `main`. Prose rule, so the check is this run, not a committed test.

## Advisory Decisions

### ADV-001

- disposition: accepted
- reason: In scope of the same section and the same commit. The skip bullet now reads "The session is already on the task's branch, the name passed to `-b` (`<slug>`, or `epic-<slug>` for an epic; check with `git rev-parse --abbrev-ref HEAD`)", so an epic task's later phase on `epic-<slug>` matches the first skip case rather than relying on the second. The changeset's skip-case list says "a session already on the task's branch" to match.

### ADV-002

- disposition: left_advisory
- reason: The review requires nothing; the line in `deliver_archon_answer.md:5-7` is a record of what ran, inline and unfenced, and `task.md` criterion 2 was decided as met at `05`. Replacing it would broaden past the review without a reported reader pasting it.

## Verification

- command: `node scripts/validate.mjs` (from the worktree, after the edits)
- result: `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`, exit 0. Temporary-repository reproduction and regression check as recorded under CR-001. `npm test` beyond the validator was not run in this pass by instruction; the `04` record at `9b0c8a2` (`tests 61 pass 61 fail 0`) covers the unchanged test surface, and this commit touches prose only.

## Remaining Blocks

- None.
