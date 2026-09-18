---
type: code-review
date: 2026-09-17
branch: any-time-we-do
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 12ec7440ecc4322c25ea29ea314b5e2efdbf9357
status: clean
summary: "Reviewed the full branch at `12ec744` against `main`. The `05` major is closed: `a28bf23` defines `<repo>` as the main worktree's basename and gives `git worktree add -b <slug>` a `<target>` start point, and a temporary-repository reproduction from another task's worktree now yields `wt/myrepo/task-b` holding only the base commit; `05` ADV-001 is closed too, the skip case keys on the branch passed to `-b` with `epic-<slug>` named. All four `task.md` criteria hold: the worktree rule and `deliver` step 5 by inspection and reproduction, the Archon path by inspection, the stale-wording grep hits only `CHANGELOG.md:35` and task artifacts, `npm test` by the `04` record at `9b0c8a2` plus `node scripts/validate.mjs` exit 0 at HEAD. Three advisories, none blocking: a branch cut from `origin/HEAD` tracks `origin/main`, so a bare `git push` under `push.default=simple` refuses (`--no-track` fixes it); the first two `<target>` sources cannot apply when a new task opens its worktree; the Archon reply still shows the command it ran. Next: `/describe-pr`."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`main`; `gh pr view` finds no pull request for the branch, `task.md` has no `base:`, so the repository default branch)
- reviewed HEAD: `12ec7440ecc4322c25ea29ea314b5e2efdbf9357` on `any-time-we-do`
- commits: `033566c` open task, `719d5c0` feat worktree default, `d15a47e` feat deliver starts the run, `9b0c8a2` fix align docs and narrow the skip case, `a28bf23` fix stable repo name and start point, and the artifact commits `b6ad5a2` `dbfab26` `788c4d4` `566b0d0` `41b0865` `12ec744`
- staged and unstaged changes: none (`git status --short --branch` prints only `?? .ignore`)
- task-owned untracked files: none before this review; `07` is written by it
- excluded changes: `.agents/tasks/any-time-any-work/*`; the untracked `.ignore`, not part of the change

## Requirements and Standards

- task or ticket: `task.md`: every by-hand task opens its own worktree by default, plus the deliver-starts-run change folded in at `04`; four acceptance items, decided below.
- implementation source: `01-implementation-any-time-any-work.md` (receipt; oneshot has no plan), `02-verification-any-time-any-work.md` (passed at `b6ad5a2`; A3 untested), `05-code-review-any-time-any-work.md` (one major, two advisories), `06-code-review-fixes-any-time-any-work.md` (CR-001 fixed and ADV-001 accepted at `a28bf23`, ADV-002 left advisory).
- repository instructions: `AGENTS.md` (`workflows/delivery.md` is the long form, `docs/cheatsheet.md` the short one), `shared/CONVENTIONS.md`, `shared/WRITING.md`.

## Change Profile

- intent and expected behavior: (1) a by-hand task opens `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>` cut from the merge target, before `task.md` is written, without asking, with four skip cases; (2) `deliver` with Archon starts `archon workflow run` in the foreground and replies with the run id and first pause.
- change description quality: `719d5c0`, `d15a47e`, and `a28bf23` carry bodies stating the defect or behavior and the decision; `a28bf23` names both clauses it changes and why. `9b0c8a2` is subject-only, its decisions live in `04`.
- implementation model and review model: not recorded in the receipts; this review ran inline in Oh My Pi (Claude), no child worker.
- changed-line size and logical cohesion: 14 non-artifact files, 67 insertions, 27 deletions, all prose plus two changesets. Two behaviors, both named in `task.md` scope.
- resulting large-file concerns: none.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: no test file changed. `npm test` runs `scripts/validate.mjs` (line 6 links, answer-template handoffs, pack coverage, banned tokens), the plugin and pack staleness checks, and `node --test tests/`; none reads the steps a skill's prose describes.
- missing or misleading coverage: both behaviors rest on inspection and on a live run; `npm run evals` has no `deliver` scenario. `a28bf23` changed prose only in files the validator links through, and `node scripts/validate.mjs` exits 0 at HEAD (below).

## Five-Axis Assessment

### Correctness

