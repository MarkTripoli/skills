---
type: code-review
date: 2026-09-17
branch: any-time-we-do
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: d15a47e2c35197e8974f846481dc64f5d93a2baa
status: findings
summary: "The worktree-by-default change is sound: the conventions carry the rule with four skip cases, `deliver` step 5 and the by-hand answer apply it, and `npm test` is green at 61 tests. Two major findings block the review. The branch also carries a second, unrelated behavior change — `deliver` now starts the Archon run instead of printing the command — that the task, the implementation receipt, and the verification artifact (pinned at `b6ad5a2`) do not cover; it should be split into its own task with its own verification. That same change left `workflows/delivery.md:18` saying `deliver` still prints the command while `:238` says it starts the run, a contradiction in the authoritative doc."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1`
- reviewed HEAD: `d15a47e2c35197e8974f846481dc64f5d93a2baa` on `any-time-we-do`
- commits: `033566c` open task, `719d5c0` feat worktree, `b6ad5a2`/`dbfab26` task artifacts, `d15a47e` feat deliver starts the Archon run
- staged and unstaged changes: none; tree clean apart from one untracked path `.ignore`
- task-owned untracked files: none (the three task artifacts are committed)
- excluded changes: the task artifacts under `.agents/tasks/any-time-any-work/`; the untracked `.ignore`

## Requirements and Standards

- task or ticket: `task.md` — "Any time we do any work with this skill, we should be opening up a work tree. Without question, by default, we have to do it." oneshot, large.
- implementation source: `01-implementation-any-time-any-work.md` (receipt; oneshot has no plan) and `02-verification-any-time-any-work.md` (status passed, pinned at `b6ad5a2`).
- repository instructions: `AGENTS.md` (docs follow the YAML; `workflows/delivery.md` is the long form, `docs/cheatsheet.md` the short one); `shared/CONVENTIONS.md`, `shared/WRITING.md`.

## Change Profile

- intent and expected behavior: every by-hand task opens its own git worktree by default, matching what an Archon run gets from `--branch`.
- change description quality: the receipt is accurate for the worktree change; it does not mention the second change (deliver starting the run), which was committed after both the receipt and the verification.
- implementation model and review model: not recorded in the artifacts; reviewed by Claude (Pi runtime), inline (no worker tool).
- changed-line size and logical cohesion: ~9 non-artifact files, all prose; small. Two distinct logical changes share the branch (worktree default; deliver starts the run).
- resulting large-file concerns: none.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: `npm test` runs the validator, plugin-sync and pack-generator staleness checks, unit tests, and Archon dry-run/fixture/real-run tests. No test file changed; the validator asserts structure (line-6 links, answer-template handoffs, pack coverage), not the prose steps a model follows.
- missing or misleading coverage: the two behavioral changes rest on human review and `npm run evals`; no eval scenario exercises the by-hand `deliver` worktree path (A3, untested in verification) or the new "start the Archon run" behavior.

## Five-Axis Assessment

### Correctness

- assessment and evidence: The worktree rule is internally consistent. `shared/CONVENTIONS.md` "Task worktree" gives the command, the reuse/`drop -b` cases, and exactly four skip cases; the `task.md` create rule and `deliver` step 5 both open it before the directory; `deliver_hand_answer.md` names path and branch and has a skip slot. `npm test` passes here: `tests 61, pass 61, fail 0`. The second change (deliver executing `archon workflow run`) is plausible but unverified — see CR-001.

### Readability and Simplicity

- assessment and evidence: Prose is clear and follows the collection's voice. The one readability defect is the contradiction in `workflows/delivery.md` (CR-002).

### Architecture

- assessment and evidence: Placing the rule in `shared/CONVENTIONS.md` and reaching every skill through the existing line-6 link is the right ownership: one rule, one home, no per-skill duplication (verification A9 confirmed the link is universal). The concern is scope, not structure: two independent behaviors ride one branch (CR-001).

### Security

- assessment and evidence: No untrusted input, secret, or boundary is touched. `git worktree add ~/.agents/worktrees/<repo>/<slug>` writes under the user's home; no new exposure.

### Performance

- assessment and evidence: Not applicable; prose-only.

## Verification Story

- command or inspection: `npm test`; `git diff main...HEAD`; `grep -c 'worktree remove'` on each doc; `grep -n 'prints the command'` and the deliver table row in `workflows/delivery.md`.
- result: `npm test` exits 0, `tests 61 pass 61 fail 0`. `worktree remove` present in `getting-started.md`, `cheatsheet.md`, `CONVENTIONS.md`; absent in `workflows/delivery.md`. `workflows/delivery.md:18` says deliver "prints the command"; `:238` says it "starts `archon workflow run` in the foreground".
- manual, screenshot, or before-and-after evidence: none; the by-hand `deliver` path (A3) still needs a live non-Archon session, unchanged from verification.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

### CR-001 Unrelated, unverified change bundled into the worktree task

- type: Refactor suggestion
- severity: major
- category: Maintainability and code quality
- location: `d15a47e` — `skills/delivery/deliver/SKILL.md` (step 4, description, intro), `skills/delivery/deliver/references/deliver_archon_answer.md`, `runtimes/claude-code.md:7`, `runtimes/codex.md:7`, `runtimes/oh-my-pi.md:7`, `runtimes/pi.md:7`, `AGENTS.md:8`, `docs/cheatsheet.md:22`, `workflows/delivery.md:238`, `.changeset/deliver-starts-the-run.md`
- failure mode: The branch delivers a second, independent behavior change — `deliver` now *starts* the Archon run and waits for its first pause, instead of printing the command — that the task does not request. `task.md` is solely about opening a worktree by default. The implementation receipt (`01`) does not mention it, and the verification artifact (`02`) is pinned at `b6ad5a2`, one commit before `d15a47e`, so nothing verifies it. It rides to merge on the worktree task's review with no acceptance items, no verification, and no eval, contrary to the repo's own rule that a behavior change to what a skill produces passes its evals.
- evidence or reproduction: `git log --oneline main..HEAD` lists `d15a47e feat(deliver): start the Archon run instead of printing the command` after `dbfab26 docs(task): verification artifact`; `02-verification-...md` frontmatter `revision: b6ad5a2`; its items A1–A9 name only worktree behavior.
- fix direction: Split `d15a47e` and `.changeset/deliver-starts-the-run.md` (and the four `runtimes/*.md` "Long-running commands" lines, the `deliver_archon_answer.md` rewrite, and the AGENTS/cheatsheet/delivery.md deliver rows) into their own task with its own implementation, verification, and review; keep this branch to the worktree default. If the two are intentionally shipped together, extend this task's `task.md` acceptance items and re-run `/verify-implementation` so the Archon-run behavior is covered before merge.

### CR-002 workflows/delivery.md contradicts itself about what `deliver` does

- type: Potential issue
- severity: major
- category: Maintainability and code quality
- location: `workflows/delivery.md:18`
- failure mode: The autonomy paragraph still reads "In an agent session the `deliver` skill makes the same call and prints the command", but the `deliver` table row at `:238` (and `SKILL.md` step 4) now say it starts `archon workflow run` in the foreground and waits for the first pause. `AGENTS.md` names `workflows/delivery.md` the long-form authority, so the doc now states two incompatible behaviors for the same skill; a reader following line 18 expects a printed command that never comes.
- evidence or reproduction: `grep -n 'prints the command' workflows/delivery.md` → line 18; the same file's line 238 "then starts `archon workflow run delivery-<pack>` in the foreground, waits for its first pause or its end".
- fix direction: Rewrite the line 18 clause to match the new behavior — the skill starts the run and reports the run id and first pause (without Archon it opens the worktree and hands off), the same wording the table row and `docs/cheatsheet.md:22` already use. (Resolve as part of whichever task owns the Archon-run change per CR-001.)

## Advisories

### ADV-001 workflows/delivery.md omits the `git worktree remove` line the other docs carry

- type: Nitpick
- severity: minor
- category: Maintainability and code quality
- location: `workflows/delivery.md` "Running skills by hand" and the autonomy line
- evidence: `grep -c 'worktree remove'` returns 1 for `docs/getting-started.md`, `docs/cheatsheet.md`, and `shared/CONVENTIONS.md`, and 0 for `workflows/delivery.md`; the receipt claims all three docs carry it, and verification A7 flagged the same gap.
- suggestion: Either add `git worktree remove <path>` after the merge to the by-hand section, matching the other two docs, or accept that the file reaches the removal guidance through its conventions link and drop the receipt's "all three docs" claim.

### ADV-002 "already in a worktree" skip case matches any worktree, not this task's

- type: Potential issue
- severity: minor
- category: Functional correctness
- location: `shared/CONVENTIONS.md`, "Task worktree" first skip bullet
- evidence: The bullet skips when `git rev-parse --git-dir` prints a path under `/worktrees/`, i.e. any worktree at all. A session started inside a *different* task's worktree would then "Work where the session is" instead of opening the correct one for the new task.
- suggestion: In the by-hand model the first phase opens the worktree and later phases run inside it, so this is an edge case; if it matters, tie the skip to being on branch `<slug>` (already the bullet's second condition) rather than to being in any worktree.

## Dead Code and Dependency Review

- newly orphaned code: none. No prose block or reference was left unreferenced by the edits.
- dependency findings: none; no dependency or lockfile change.

## Verdict

- decision: request_changes
- overall code-health change: The worktree change improves health — it removes an implicit assumption (by-hand work happening on the current checkout) and gives it one documented owner. Health is dragged down by an out-of-scope, unverified second change and a self-contradiction it introduced in the authoritative doc.
- rationale: Two major findings (CR-001 scope/verification, CR-002 doc contradiction) prevent a clean result. Neither touches the worktree rule itself, which is sound.

## Review Limits

- blocked or unavailable checks: the by-hand `/deliver` worktree behavior (verification A3) and the new "start the Archon run" behavior need a live agent session; neither can be exercised here. `npm run evals` has no scenario for either.
- residual manual verification: run `/deliver` by hand in a non-Archon repository and confirm the worktree and the reply's path/branch; with Archon, confirm `deliver` starts the run and reports the run id and first pause.
