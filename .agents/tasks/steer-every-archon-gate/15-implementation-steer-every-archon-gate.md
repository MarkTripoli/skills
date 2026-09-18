---
type: implementation
completed_phase: 2
summary: "Phase 2 repeats phase 1's guard in `herd-next`'s gate-mode read, so a failed `archon workflow get` prints the skipped reply with the reason `the run could not be read` and Archon's own output instead of opening a review pane at the literal path `null`. The guard line is byte-identical to `deliver/SKILL.md:70` apart from that file's list-item indent, which is what DQ 4 Option A asked for. `npm test` stays 64/64 and the acceptance (d) grep is unchanged at 14 lines across five files. Phase 3's `tests/steward.test.mjs` now has both fences it extracts in their final shape: `approval.nodeId` still selects this file's gate-mode read and `deliver`'s step-6 read, `respond \"$run_id\"` still selects `deliver`'s resolve-and-wait fence."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/steer-every-archon-gate/task.md`
- plan artifact: `.agents/tasks/steer-every-archon-gate/13-plan-steer-every-archon-gate.md`
- phase range: Phase 2 only ("Guard `herd-next`'s state read")

## Child Workers
- implementer: `agent-implementer`, assignment "plan `13-plan-steer-every-archon-gate.md`, Phase 2 only"
- reviewer: none; the orchestrator read the diff and re-ran every check itself

## Completed Work
- `skills/delivery/herd-next/SKILL.md:91` (2.1): the gate mode's state read is now `run=$(archon workflow get "$run_id" --json) || { printf '%s\n' "$run" >&2; exit 1; }`, the same guard shape phase 1 put at `deliver/SKILL.md:70`. Nothing else in the fence changed; this skill reads once and does not loop.
- `skills/delivery/herd-next/SKILL.md:100` (2.1): one sentence before the live-gate sentence states that a nonzero `get` opens no pane, names the reply to print (`references/herd_next_skipped_answer.md`) and its reason (`the run could not be read`), says Archon's output is reported as cause and fix, and names the failure the guard removes: without it `$cwd` is the literal string `null` and the pane opens there.
- Diff is 3 insertions, 1 deletion in one file, matching the plan's diffs character for character. No other file changed. Nothing under `.agents/tasks/` was written by the child.

## Automated Verification
- command: `grep -n '|| { printf' skills/delivery/herd-next/SKILL.md`
- result: pass
- evidence: one line — `91:run=$(archon workflow get "$run_id" --json) || { printf '%s\n' "$run" >&2; exit 1; }`, inside the gate mode's fence

- command: `grep -n 'the run could not be read' skills/delivery/herd-next/SKILL.md`
- result: pass
- evidence: one line, `:100`, the sentence 2.1 adds

- command: `grep -n 'archon workflow get "$run_id" --json) || { printf' skills/delivery/deliver/SKILL.md skills/delivery/herd-next/SKILL.md`
- result: pass (DQ 4 Option A, and the plan's Verify list)
- evidence: two lines, `deliver/SKILL.md:70` and `herd-next/SKILL.md:91`, identical apart from `deliver`'s three-space list-item indent

- command: `grep -rn 'archon workflow' skills/ | wc -l`
- result: pass (acceptance (d))
- evidence: `14` across the same five files (`deliver/SKILL.md`, `deliver/references/deliver_archon_answer.md`, `herd-next/SKILL.md`, `resolve-pr-reviews/SKILL.md`, `start-epic-delivery/SKILL.md`), the count the plan records at `4ff7078`. This phase adds no `archon workflow` line: its new prose names the reply, not a command.

- command: `npm test`
- result: pass
- evidence: `tests 64 / suites 3 / pass 64 / fail 0 / cancelled 0 / skipped 0 / todo 0`, duration 32527ms. `validate.mjs:313-318` still resolves `references/herd_next_skipped_answer.md`, which is unchanged.

## Deferred Human Evidence

- None. Phase 2 declares no deferred evidence; acceptance (a), (b), and (c) belong to phase 5.

## Commit Handoff
The phase commit was created after green automated checks: `skills/delivery/herd-next/SKILL.md` staged by explicit path as a `fix(delivery):` commit, with the ticked plan and this receipt in their own `docs(task): implementation artifact` commit. No `.agents/tasks/` file is in the code commit.

## Human Review

### Review targets

- `skills/delivery/herd-next/SKILL.md:91`: the guard reports and stops from inside a fence, where design 12 wrote the branch as prose. The fence exits 1; the sentence at `:100` is what tells the agent to print the skipped reply. Confirm an agent reading both does the right thing, because the bash alone cannot print a template.
- `skills/delivery/herd-next/SKILL.md:100`: the reason string `the run could not be read` is new vocabulary beside the existing `the run has ended`. Confirm the wording.
- The two guards are now duplicated prose in two skills by design (DQ 4 Option A). Confirm that is still wanted before phase 3 pins both with a test.

### Verify

- [ ] `grep -n 'archon workflow get "$run_id" --json) || { printf' skills/delivery/deliver/SKILL.md skills/delivery/herd-next/SKILL.md` names exactly `deliver/SKILL.md:70` and `herd-next/SKILL.md:91`.
- [ ] `npm test` is 64/64 before phase 3 lands and 69/69 after it.
- [ ] Phase 3's markers still select the three fences: `approval.nodeId` selects `deliver`'s step-6 read and `herd-next`'s gate-mode read, `respond "$run_id"` selects `deliver`'s resolve-and-wait fence. All three hold against this diff.

### Known limits

- The guard is proved by grep here, not by execution. Phase 3's `tests/steward.test.mjs` is what makes a revert of it fail `npm test`; until that phase lands, nothing automated catches its removal in either skill.
- The child worker reported that the plan's literal check `grep -n '|| { printf' ...` errors in its shell, because this environment's `rtk`/`rg`-backed `grep` alias reads `{` as a repetition quantifier, and it used `grep -nF` instead. Re-run here as `/usr/bin/grep -n '|| { printf' ...`, the command passes exactly as the plan writes it. The checkbox is ticked against the literal command; the alias, not the check, is what needs `-F`.
- Acceptance (a), (b), and (c) stay unproved until phase 5. This phase proves the skill's text, not the agent behavior it describes.
- `judge.mjs` was not called: `TYPESAFE_API_KEY` is unset.
