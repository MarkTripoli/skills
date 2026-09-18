---
type: code-review
date: 2026-09-17
branch: any-time-we-do
base_branch: main
base_sha: 31d9b0ffce0773d00b37011a3dab0ed9e1c366e1
head_sha: 12ec7440ecc4322c25ea29ea314b5e2efdbf9357
status: clean
summary: "Reviewed the full branch at `12ec744` against `main`. The `05` major (CR-001, the worktree rule landing in the wrong directory on the wrong base from another worktree) is fixed at `a28bf23`: `<repo>` is now the main worktree's basename via `git worktree list --porcelain`, and `git worktree add -b <slug>` carries a `<target>` start point resolved in the Commits-section order; the three docs and the changeset carry `<target>`, the skip bullet keys on the task's branch and names `epic-<slug>` (ADV-001 accepted). All four `task.md` acceptance criteria hold, including `npm test` exit 0 re-run this pass (`tests 61 pass 61 fail 0`). No critical- or major-severity findings. One info advisory: `deliver` SKILL step 4 justifies its `--detach` ban with a claim (`Archon refuses it for a workflow that can pause`) that `archon workflow run --help` appears to contradict; the operative instruction (foreground, never detach) is correct regardless."
---

# Code Review

## Scope

- merge base: `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (`main`; no pull request exists for the branch, `task.md` has no `base:`)
- reviewed HEAD: `12ec7440ecc4322c25ea29ea314b5e2efdbf9357` on `any-time-we-do`
- commits: through `9b0c8a2` as reviewed at `05`, then `41b0865` (`05` artifact), `a28bf23` (`fix: give the task worktree a stable repo name and a start point`, the CR-001 fix), `12ec744` (`06` fixes artifact)
- staged and unstaged changes: none; one untracked path `.ignore`, not part of the change
- task-owned untracked files: none; `07` is written by this review
- excluded changes: `.agents/tasks/any-time-any-work/*`; the untracked `.ignore`

## Requirements and Standards

- task or ticket: `task.md`: every by-hand task opens its own worktree by default, plus the deliver-starts-run change (`d15a47e`) folded in at `04`; four acceptance items.
- implementation source: `01-implementation` (receipt; oneshot has no plan), `02-verification` (passed at `b6ad5a2`; A3 untested), `03`/`05` code reviews and `04`/`06` fixes. The newest fixes artifact `06` records CR-001 fixed at `a28bf23` and ADV-001 accepted; read first, its dispositions confirmed against the diff below.
- repository instructions: `AGENTS.md`, `shared/CONVENTIONS.md`, `shared/WRITING.md`.

## Change Profile

- intent and expected behavior: (1) a by-hand task opens `~/.agents/worktrees/<repo>/<slug>` on branch `<slug>` before `task.md` is written, without asking, with four skip cases; (2) `deliver` with Archon starts `archon workflow run` in the foreground and replies with the run id and first pause instead of printing the command to paste.
- change description quality: `719d5c0`, `d15a47e`, and `a28bf23` carry bodies stating behavior and motivation; the subject-only fixes have their decisions in `04`/`06`. Two changesets (`task-worktree-by-default.md`, `deliver-starts-the-run.md`) cover the two user-facing behaviors.
- implementation model and review model: not recorded in the receipts; this review ran inline in Pi (no child worker).
- changed-line size and logical cohesion: 14 non-artifact files, 67 insertions, 27 deletions, all prose plus two changesets. Two cohesive behaviors, both named in `task.md` scope.
- resulting large-file concerns: none.
- dependency or lockfile changes: none.

## Tests Reviewed First

- behavior claimed by tests: no test file changed. `npm test` runs `scripts/validate.mjs` (line-6 links, answer-template handoffs, pack coverage, banned tokens), plugin and pack staleness checks, and `node --test tests/`; none reads the steps a skill's prose describes, so both behaviors rest on inspection and the live-run record.
- missing or misleading coverage: `npm run evals` has no scenario for either `deliver` path. This is unchanged by the branch and out of its scope; the behaviors are prose the harness does not execute.

## Five-Axis Assessment

### Correctness

- assessment and evidence: The four `task.md` criteria, decided against the diff:
  1. By-hand worktree: `shared/CONVENTIONS.md` Task worktree section opens `~/.agents/worktrees/<repo>/<slug> -b <slug> <target>` before `task.md`; `deliver` step 5 and `deliver_hand_answer.md` carry `Worktree: <path> on branch <branch>`. CR-001 is fixed: `<repo>` is the main worktree's basename (`git worktree list --porcelain`, first entry), verified to print the same name from the main checkout and from a worktree; `<target>` gives `-b` a start point in the Commits-section order, so a task opened from another worktree or a feature branch no longer inherits its commits. Reproduced and confirmed in a temporary repo at `06`.
  2. Archon starts the run: step 4 runs the command in the foreground with an hour-plus timeout, attaches with `archon workflow wait` when the worktree is held, and replies with run id, state, branch, worktree, remaining pauses; `deliver_archon_answer.md` opens "The workflow is running" and ends without a fence. `archon --help` confirms `workflow wait <run-id>` and `--branch` "(or reuse existing)". Holds by inspection; see ADV-001 for the one claim the help contradicts.
  3. Doc consistency: `grep` for stale "prints/printed the command", "run the command above", "never run the command", "paste the reply's fenced command" over `AGENTS.md`, `docs/`, `workflows/`, `runtimes/`, `skills/delivery/deliver/`, `shared/` returns only two in-context hits, both correct and unrelated to the deliver command: `docs/cheatsheet.md:102` (a by-hand skill-to-skill handoff) and `workflows/delivery.md:52` (the `wave` pack's `children=manual` mode). `AGENTS.md:8`, `docs/cheatsheet.md:22`, `workflows/delivery.md:18` and `:252`, and the four `runtimes/*.md` all describe the run being started and the first pause reported. Holds.
  4. `npm test` exits 0: re-run this pass, `tests 61 pass 61 fail 0`, `scripts/validate.mjs` `ok: 41 skills, 54 answer templates, 20 human-review templates, 0 banned tokens`. Holds.

  ADV-001 (the skip case naming `<slug>` only) is resolved: the bullet now reads "the task's branch, the name passed to `-b` (`<slug>`, or `epic-<slug>` for an epic; check with `git rev-parse --abbrev-ref HEAD`)", matching an epic phase on `epic-<slug>`.

### Readability and Simplicity

- assessment and evidence: The Task worktree section states the rule first, the command in a bash block, `<repo>`/`<slug>`/`<target>` and reuse in one paragraph, then the four skip cases as bullets. `deliver` step 4/5 and the three docs agree. No dead prose: the old "Pauses:" list and "Run the command above" line in `deliver_archon_answer.md` were replaced, not left beside the new text.

### Architecture

- assessment and evidence: One rule in `shared/CONVENTIONS.md`, reached by every `SKILL.md` through the line-6 link, applied by `deliver` and referenced by `AGENTS.md`, `docs/cheatsheet.md`, `docs/getting-started.md`, and `workflows/delivery.md`; no per-skill copy. The per-harness mechanism for a long-running command lives once in each `runtimes/*.md`, and `deliver` step 4 defers to "the runtime's supervised long-running-process mechanism". Both are the right owners.

### Security

- assessment and evidence: No untrusted input or secret. The worktree path is under the user's home; the request stays single-quoted with `'\''` escaping in the Archon command, unchanged from `main`. `--detach` is forbidden, so no run outlives the session unobserved.

### Performance

- assessment and evidence: Not applicable; prose only. The foreground run holds a shell for minutes per phase, which step 4 and each runtime note state.

## Verification Story

- command or inspection: `git status --short --branch`, `git merge-base main HEAD`, `git log main..HEAD`, `git diff --name-status main...HEAD`, `git diff main...HEAD -- . ':!.agents'` read in full; `grep` for stale deliver wording over the tracked docs and skill; `archon workflow run --help` and `archon --help`; `npm test`.
- result: scope as pinned. Stale wording: none outside the two in-context hits named above. `npm test`: `tests 61 pass 61 fail 0`, validator ok, exit 0. `archon workflow run --help`: `--detach` is documented for `workflow run` with the example `archon workflow run archon-assist --detach "..."`, and `workflow cancel` "Stop a running workflow started with --detach" — see ADV-001.
- manual, screenshot, or before-and-after evidence: none. Neither `deliver` path was run live this pass; the CR-001 reproduction and its fix were confirmed in a temporary repository at `06`. Verification A3 (a live by-hand `/deliver` non-Archon run) remains untested, unchanged from `05`.

## Critical and Required Findings

Gate: critical- or major-severity findings only.

None.

## Advisories

### ADV-001 The `--detach` ban is justified by a claim the CLI help contradicts

- type: Nitpick
- severity: info
- category: Maintainability and code quality
- location: `skills/delivery/deliver/SKILL.md` step 4, "Never add `--detach`: Archon refuses it for a workflow that can pause."
- evidence: `archon workflow run --help` documents `--detach` as a supported flag for `workflow run` ("Run 'workflow run'/'approve'/'reject'/'respond'/'resume' in a detached background child (returns immediately)") and gives the example `archon workflow run archon-assist --detach "Investigate the flaky test"`; `workflow cancel <run-id>` is described as "Stop a running workflow started with --detach". The help leans against a blanket refusal, and whether Archon specifically refuses `--detach` for a pausable workflow could not be verified here (no live delivery run). The operative instruction — run in the foreground, never add `--detach` so the skill can observe and report the first pause — is correct regardless of the reason, so behavior is unaffected.
- suggestion: None required. If revised, state the directive without the unverifiable reason, e.g. "Never add `--detach`; the run must stay in the foreground so its first pause is reported." The `05` Review Limits already noted this claim rests on the `d15a47e` author's observation.

## Dead Code and Dependency Review

- newly orphaned code: none. The lines replaced in `deliver_archon_answer.md` ("Pauses:" list, "Run the command above") and `SKILL.md` step 4 ("do not run it", "Never run the command for the user") have no remaining references.
- dependency findings: none; no dependency or lockfile change.

## Verdict

- decision: approve
- overall code-health change: Up. The worktree default and the deliver-starts-run behavior each have one owner; the `03`/`05` contradictions are gone; `task.md` states the shipped scope; the CR-001 base/directory defect is fixed and reproduced; `npm test` is green.
- rationale: No critical- or major-severity findings remain in the pinned scope. The single advisory is an unverifiable justification with no behavioral effect.

## Review Limits

- blocked or unavailable checks: whether Archon refuses `--detach` for a pausable workflow (ADV-001) and whether a run on a held worktree fails before dispatch naming the earlier run id were not exercised; no live delivery run in this session.
- residual manual verification: run `/deliver` by hand in a non-Archon repository from its main checkout and confirm the worktree path, branch, committed `task.md`, and the reply's `Worktree:` line (verification A3, still untested); with Archon, confirm the run starts, the reply carries the run id and the gate, and a second `/deliver` on the same branch attaches instead of starting.
