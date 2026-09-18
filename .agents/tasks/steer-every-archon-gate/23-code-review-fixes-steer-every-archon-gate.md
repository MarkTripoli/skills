---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/steer-every-archon-gate/22-code-review-steer-every-archon-gate.md
reviewed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd
fixed_head_sha: 89ea95e75c8691136557826fa24f64b08ac80ecd (unchanged; fixes are uncommitted working-tree edits for the workflow engine to commit)
status: complete
summary: "Fixed all three open major findings in the steward's bash fences (CR-101 unbounded wait loop, CR-102 zsh-reserved `status` variable, CR-103 no fallback when herd-next opens no pane) plus all five advisories. CR-104 (acceptance (a)/(b) still unproven end-to-end) is declined again, as a decision rather than a block: it needs an outward-facing action in the person's live Herdr workspace and no interactive confirmation is available in this automated fix-round. npm test is 70/70 (69 plus one new fixture), validate.mjs/check-commits.mjs/shellcheck are clean, and the loop/zsh fixes were each reproduced live against the same failure the review found."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `origin/main` merge base is unchanged; no new commits landed on either side since the review.
- unrelated changes preserved: the nine files the previous fix round left uncommitted (`.changeset/herd-next-skill.md`, `scripts/validate.mjs`, `shared/CONVENTIONS.md` prior edits, `skills/delivery/deliver/SKILL.md` prior edits, `skills/delivery/herd-next/references/herd_next_gate_answer.md`, `skills/delivery/herd-next/references/stop_hook.sh`, `skills/delivery/start-epic-delivery/references/epic_delivery_final_answer.md`, `skills/delivery/typed-judgment/judge.mjs`, `tests/steward.test.mjs`) and the untracked `.changeset/deliver-steward.md` are all untouched by this round except where a finding below names them.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-101

- disposition: fixed
- evidence: `deliver/SKILL.md`'s "Resolve and wait" fence dropped the `while :; ... done` wrapper and the `case ... break` (was lines 107-112). It is now `respond` once, `wait` once, `get` once, `run_status` read once - one shell call, bounded by `wait`'s own `--timeout`. The prose now tells the agent to re-run the `wait`/`get`/`run_status` lines in a fresh shell call (dropping `respond`) until `run_status` is terminal, and names this as the same fence the running-run branch already runs standalone. Reproduced live: extracted the fixed fence and ran it against a fake `archon` that always answers `get` with `{"status":"running",...}` - it returns after exactly one `wait` call instead of looping (previously: `UNBOUNDED: still looping after 51 chunks in ONE shell call`).
- files changed: `skills/delivery/deliver/SKILL.md`
- regression check: `tests/steward.test.mjs`'s "respond and every wait chunk..." test still asserts exactly one `wait` call in `argv` and passes unchanged, as the review's own fix direction predicted.

### CR-102

- disposition: fixed
- evidence: renamed the bash variable `status` to `run_status` at all three sites the review named (`deliver/SKILL.md`'s state read and wait fence, `herd-next/SKILL.md`'s gate-mode state read), plus every `$status` reference in surrounding prose, and added one sentence explaining why (`status` is a read-only zsh alias for `$?`). Reproduced live: the fixed state-read fence, run under `/bin/zsh` with `archon` shadowed as a function, now completes and prints `run_status=[running]` instead of aborting with `read-only variable: status` at line 2.
- files changed: `skills/delivery/deliver/SKILL.md`, `skills/delivery/herd-next/SKILL.md`, `tests/steward.test.mjs` (the `REPORT` helper now prints `$run_status`)
- regression check: `tests/steward.test.mjs` full run, 6/6 steward tests pass, including the two that print and assert on the renamed variable.

### CR-103

- disposition: fixed
- evidence: `deliver/SKILL.md:54` now branches on herd-next's reply: when it opens with "No pane was opened" (herd-next's own four decline paths - unreadable kind, unbuildable name, a failed `get`, or a still-blocked agent), `deliver` falls through to step 6 and stewards inline in this session instead of printing a pane pointer for a pane that does not exist. `deliver/SKILL.md:55` and the step-6 entry-point sentence were updated to name this new entry path. `deliver_archon_answer.md`'s conditional line was also reworded from "Outside Herdr / Inside Herdr" to "no pane was opened / a pane was opened", because the old wording kept selecting the pane-pointer variant purely from `HERDR_ENV`, which would have reproduced the same bug through the reply template even with the SKILL.md branch fixed.
- files changed: `skills/delivery/deliver/SKILL.md`, `skills/delivery/deliver/references/deliver_archon_answer.md`
- regression check: `node scripts/validate.mjs` (checks every `references/<file>` mention resolves and the gate-ask sentence survives in this template) exits 0.

