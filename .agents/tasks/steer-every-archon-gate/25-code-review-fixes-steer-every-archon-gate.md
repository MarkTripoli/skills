---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/steer-every-archon-gate/24-code-review-steer-every-archon-gate.md
reviewed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
fixed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd (unchanged; fixes are uncommitted working-tree edits for the workflow engine to commit)
status: complete
summary: "Fixed both open major findings (CR-201 the unguarded `respond` call that dropped a decision silently and re-asked the same gate; CR-202 the `/`-prefixed attach and staged commands that never start a steward in a Codex pane) plus all six advisories. `respond` now captures its output and exits the steward on a nonzero code, exactly like its three sibling Archon calls; a new test drives that failure with `get` still succeeding. The submitted and staged commands in herd-next's two modes and in stop_hook.sh now carry `$` for a codex pane and `/` for every other kind, derived from `$kind` at the point each command is built. npm test is 71/71 (70 plus one new fixture), validate.mjs/check-commits.mjs/shellcheck are clean, and both majors were reproduced live against the fixed fences."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `origin/main` merge base is unchanged; no new commits landed on either side since the review.
- unrelated changes preserved: the 12 product files the review found already modified in the working tree, plus `.changeset/deliver-steward.md` and `.ignore`, are all untouched by this round except where a finding below names them.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-201

- disposition: fixed
- evidence: `deliver/SKILL.md`'s respond fence now reads `out=$(archon workflow respond "$run_id" "$decision" "$text" --detach --cwd "$cwd") || { printf '%s\n' "$out" >&2; exit 1; }`, the same capture-and-guard shape as the two `get` reads and the `abandon` call. A sentence before the fence states the rule: a nonzero `respond` ends the steward, reporting Archon's output as cause and fix, before the `wait` ever starts.
- files changed: `skills/delivery/deliver/SKILL.md`, `tests/steward.test.mjs`
- regression check: `tests/steward.test.mjs` gained `FAKE_FAIL_ON` (narrows `FAKE_FAIL` to one subcommand keyed on `$2`) and a new test, "a failing respond ends the steward before the wait, instead of dropping the decision silently", asserting a nonzero exit, zero `wait` calls, and Archon's error text on stderr. The prior "get that fails inside the wait loop" test was narrowed to `FAKE_FAIL_ON: "get"` so it still isolates a `get`-only failure now that `respond` is also guarded. Reproduced live: the fixed fence extracted verbatim and run under `/bin/bash` against the suite's fake `archon` with `respond` failing and `get` succeeding exits nonzero with zero `wait` calls, versus the review's own reproduction of the unfixed fence (`FENCE EXIT PATH: run_status=[paused] resolved=[]`, exit 0).

### CR-202

- disposition: fixed
- evidence: the prefix a command carries is now derived from `$kind` at the point each command is built, not hardcoded: `herdr-next/SKILL.md` step 7 adds `case "$kind" in codex) command="\$${command#/}" ;; esac` before `send-text`, the gate mode builds `attach` the same way before `agent prompt`, and `stop_hook.sh` adds the matching two-line case beside its own kind check, converting `$cmd` before the final `send-text`. Step 8's prose states the rule and points at both call sites; `shared/CONVENTIONS.md`'s Handoff section is cited as why the fence itself stays `/` (a Codex person retypes it, but a pane has no person doing that). `herd_next_gate_answer.md`'s line naming the submitted command was also unhardcoded from a literal `/deliver --run <run-id>` to the two-variant slot, since the review's own fix would otherwise have made that reply's claim false for a codex pane.
- files changed: `skills/delivery/herd-next/SKILL.md`, `skills/delivery/herd-next/references/stop_hook.sh`, `skills/delivery/herd-next/references/herd_next_gate_answer.md`
- regression check: `shellcheck skills/delivery/herd-next/references/stop_hook.sh` exits 0. Reproduced live: each of the three edited case-statements extracted verbatim from its file and run with `kind=codex` and `kind=claude` produces `$create-plan @.agents/tasks/foo` / `/create-plan @.agents/tasks/foo` and `$deliver --run r1` / `/deliver --run r1` respectively, in every case. No automated test covers this path (the collection's `tests/steward.test.mjs` only extracts the two skills' bash fences by marker, and these fences carry no marker it looks for); the live extraction above is the same class of proof the review's own CR-201 reproduction used.

