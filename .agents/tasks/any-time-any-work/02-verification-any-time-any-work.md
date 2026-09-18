---
task: any-time-any-work
type: verification
summary: "Re-ran the repository's own checks (`npm test`, the CI commit check, a build of all four runtimes) and every acceptance item the implementation receipt promises, against `b6ad5a2` on `any-time-we-do`. All three checks exit 0 and the nine acceptance items are eight passes and one untested: a by-hand `/deliver` in a non-Archon repository cannot be run here, so a person still has to watch that reply name its worktree path and branch. `npm test` reports 61 passing tests, not the 51 the receipt recorded; the extra suites are archon pack tests that run because `archon` is installed in this environment, and none fail. One gap worth a reviewer's eye: `workflows/delivery.md` carries the worktree default, the command, and the conventions link, but not the `git worktree remove <path>` line the receipt claims for all three docs."
status: passed
revision: b6ad5a2
target: main
---

# Verification

## Run

- Revision: `b6ad5a2` on `any-time-we-do`; tree otherwise clean, one untracked path `.ignore`
- Target: `main`; 9 files changed, 0 of them tests
- Checks from: `package.json` scripts (`test`, `build`) and `.github/workflows/commits.yml`; `release.yml` is a deployment workflow and was not run
- Coverage: 9 acceptance items; 2 claimed by the receipt's `### Verify` boxes, 7 claimed by none
- Graded by: typed-judgment helper (`grade-steps --kind command`), with A2, A5, and A9 returned `unclear` and decided by hand

## Items

| Id | Item | Decided by | Expected | Observed | Verdict | Confidence | Severity |
|---|---|---|---|---|---|---|---|
| C1 | Repository test script. | `npm test` | Exits 0 with no failing test. | exit 0; `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`, then `tests 61`, `pass 61`, `fail 0`, `skipped 0`. | pass | 1.00 | 0 |
| C2 | Conventional-commit check from `.github/workflows/commits.yml`. | `node scripts/check-commits.mjs main..HEAD` | Exits 0; every commit subject is conventional. | exit 0; `ok: 3 subjects`. | pass | 1.00 | 0 |
| C3 | Runtime build. | `node scripts/build-runtimes.mjs --runtime <r> --dest <temp>` for `claude-code`, `codex`, `oh-my-pi`, `pi` | Exits 0 for every runtime. | exit 0 four times; `built claude-code: 41 skills, 7 workers`, `built codex: 41 skills, 7 workers`, `built oh-my-pi: 41 skills, 7 workers`, `built pi: 41 skills, 0 workers`. Run with an explicit `--runtime` into a temp dest: bare `npm run build` prints a usage line and exits 1, unchanged by this diff. | pass | 0.90 | 0 |
| A1 | Validator passes; link, handoff, and pack coverage survive the edits (`01-implementation-any-time-any-work.md:50`, claimed: yes). | `node scripts/validate.mjs` | "passes: line 6 links, answer-template handoffs, and pack coverage survive the edits" | exit 0; `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`. | pass | 0.89 | 0 |
| A2 | `npm test` passes, 51 tests (`01-implementation-any-time-any-work.md:51`, claimed: yes). | `npm test` | "`npm test` passes, 51 tests, after `npm ci` in this worktree" | exit 0 with no `npm ci` needed; `tests 61`, `pass 61`, `fail 0`, `skipped 0`. Ten more tests than the receipt recorded, none failing. | pass | hand | 0 |
| A3 | A by-hand `/deliver` in a non-Archon repository opens the worktree and the reply names its path and branch (`01-implementation-any-time-any-work.md:52`, claimed: no). | not in this environment: needs a live agent session in a repository without `archon` on PATH; `npm run evals` has no scenario for the by-hand `deliver` path | "A by-hand `/deliver` in a non-Archon repository opens the worktree and the reply names its path and branch." | Not run. | untested | hand | 0 |
| A4 | The conventions carry the worktree rule as the default with four skip cases (`task.md:9`; `01-implementation-any-time-any-work.md:19`, claimed: no). | `git diff main...HEAD -- shared/CONVENTIONS.md`, read in this session | Every task in its own worktree on its own branch; by hand `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug>` before `task.md` is written; reuse a listed path, drop `-b` for an existing branch, report path and branch; four skip cases only. | New `## Task worktree` section with that command in a bash block, the reuse and drop-`-b` sentences, "Report the path and the branch in the reply", "The worktree is the default, not a question to put to the user. Four cases skip it, and nothing else does", four bullets, and `git worktree remove <path>` left to the user after the merge. The `task.md` create rule above now opens the worktree first. | pass | 0.87 | 0 |
| A5 | `deliver` step 5 opens the worktree before the task directory and asks nothing (`01-implementation-any-time-any-work.md:20`, claimed: no). | `git diff main...HEAD -- skills/delivery/deliver/SKILL.md`, read in this session | Step 5 opens the worktree with the step 4 branch before creating the task directory in it, asks nothing, and outside a git work tree skips it and says so; a rule line states the default. | Heading is "open the task worktree, open the task directory in it, and hand off"; new first bullet uses the step 4 branch and the `~/.agents/worktrees/<repo>/<slug>` path and ends "Ask nothing; the section names the cases that skip it."; create bullet says "in the worktree" and "Outside a git work tree, write the file, skip the worktree, and say both are uncommitted."; new Rules line "The by-hand path opens a worktree every time, without asking." | pass | hand | 0 |
| A6 | The by-hand answer template names the worktree (`01-implementation-any-time-any-work.md:21`, claimed: no). | `git diff main...HEAD -- skills/delivery/deliver/references/deliver_hand_answer.md`, read in this session | A `Worktree:` line with path, branch, why later sessions run there, and a slot naming the skip case when one applied. | Template gained `Worktree: \`<worktree path>\` on branch \`<branch>\`` with the "every session of this task runs from there" sentence and a `<One sentence when the worktree was skipped…>` slot; the task-directory line now reads "in that worktree". | pass | 0.89 | 0 |
| A7 | The three docs carry the default, the command, the conventions link, and the removal line (`01-implementation-any-time-any-work.md:22`, claimed: no). | `git diff main...HEAD -- workflows/delivery.md docs/getting-started.md docs/cheatsheet.md` plus `grep -c 'worktree remove'` on each | The by-hand sections carry the default, the command, the link to the conventions section, and `git worktree remove <path>` after the merge; the routing line and the `deliver` table row say worktree plus task directory. | `docs/getting-started.md` and `docs/cheatsheet.md` carry all four. `workflows/delivery.md` carries the default, the command and three conventions links but `grep -c 'worktree remove'` returns 0; its removal guidance reaches the reader only through the conventions link. Its routing line and `deliver` table row both now say worktree plus task directory. | pass | 0.90 | 0 |
| A8 | A changeset records the change (`01-implementation-any-time-any-work.md:23`, claimed: no). | `git diff main...HEAD -- .changeset/task-worktree-by-default.md`, read in this session | A minor changeset entry. | New `.changeset/task-worktree-by-default.md` with `"@marktripoli/skills": minor` and a body naming the conventions section, the command, the no-asking default, the four skip cases, and `deliver`'s reply. | pass | 0.87 | 0 |
| A9 | The rule reaches every skill through the line 6 conventions link (`01-implementation-any-time-any-work.md:4`, claimed: no). | `for f in skills/*/*/SKILL.md; do grep -q shared/CONVENTIONS.md "$f" \|\| echo "$f"; done` | Every `SKILL.md` already links the conventions on line 6, so the new section governs every skill. | The loop printed nothing: every `SKILL.md` carries the link. The two skills that repeat the create rule in their own steps (`test-app`, `verify-implementation`) say "creating it from the request when none exists" and defer to the conventions rather than restating the old steps. | pass | hand | 0 |

