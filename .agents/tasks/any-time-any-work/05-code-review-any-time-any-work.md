---
type: code-review
date: 2026-09-17
branch: any-time-we-do
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 566b0d06426349f627827ceeab180c0a6b8f5ba3
status: findings
summary: "Reviewed the full branch at `566b0d0` against `main`: both `03` majors are fixed (no deliver doc says it prints the command; the skip case keys on the task branch) and three of the four `task.md` criteria hold by inspection of the prose, the fourth by the recorded `npm test` at `9b0c8a2`. One major finding remains: the Task worktree rule defines `<repo>` as the basename of the project root and gives `git worktree add -b <slug>` no start point, so a `/deliver` run from another task's worktree (where the docs send every later session) creates `~/.agents/worktrees/<other-slug>/<slug>` cut from that task's branch, carrying its commits into the new pull request; the `9b0c8a2` sentence that says the correct worktree is still opened is false. The fix is two clauses in `shared/CONVENTIONS.md`: take `<repo>` from the first line of `git worktree list --porcelain` and cut the branch from the merge target."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`main`; no pull request exists for the branch, `task.md` has no `base:`)
- reviewed HEAD: `566b0d06426349f627827ceeab180c0a6b8f5ba3` on `any-time-we-do`
- commits: `033566c` open task, `719d5c0` feat worktree default, `b6ad5a2` `dbfab26` `788c4d4` `566b0d0` task artifacts, `d15a47e` feat deliver starts the run, `9b0c8a2` fix align docs and narrow the skip case
- staged and unstaged changes: none; one untracked path `.ignore`, not part of the change
- task-owned untracked files: none; `05` is written by this review
- excluded changes: `.agents/tasks/any-time-any-work/*`; the untracked `.ignore`

## Requirements and Standards

- task or ticket: `task.md`: every by-hand task opens its own worktree by default; scope extended in the `04` fix pass to the deliver-starts-run change (`d15a47e`), with four acceptance items.
- implementation source: `01-implementation-any-time-any-work.md` (receipt; oneshot has no plan), `02-verification-any-time-any-work.md` (passed at `b6ad5a2`; A3 untested), `03-code-review-any-time-any-work.md` (two majors, two advisories), `04-code-review-fixes-any-time-any-work.md` (both majors and both advisories addressed at `9b0c8a2`).
- repository instructions: `AGENTS.md` (`workflows/delivery.md` is the long form, `docs/cheatsheet.md` the short one, docs follow the YAML), `shared/CONVENTIONS.md`, `shared/WRITING.md`.

## Change Profile

- intent and expected behavior: (1) a by-hand task opens `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>` before `task.md` is written, without asking, with four skip cases; (2) `deliver` with Archon starts `archon workflow run` in the foreground and replies with the run id and first pause instead of printing the command.
- change description quality: `719d5c0` and `d15a47e` carry bodies that state behavior and motivation; `9b0c8a2` is subject-only, its decisions live in `04`. The `04` artifact records the option-2 decision and the user's direction for it.
- implementation model and review model: not recorded in the receipts; this review ran inline in Oh My Pi (Claude), no child worker.
- changed-line size and logical cohesion: 14 non-artifact files, 67 insertions, 27 deletions, all prose plus two changesets. Two behaviors, now both named in `task.md` scope.
- resulting large-file concerns: none.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: no test file changed. `npm test` runs `scripts/validate.mjs` (line 6 links, answer-template handoffs, pack coverage, banned tokens), the plugin and pack staleness checks, and `node --test tests/`; none of them reads the steps a skill's prose describes.
- missing or misleading coverage: both behaviors rest on inspection and on a live run. `npm run evals` has no scenario for `deliver` on either path. The `04` artifact records `npm test` exit 0, `tests 61 pass 61 fail 0` at `9b0c8a2`; HEAD adds only the `04` artifact after that.

## Five-Axis Assessment

### Correctness