- assessment and evidence: The `05` findings, re-checked against the text at HEAD:
  - CR-001 closed. `shared/CONVENTIONS.md:34` is now `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`; line 38 defines `<repo>` as `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"` and `<target>` as the merge target in the Commits section's order, which `shared/CONVENTIONS.md:129` states. Reproduced in a temporary clone `myrepo` with worktree `wt/myrepo/task-a` holding one commit: from `task-a`, the `<repo>` expression printed `myrepo`, and `git worktree add ../task-b -b task-b origin/HEAD` gave `task-b` a log of the single `base` commit. The line 42 parenthetical ("`<repo>` and `<target>` resolve the same from any worktree of the repo") is now true. `docs/cheatsheet.md:102`, `docs/getting-started.md:150`, `workflows/delivery.md:252`, and `.changeset/task-worktree-by-default.md` quote the command with `<target>`.
  - ADV-001 closed. Line 42 keys the skip case on "the task's branch, the name passed to `-b` (`<slug>`, or `epic-<slug>` for an epic; ...)"; the changeset says "a session already on the task's branch".
  - ADV-002 stands as recorded (ADV-003 below).

  The four `task.md` criteria against the diff:
  1. By-hand worktree: `skills/delivery/deliver/SKILL.md` step 5 opens the worktree per the conventions with the step 4 branch and path `~/.agents/worktrees/<repo>/<slug>`, creates `task.md` there, commits `docs(task): open <slug>`; `deliver_hand_answer.md` carries `Worktree: <path> on branch <branch>`. Holds by inspection and by the reproduction above from both the main checkout and another task's worktree. Verification `02` A3 (a live non-Archon `/deliver`) stays untested here.
  2. Archon starts the run: step 4 runs the command in the foreground with an hour-plus timeout, attaches with `archon workflow wait` when the worktree is held, and replies with run id, state, branch, worktree, remaining pauses; `deliver_archon_answer.md` opens "The workflow is running" and ends with `approve`/`reject`/`wait` guidance and no fence. Holds by inspection; unchanged since `05`.
  3. Doc consistency: `grep` for `prints? the (Archon )?command|printed command|do not run it|Never run the command|Run the command above` over the worktree hits `CHANGELOG.md:35` (released entry, historical), the task artifacts quoting the old text, and the unrelated `delivery-wave` row (`workflows/delivery.md:52`, "`children=manual` prints the commands"). `AGENTS.md:8`, `docs/cheatsheet.md:22`, `workflows/delivery.md:18` and `:238`, and the four `runtimes/*.md` line 7 agree. Holds.
  4. `npm test` exits 0: recorded in `04` at `9b0c8a2` (`tests 61 pass 61 fail 0`). `a28bf23` touched five prose files; `node scripts/validate.mjs` at HEAD exits 0 with `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens`. Holds on the record plus the validator; the full suite was not re-run here by instruction.

  New in this round: the branch the fixed command creates tracks the remote-tracking start point (ADV-001), and the `<target>` order's first two sources cannot apply at the moment a new task's worktree is opened (ADV-002). Neither changes what lands in the pull request.

### Readability and Simplicity

- assessment and evidence: Line 38 grew to one paragraph carrying three definitions and two fallbacks; it stays in the order the command reads (`<repo>`, `<slug>`, `<target>`), each with its command and the failure it prevents, so a reader can execute it top to bottom. No dead prose left by `a28bf23`: the "basename of the project root" definition was replaced, not kept beside the new one.

### Architecture

- assessment and evidence: One rule in `shared/CONVENTIONS.md`, reached by every `SKILL.md` through the line 6 link; the `<target>` order points at the Commits section instead of restating it; the three docs and the changeset quote the command, not the resolution, so `a28bf23` changed one clause in each. `deliver` step 5 delegates to the section and names only the branch and path. Right owners.

### Security