### CR-104

- disposition: declined
- reason: acceptance (a) and (b) still need a live, outward-facing run in the person's Herdr workspace to prove (a real `/deliver` start, a real pane opening, a real gate resolved) - the same action the previous round declined for the same reason. This fix round runs as the workflow engine's next phase with no interactive user turn to confirm that action before taking it, so it is declined again rather than left as an unresolved `blocked` finding, per the review's own fix direction ("if it is declined again, say so as a decision rather than a block"). The residual risk is unchanged from the review: CR-101, CR-102, and CR-103 all sat on this exact unproven path, so the recommended next step is to run plan 13's checklist steps 1-4 once against a scratch `delivery-start` run with a bare remote in a session where that live action can be confirmed, and record the pane label, the agent's first message, and the resolved gate in the verification artifact.

## Advisory Decisions

### ADV-101

- disposition: accepted
- reason: added `// empty` to the one unguarded `decisions` read in both `deliver/SKILL.md` and `herd-next/SKILL.md`, matching its four siblings, and added a `running`-fixture test (`tests/steward.test.mjs`) covering both skills' reads against `{"status":"running","working_path":"/runs/x","metadata":{}}` - the exact shape the review reproduced the `jq: error ... Cannot iterate over null` failure against. Both reads now return `running|/runs/x||` cleanly.

### ADV-102

- disposition: accepted
- reason: replaced `<<<"${a:-{\}}"` with an explicit `[ -n "$a" ] || a='{}'` line before both reads in `deliver/SKILL.md`, then `<<<"$a"`. Correct under both bash and zsh now, and one construct simpler as the review's own suggestion noted.

### ADV-103

- disposition: accepted
- reason: added one clause before the fence in `deliver/SKILL.md` ("`$judge` is `<skills dir>/typed-judgment/judge.mjs` from step 2; `$reply` is the person's words, verbatim"), in the same shape the previous round's ADV-001 used for `$slug`.

### ADV-104

- disposition: accepted
- reason: the byte-exact ask sentence in `shared/CONVENTIONS.md`'s "Archon gate ask" section is now in a fenced ` ```text ` block instead of nested single backticks, so it renders as one sentence instead of three fragments. `scripts/validate.mjs`'s separate hardcoded copy (noted in the same finding as a drift risk, not part of the suggested fix) is unchanged; both copies still read byte-identical.

### ADV-105

- disposition: accepted
- reason: added `.backups/` to `.gitignore`, closing the gap the finding named. `.ignore` is left as the finding's own suggestion left it - a choice between committing it deliberately or ignoring it - and stays undecided; no action taken on it here.

## Verification

- command: `npm test`
- result: exit 0, `tests 70 / suites 3 / pass 70 / fail 0 / skipped 0 / todo 0`. 69 from before plus the new ADV-101 running-fixture test; all 6 steward tests pass, including the two touched by CR-102's rename.
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 59 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 66 subjects`.
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output (file untouched by this round).
- command: `grep -rn 'archon workflow' skills/delivery/*/references skills/delivery/*/SKILL.md` (acceptance (d), same shallower glob the review used since `task.md`'s glob matches nothing)
- result: 14 lines across 5 files, matching the review's count. Every line is still either a command the agent runs itself, past-tense provenance, or a `{child_start_command}` placeholder; none addresses a person. Acceptance (d) still holds.
- command or inspection: the fixed `deliver/SKILL.md` wait fence, extracted verbatim and run against a fake `archon` whose `get` always answers `{"status":"running"}`
- result: returns after exactly one `wait` call (`{"result":"attention"}`, exit 0) instead of looping. This reproduces CR-101's fix.
- command or inspection: the fixed `deliver/SKILL.md` state-read fence, run under `/bin/zsh` with `archon` shadowed as a function returning a `running` fixture
- result: `AFTER: run_status=[running]`, exit 0 - no `read-only variable` abort. This reproduces CR-102's fix.

## Remaining Blocks

- None. CR-104 is a recorded decision (declined, with residual risk noted above), not a block.