- assessment and evidence: The four `task.md` criteria, decided against the diff:
  1. By-hand worktree: `skills/delivery/deliver/SKILL.md` step 5 opens the worktree with the step 4 branch at `~/.agents/worktrees/<repo>/<slug>`, creates `task.md` in it, commits `docs(task): open <slug>`; `deliver_hand_answer.md` carries `Worktree: <path> on branch <branch>`. Holds from the main checkout. From another worktree the rule produces the wrong path and the wrong start point (CR-001). Verification `02` A3 stays untested; no live non-Archon session here.
  2. Archon starts the run: step 4 runs the command in the foreground with an hour-plus timeout, attaches with `archon workflow wait` when the worktree is held, and replies with run id, state, branch, worktree, remaining pauses; `deliver_archon_answer.md` opens "The workflow is running" and ends with `approve`/`reject`/`wait` guidance, no fence. `archon --help` lists `workflow wait <run-id>` and `--branch` "(or reuse existing)". Holds by inspection; see Review Limits for the two Archon claims not exercised.
  3. Doc consistency: `grep` for `prints? the (Archon )?command|printed command|do not run it|Never run the command|Run the command above` over the worktree hits only `CHANGELOG.md:35` (a released entry, historical) and the `03`/`04` artifacts quoting the old text. `AGENTS.md:8`, `docs/cheatsheet.md:22`, `workflows/delivery.md:18` and `:238`, and the four `runtimes/*.md` line 7 all say the run is started and the first pause reported. Holds.
  4. `npm test` exits 0: recorded in `04` at `9b0c8a2` with the validator line and `tests 61 pass 61 fail 0`; not re-run here (see Review Limits). Holds on that record.

  Beyond the criteria, the Task worktree rule has a defect the `9b0c8a2` rewrite made load-bearing: `<repo>` is "the basename of the project root", and `git worktree add ... -b <slug>` names no start point, so from inside another task's worktree both resolve to that task, not the repository (CR-001, reproduced below). The skip case keyed on branch `<slug>` also misses the `epic-<slug>` branch the same section says `deliver` passes to `-b` (ADV-001).

### Readability and Simplicity

- assessment and evidence: The prose follows the writing guide: rule first, command in a bash block, skip cases as bullets, one home for the rule. `workflows/delivery.md:18` and `:238` now agree. No dead prose: the old "Pauses:" list and "Run the command above" line were replaced, not left beside the new text.

### Architecture

- assessment and evidence: One rule in `shared/CONVENTIONS.md`, reached by every `SKILL.md` through the line 6 link, applied by `deliver` and referenced by the three docs; no per-skill copy. The runtime notes own the per-harness mechanism for a long command, so `deliver` step 4 says "the runtime's supervised long-running-process mechanism" once. Both are the right owners.

### Security

- assessment and evidence: No untrusted input or secret. The worktree path is under the user's home; the request is single-quoted with `'\''` escaping in the Archon command, unchanged from `main`. `--detach` is forbidden, so no run outlives the session unobserved.

### Performance

- assessment and evidence: Not applicable; prose only. The foreground run holds a shell for minutes per phase, which step 4 and each runtime note state.

## Verification Story

- command or inspection: `git status --short --branch`, `git merge-base main HEAD`, `git log main..HEAD`, `git diff --name-status main...HEAD`, `git diff main...HEAD -- . ':!.agents'` read in full; `grep` for stale deliver wording over the worktree; `archon --help`; a temporary git repository to reproduce CR-001 and confirm its fix.
- result: scope as pinned above. Stale wording: none outside `CHANGELOG.md` and the task artifacts. Reproduction: in a repo `myrepo` with worktree `wt/myrepo/task-a` holding one commit, from `task-a`: `basename "$(git rev-parse --show-toplevel)"` prints `task-a`; `git worktree add wt/task-a/task-b -b task-b` gives `task-b` the same HEAD as `task-a`, and `git log task-b` contains the `task-a` commit. `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"` prints `myrepo` from both the main checkout and the worktree.
- manual, screenshot, or before-and-after evidence: none. Neither `deliver` path was run live; see Review Limits.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 The worktree rule run from another worktree lands in the wrong directory on the wrong base

