Task: `any-time-any-work`

## Purpose

Give a by-hand task the same isolation an Archon run gets: every skill opens `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>` before writing `task.md`, and `deliver` with Archon starts the run and reports its first pause instead of printing a command to paste.

## Acceptance criteria

- A by-hand `/deliver` without `archon` opens the worktree on branch `<slug>`, commits `task.md` there, and names the path and branch: `skills/delivery/deliver/SKILL.md` step 5 and `deliver_hand_answer.md` carry it, and the `07` review reproduced the `git worktree add ... -b <slug> <target>` line in a temporary repository from another task's worktree (`wt/myrepo/task-b` holds only the base commit). The live `/deliver` reply itself is untested: no session here lacks `archon` ([02-verification](.agents/tasks/any-time-any-work/02-verification-any-time-any-work.md), item A3).
- With Archon, `/deliver` starts `archon workflow run delivery-<pack>` in the foreground, waits for the first pause or end, and replies with the run id and gate: holds by inspection of step 4 and `deliver_archon_answer.md` ("The workflow is running", no fence). Not run live.
- `workflows/delivery.md`, `docs/cheatsheet.md`, `AGENTS.md`, and the four `runtimes/*.md` agree on deliver-starts-run: `grep` for `prints? the (Archon )?command|printed command|do not run it|Never run the command|Run the command above` hits only `CHANGELOG.md:35` (a released entry) and task artifacts quoting the old text.
- `npm test` exits 0: recorded at `9b0c8a2` with `tests 61`, `pass 61`, `fail 0` ([04-code-review-fixes](.agents/tasks/any-time-any-work/04-code-review-fixes-any-time-any-work.md)); the two commits after it change prose only and `node scripts/validate.mjs` exits 0 at `a28bf23`. The full suite was not re-run at HEAD.

## Special things to note

- Two behaviors ship together. The deliver-starts-run change (`d15a47e`) was folded into this task's scope at the `03` review (CR-001, option 2) so it is verified before merge rather than split to its own branch.
- `git worktree add -b <slug> <path> origin/HEAD` tracks `origin/main`, so a bare `git push` from the task worktree refuses; `gh pr create` and `git push -u origin <slug>` recover. `07` ADV-001 suggests `--no-track` on the documented command; this branch does not add it.
- No automated check exercises either `deliver` path. The validator checks structure (line 6 links, answer-template handoffs, pack coverage), not the steps a model follows.

## Change outline

One rule, reached by every `SKILL.md` through its line 6 conventions link; `deliver` and the docs quote the command and point back at it.

```text
shared/CONVENTIONS.md                          new Task worktree section: command, <repo>/<target> resolution, four skip cases
skills/delivery/deliver/SKILL.md               step 4 starts the run and waits; step 5 opens the worktree before task.md
skills/delivery/deliver/references/*answer.md  Archon reply: run id, state, pauses ahead; hand reply: Worktree: line
runtimes/{claude-code,codex,oh-my-pi,pi}.md    one line each: how to run a command that exits at its first gate
workflows/delivery.md, docs/, AGENTS.md        routing line, deliver table row, by-hand sections
.changeset/*.md                                two minor entries
```

`deliver` after routing:

```diff
 with Archon
-  print `archon workflow run delivery-<pack> --branch <branch> ...`
+  run it in the foreground (no timeout under an hour, never --detach)
+  worktree held by an earlier run -> `archon workflow wait <run-id>`
+  reply: run id, paused at <gate> | completed | failed, pauses still ahead
 without Archon
+  git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>
+    <repo>   = basename of the main worktree (git worktree list --porcelain, first entry)
+    <target> = PR base, then task.md base:, then origin/HEAD (main without a remote)
+    skip only: already on <slug>, task dir exists, not a git work tree, user asked for this checkout
   create and commit .agents/tasks/<slug>/task.md   (now inside the worktree)
   hand off to the chain's first skill
```

Read `shared/CONVENTIONS.md` lines 29-47 first; every other file restates a clause of that section.

## Human Review

### Review targets

- `shared/CONVENTIONS.md` Task worktree section: the `<repo>` and `<target>` definitions and whether the four skip cases are the right set.
- `skills/delivery/deliver/SKILL.md` steps 4 and 5 and both answer templates: the Archon reply carries a run id and no fence; the hand reply carries `Worktree:`.
- The `runtimes/*.md` lines: each runtime's mechanism for a foreground command that runs for minutes is one the runtime offers.

### Verify

- [ ] Run `npm test` at HEAD; it exits 0 with `tests 61`, `pass 61`, `fail 0`.
- [ ] Run `/deliver` by hand in a repository without `archon` on PATH from another task's worktree; a worktree appears at `~/.agents/worktrees/<repo>/<slug>`, its log starts at the default branch, `task.md` is committed in it, and the reply's `Worktree:` line names path and branch.
- [ ] Run `/deliver` with Archon present; the reply carries the run id and the gate it paused at, and no command to paste.

### Known limits

- The live by-hand `/deliver` path (verification A3) is untested; `npm run evals` has no `deliver` scenario.
- The documented `git worktree add` leaves the task branch tracking `origin/main`; a bare `git push` refuses until `-u origin <slug>` or `gh pr create` sets the upstream (`07` ADV-001).
- `deliver_archon_answer.md` still shows the `archon workflow run` line after "Started from the project root:" (`07` ADV-003).