Verdicts: `pass`, `fail`, or `untested` (nothing in this environment could decide it). Confidence is the helper's probability for the verdict, or `hand` when decided without it; deterministic verdicts (an exit code, an exact string) record `1.00`. Severity: 0 none, 1 cosmetic, 2 functional, 3 blocking.

## Findings

None.

## Missing

None.

## Human Review

### Review targets

- The items table, in particular A7 (`workflows/delivery.md` has no `git worktree remove` line of its own) and A3 (the only item nothing here could decide).

### Verify

- [ ] Run `npm test`; it exits 0 with `tests 61`, `pass 61`, `fail 0`.
- [ ] Run `node scripts/check-commits.mjs main..HEAD`; it exits 0 with `ok: 3 subjects`.
- [ ] Run `node scripts/build-runtimes.mjs --runtime claude-code --dest <temp>`; it exits 0 with `built claude-code: 41 skills, 7 workers`.
- [ ] A3: run `/deliver` by hand in a repository without `archon` on PATH; a worktree appears at `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>`, `task.md` is committed in it, and the reply's `Worktree:` line names both.
- [ ] A2 (decided by hand): confirm 61 passing tests is right for this checkout and that the receipt's 51 was the same suite minus the archon pack tests.
- [ ] A5 (decided by hand): read `skills/delivery/deliver/SKILL.md` step 5 and its new rule line; the worktree is opened before the task directory and no question is put to the user.
- [ ] A9 (decided by hand): confirm the line 6 conventions link is the intended way the new rule reaches skills other than `deliver`, which is the whole of the request's "any time we do any work".
- [ ] A7: decide whether `workflows/delivery.md` should repeat `git worktree remove <path>` like the other two docs, or keep pointing at the conventions section for it.

### Known limits

- A3 is untested: it needs a live agent session in a repository without `archon` installed, which this environment cannot produce. `npm run evals` runs skills against a live model but has no scenario for the by-hand `deliver` path.
- The helper returned `unclear` for A2, A5, and A9; each was decided by hand against the recorded output and carries a `### Verify` box above. A5 and A9 are prose changes, which no command can settle.
- `npm test` reports 61 tests here against the 51 the receipt recorded. The diff changes no test file, and the validator line says packs were checked with `/usr/local/bin/archon`, so the extra suites are the archon pack tests that run only where `archon` is installed. Nothing is skipped and nothing fails.
- No automated check exercises the new prose. The validator checks structure (line 6 links, answer-template handoffs, pack coverage), not the steps a model follows, so every behavioral claim in this change rests on A3.
- `workflows/delivery.md` does not carry `git worktree remove <path>`, which the receipt claims for all three docs; the file links the conventions section that has it.
- The tree has one untracked path, `.ignore`; the checks ran against the tree as it is.