- type: Potential issue
- severity: major
- category: Functional correctness
- location: `shared/CONVENTIONS.md:33-38` (the `git worktree add` block and the `<repo>` sentence), `shared/CONVENTIONS.md:42` (the skip bullet's parenthetical added in `9b0c8a2`)
- failure mode: `<repo>` is defined as "the basename of the project root", and the command is `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug>` with no start point. Inside a worktree the project root is the worktree, and `-b` cuts from that worktree's HEAD. A user who finishes task A at `~/.agents/worktrees/myrepo/task-a` and types `/deliver <new request>` there, which `docs/cheatsheet.md:102` and `docs/getting-started.md:150` steer toward ("run every later session from the worktree"), gets `~/.agents/worktrees/task-a/<slug>` on a branch that contains every task A commit; the new pull request carries task A's diff. The `9b0c8a2` parenthetical, "Being in some other task's worktree does not skip it: `git worktree add` runs the same from any worktree of the repo, so the correct one is still opened", states the opposite and is false. The same start-point gap applies from the main checkout when HEAD is a feature branch: the task branch forks from it, unlike Archon, whose `--branch` cuts from the remote base (`docs/getting-started.md:30`).
- evidence or reproduction: Verification Story above: `basename "$(git rev-parse --show-toplevel)"` printed `task-a` from the task-a worktree; `task-b` created from there had the same HEAD as `task-a` and its commit in `git log`. `archon --help` shows `--branch` and a separate `--from <name>` "Create new branch from specific start point", the distinction the rule drops.
- fix direction: Two clauses in the Task worktree section. Define `<repo>` as the basename of the main worktree, `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"` (verified to print `myrepo` from both the main checkout and a worktree), and give the command a start point: `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`, where `<target>` is the merge target in the order the Commits section already states (existing pull request base, `task.md` `base:`, else the repository default branch, `origin/HEAD` or `main`). Then the parenthetical on the skip bullet becomes true and can stay. `deliver` step 5 and the three docs quote the path, not the resolution, so they need no change; the changeset `task-worktree-by-default.md` should mention the base.

## Advisories

### ADV-001 The skip case names branch `<slug>`, but `deliver` passes `epic-<slug>` to `-b`

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `shared/CONVENTIONS.md:42` against `shared/CONVENTIONS.md:38`
- evidence: Line 38: "a skill whose own rule names the branch (`deliver` prefixes an epic branch with `epic-`) passes that name to `-b` and keeps the slug in the path." Line 42: "The session is already on branch `<slug>` (`git rev-parse --abbrev-ref HEAD`), that is, already in this task's own worktree." An epic task's later phase runs on `epic-<slug>`, not `<slug>`, so the bullet as written does not match, and only the second skip case (task directory exists) saves it.
- suggestion: Key the bullet on "the task's branch, the name passed to `-b`", and keep `<slug>` as the example.

### ADV-002 The Archon reply still shows the command line

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `skills/delivery/deliver/references/deliver_archon_answer.md:5-7`
- evidence: "Started from the project root:" followed by the inline `archon workflow run ...` line. `task.md` criterion 2 says no command is printed for the user to paste. The line is a record of what ran, inline rather than fenced, and the reply opens "The workflow is running" and ends without a fence, so the criterion was decided as met.
- suggestion: None required. If a reader keeps pasting it, replace the line with the run id sentence alone.

## Dead Code and Dependency Review

- newly orphaned code: none. The replaced lines in `deliver_archon_answer.md` (`Pauses:` list, "Run the command above") and `SKILL.md` step 4 ("do not run it", "Never run the command for the user") have no remaining references; `CHANGELOG.md:35` is a released entry, left as history.
- dependency findings: none; no dependency or lockfile change.

## Verdict

- decision: request_changes
- overall code-health change: Up. The worktree default and the deliver-starts-run behavior each have one owner, the `03` contradiction is gone, and `task.md` now states the scope the branch ships. The one debt is a rule that is correct from the main checkout on the default branch and wrong from the location the docs send users to.
- rationale: CR-001 is reproduced, task-caused (the `<repo>` definition and the missing start point are new in `719d5c0`; the false parenthetical is new in `9b0c8a2`), and two clauses fix it. Nothing else blocks.

## Review Limits

- blocked or unavailable checks: `npm test` was not re-run in this pass by instruction (the diff was checked at `9b0c8a2`; HEAD adds one artifact); the record in `04` is the evidence for criterion 4. Two Archon claims in `SKILL.md` step 4 were not exercised: that `--detach` is refused for a workflow that can pause, and that a run on a held worktree fails before dispatch with a message naming the earlier run id. `archon --help` does not list `--detach` under `workflow run` options (it appears only in `workflow cancel`'s description and in `README.md:67`), so the refusal wording rests on the `d15a47e` author's observation.
- residual manual verification: run `/deliver` by hand in a non-Archon repository from its main checkout and confirm the worktree path, branch, committed `task.md`, and the reply's `Worktree:` line (verification A3, still untested); with Archon, confirm the run starts, the reply carries the run id and the gate, and a second `/deliver` on the same branch attaches instead of starting.
