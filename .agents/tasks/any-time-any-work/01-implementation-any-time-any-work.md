---
type: implementation
completed_phase: 1
summary: "A task run by hand now opens its own git worktree by default, matching what an Archon run gets from --branch. The rule lives in the conventions' new Task worktree section, which every SKILL.md already links on line 6; deliver's by-hand path applies it before writing task.md and names the path and branch in its reply. npm test passes (51 tests) after the validator, plugin, and pack checks."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/any-time-any-work/task.md`
- plan artifact: none (oneshot; the request is the spec)
- phase range: 1 of 1

## Child Workers
- implementer: none, done inline
- reviewer: none

## Completed Work
- `shared/CONVENTIONS.md`: new `## Task worktree` section. Every task works in its own worktree on its own branch; by hand it is `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug>`, opened before `task.md` is written so the task directory and later commits land on the task branch. Reuse a listed path, drop `-b` for an existing branch, report path and branch. Four skip cases only: already in the worktree or on the branch, the task directory already existed, not a git work tree, or the user asked for the current checkout in this session. The `task.md` create rule now points at it.
- `skills/delivery/deliver/SKILL.md`: step 5 (without Archon) opens the worktree with the step 4 branch before creating the task directory in it, asks nothing, and outside a git work tree skips it and says so. A rule line states the default; the reply bullet passes path and branch to the template.
- `skills/delivery/deliver/references/deliver_hand_answer.md`: a `Worktree:` line with path, branch, why later sessions run there, and a slot naming the skip case when one applied.
- `workflows/delivery.md`, `docs/getting-started.md`, `docs/cheatsheet.md`: the by-hand sections carry the same default, the command, the link to the conventions section, and `git worktree remove <path>` after the merge; the routing line and the `deliver` table row say worktree plus task directory.
- `.changeset/task-worktree-by-default.md`: minor entry.

## Automated Verification
- command: `node scripts/validate.mjs`
- result: pass
- evidence: `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`

- command: `npm test` (validator, plugin sync check, pack generator check, `node --test tests/`)
- result: pass
- evidence: `tests 51`, `pass 51`, `fail 0`. First run failed `tests/install.test.mjs` with `ERR_MODULE_NOT_FOUND: Cannot find package '@clack/prompts'`: this worktree had no `node_modules`. `npm ci`, then the file passes (11 tests).

## Deferred Human Evidence

- A by-hand `/deliver` run in a repository without Archon, checked for the worktree and the reply's path and branch. Prose-only change, so no automated check exercises the new steps; `npm run evals` would, against a live model.

## Commit Handoff
The code commit was created after `npm test` was green: `feat(delivery): open a worktree for every by-hand task`, staging the six prose files and the changeset with explicit paths. This receipt is committed separately as `docs(task): implement artifacts`.

## Human Review

### Review targets

- `shared/CONVENTIONS.md`, `## Task worktree`: the path convention `~/.agents/worktrees/<repo>/<slug>`, and whether the four skip cases are the right four.
- `skills/delivery/deliver/SKILL.md` step 5 and its rule line: the default is applied without a question to the user.

### Verify

- [x] `node scripts/validate.mjs` passes: line 6 links, answer-template handoffs, and pack coverage survive the edits.
- [x] `npm test` passes, 51 tests, after `npm ci` in this worktree.
- [ ] A by-hand `/deliver` in a non-Archon repository opens the worktree and the reply names its path and branch.

### Known limits

- No test asserts the new prose; the validator checks structure, not the steps a model follows. `npm run evals` runs the skills against a live model but has no scenario for the by-hand `deliver` path.
- Nothing removes a task worktree. The conventions leave `git worktree remove <path>` to the user after the merge.
- The Archon path is unchanged: it already works in a worktree from `--branch`, and `--no-worktree` stays available for a checkout without a remote.