- assessment and evidence: No untrusted input or secret. The worktree path is under the user's home; the request is single-quoted with `'\''` escaping in the Archon command, unchanged from `main`. `--detach` is forbidden.

### Performance

- assessment and evidence: Not applicable; prose only. The `<repo>` expression runs one `git worktree list` per task open.

## Verification Story

- command or inspection: `git status --short --branch`, `git merge-base main HEAD`, `git log --oneline main..HEAD`, `git diff --name-status main...HEAD`, `git diff main...HEAD -- . ':!.agents'` read in full, `git show a28bf23 --stat`; `grep` for stale deliver wording over the worktree; `node scripts/validate.mjs`; a temporary repository (`git init` origin, `git clone`, one worktree with a commit) to confirm the CR-001 fix and probe the `<target>` clause.
- result: scope as pinned. Stale wording: none outside `CHANGELOG.md`, the task artifacts, and the unrelated `delivery-wave` row. Validator: exit 0. Temporary repository, from the `task-a` worktree: `<repo>` printed `myrepo`; `task-b` cut from `origin/HEAD` logs only `base`; `git -C task-b rev-parse --abbrev-ref @{u}` printed `origin/main`, and `git -C task-b push --dry-run` printed `fatal: The upstream branch of your current branch does not match the name of your current branch`; the same command with `--no-track` left `task-b` with no upstream. In a repository whose remote was added by hand and fetched (git 2.50.1), `origin/HEAD` was set, so the `origin/HEAD` fallback resolved.
- manual, screenshot, or before-and-after evidence: none. Neither `deliver` path was run live; see Review Limits.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 A branch cut from `origin/HEAD` tracks `origin/main`, so a bare `git push` refuses

- type: Potential issue
- severity: minor
- category: Data integrity and integration
- location: `shared/CONVENTIONS.md:34` (the `git worktree add` line), `:38` (the `<target>` fallback `origin/HEAD`)
- evidence: `git worktree add -b <slug> <path> <remote-tracking ref>` applies `--track` by default, so the task branch's upstream becomes `origin/main`. Reproduced: `git -C task-b rev-parse --abbrev-ref @{u}` printed `origin/main` and `git push --dry-run` printed `fatal: The upstream branch of your current branch does not match the name of your current branch`. `describe-pr` step 2 and its Save section say "push" without a form; `gh pr create` recovers on its own (it pushes `HEAD:refs/heads/<branch>` with `--set-upstream` when the SHAs differ), a plain `git push` does not. The pull request contents are unaffected.
- suggestion: Add `--no-track` to the command on line 34 (`git worktree add --no-track ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`), verified to leave the branch with no upstream, and carry it into the three docs and the changeset that quote the line; or have `describe-pr` push as `git push -u origin <branch>`.

### ADV-002 The first two `<target>` sources cannot apply when a new task opens its worktree

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `shared/CONVENTIONS.md:38`
- evidence: The worktree is opened "before `task.md` is written" (line 31), and a new task has no branch yet, so no pull request base and no `task.md` `base:` exist at that moment; the order resolves to the default branch every time the rule runs. The second skip case (task directory already existed) means the rule never runs for a task whose `task.md` could carry `base:`.
- suggestion: None required; the order matches the Commits section and costs nothing. If the paragraph is shortened, "the repository default branch (`origin/HEAD`, or `main` without a remote)" is the clause that does the work.

### ADV-003 The Archon reply still shows the command line

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `skills/delivery/deliver/references/deliver_archon_answer.md:5-7`
- evidence: Carried from `05` ADV-002, left advisory in `06`. "Started from the project root:" followed by the inline `archon workflow run ...` line; the reply opens "The workflow is running" and ends without a fence, so criterion 2 stands.
- suggestion: None required. If a reader keeps pasting it, replace the line with the run id sentence alone.

## Dead Code and Dependency Review

- newly orphaned code: none. `a28bf23` replaced the "basename of the project root" definition and the `-b <slug>` command in place in every file that carried them (`git show a28bf23 --stat`: five files, 7 insertions, 7 deletions). The `05` inventory of replaced `deliver` prose stands; `CHANGELOG.md:35` is a released entry, left as history.
- dependency findings: none; no dependency or lockfile change.

## Verdict

- decision: approve
- overall code-health change: Up. The worktree rule is now correct from the main checkout, from another task's worktree, and from a feature branch, with one owner and a pointer to the Commits section for the target order; the deliver-starts-run behavior has one owner and no contradicting doc.
- rationale: The `05` major is fixed and reproduced fixed; the four `task.md` criteria hold on the diff, the reproduction, the grep, the `04` test record, and the validator at HEAD. The three advisories are a push ergonomics gap that `gh pr create` recovers from, a degenerate but harmless resolution order, and a carried informational note; none is critical or major.

## Review Limits

- blocked or unavailable checks: `npm test` beyond `scripts/validate.mjs` was not re-run in this pass by instruction; the `04` record at `9b0c8a2` covers the unchanged test surface and `a28bf23` is prose only. The two Archon claims in `SKILL.md` step 4 (`--detach` refused for a workflow that can pause; a run on a held worktree fails before dispatch naming the earlier run id) were not exercised, as in `05`.
- residual manual verification: run `/deliver` by hand in a non-Archon repository from another task's worktree and confirm the path lands under the repository's name, the branch's log starts at the default branch, and the reply's `Worktree:` line (verification A3, still untested); with Archon, confirm the run starts and the reply carries the run id and the gate.