## Advisory Decisions

### ADV-201

- disposition: accepted
- reason: dropped the fourth variant (`` `has no gate waiting` ``) from `deliver_ended_answer.md`; `deliver/SKILL.md:81` is confirmed as the template's only caller and it never selects that branch. Simpler than naming a case nothing reaches.

### ADV-202

- disposition: accepted
- reason: `deliver/SKILL.md`'s run-id read now polls the run list "every few seconds for up to 30 seconds" before calling a still-absent dispatch a start failure, and the failure sentence now says to report "the background process's own captured output (wherever the runtime's long-running-process mechanism recorded its stdout and stderr)", closing the second half of the finding (where that output lives).

### ADV-203

- disposition: accepted
- reason: one clause added at `deliver/SKILL.md`'s decision-mapping paragraph: "`intent: proceed` is `approve`, `$text` empty. ... is `reject`, `$text` the person's words.", in the shape the finding asked for (matching ADV-103's precedent for `$judge`/`$reply`).

### ADV-204

- disposition: accepted
- reason: `scripts/validate.mjs` no longer holds a literal copy of the gate-ask sentence. `GATE_ASK_SENTENCE` is now parsed out of `shared/CONVENTIONS.md`'s own `` ```text `` fenced block under "## Archon gate ask", and the validator fails loudly (`missing the Archon gate ask fenced sentence`) if that heading or fence ever goes missing, instead of silently drifting from a stale copy. The commit-subject check just below reuses the same `conventionsLines` read rather than re-reading the file.

### ADV-205

- disposition: accepted
- reason: `.ignore` is a personal ripgrep preference (re-admitting the gitignored `graft/` tree to search), not shared collection infrastructure, so it takes the finding's second option: added `/.ignore` to `.gitignore` rather than committing it.

### ADV-206

- disposition: left_advisory
- reason: unchanged from the review's own record. Acceptance (a) and (b) still need a live, outward-facing action in a Herdr workspace that no automated fix round has a turn to confirm; the review itself declines to re-raise this a fourth time for exactly that reason, and this round agrees rather than re-litigating a constraint no fix round can clear. CR-201 and CR-202, both now fixed, sat on this same unproven path, so the residual risk is smaller than before but the walkthrough itself is still outstanding.

## Verification

- command: `npm test`
- result: exit 0, `tests 71 / suites 3 / pass 71 / fail 0 / cancelled 0 / skipped 0 / todo 0`. 70 from before plus the new respond-failure fixture; all 7 steward tests pass, including the narrowed get-failure test and the new respond-failure test.
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs ef969cd..HEAD`
- result: exit 0, `ok: 45 subjects`.
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command: `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md` (acceptance (d))
- result: 14 lines in 5 files, unchanged from the review's count; no new line addresses a person.
- command or inspection: CR-201 fix reproduction, the fixed `deliver/SKILL.md` respond fence run verbatim under `/bin/bash` against the fake `archon` with `FAKE_FAIL_ON=respond` (respond fails, get would succeed)
- result: exit nonzero, zero `wait` calls in argv, Archon's error text on stderr. The decision is never dropped silently; this is `tests/steward.test.mjs`'s new test, also run standalone.
- command or inspection: CR-202 fix reproduction, the three edited `case "$kind"` lines (herd-next step 7, herd-next gate mode, stop_hook.sh) extracted verbatim and run with `kind=codex` and `kind=claude`
- result: `codex` yields `$create-plan @.agents/tasks/foo` / `$deliver --run r1`; `claude` yields `/create-plan @.agents/tasks/foo` / `/deliver --run r1`, in all three files.

## Remaining Blocks

- None. ADV-206 is a recorded decision (left advisory, with residual risk noted above), not a block.
