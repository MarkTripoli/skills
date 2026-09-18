---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/herdr-plugin-delivery-flow/15-code-review-herdr-plugin.md
reviewed_head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
fixed_head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f (working tree, uncommitted at write time)
status: complete
summary: "Fixed CR-005, the only major finding: both the recovery call in stop_hook.sh and its prose original in SKILL.md now pass `--until idle --until \"done\"` to `herdr agent wait`, so the wait can no longer settle on `blocked`, the exact state the branch exists to sit out; the same correction was made in 04-plan-herdr-plugin.md so the broken prescription is not reintroduced by a later reader. Proved by reproducing the review's mock-herdr harness twice: with `agent wait` still returning non-idle within the timeout, the hook now stops before `pane rename`/`pane send-text` and tears the pane down, where before the fix it staged the handoff command into the dialog; with `agent wait` settling on `idle`, the hook proceeds to rename and stage exactly as the happy path always did. All three advisories were fixed: the gate mode in SKILL.md now carries step 7's `agent_not_ready` handling over by reference (ADV-012), step 6 now states the leading-lowercase-letter rule the CLI enforces and directs an unresolvable name to ask the user rather than guess one (ADV-013), and stop_hook.sh's signal traps are now split so INT/TERM/HUP run cleanup and exit immediately instead of resuming the script after teardown (ADV-014), confirmed by sending SIGTERM mid-run before and after pane creation. npm test (61/61), scripts/validate.mjs, scripts/sync-plugin.mjs --check, scripts/check-commits.mjs (15 subjects), shellcheck, and bash -n all pass on the fixed files."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: none. `git merge-base origin/main HEAD` is still `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1`, the same `base_sha` the round-15 review recorded.
- unrelated changes preserved: yes. Only `skills/delivery/herd-next/SKILL.md`, `references/stop_hook.sh`, and the task's own `04-plan-herdr-plugin.md` were touched for this round; the round-14 edits to `references/herd_next_answer.md` and `references/herd_next_gate_answer.md` already in the working tree were left as-is.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-005

- disposition: fixed
- evidence: `stop_hook.sh:139` changed from `herdr agent wait "$name" --timeout 30000` to `herdr agent wait "$name" --until idle --until "done" --timeout 30000` (the second `--until` value is quoted to keep `shellcheck` from reading the bare word `done` as the shell keyword, SC1010). `SKILL.md:68` and `04-plan-herdr-plugin.md:133` gained the same two flags in their prose commands, plus a sentence stating that a bare wait settles on `blocked` too. Reproduced against a mock `herdr` matching the review's harness: `agent start` emits `{"error":{"code":"agent_not_ready",...}}` on stderr with exit 1, and `agent wait` (now invoked with `--until idle --until "done"`) exits 1 because the mock never reaches those states. The call log is `agent start ...`, `agent wait demo-fix-code-review --until idle --until done --timeout 30000`, `pane close pNEW`, with no `pane rename` or `pane send-text` - before the fix the same mock produced `agent start`, `agent wait` (no flags, exit 0 immediately), `pane rename`, `pane send-text`. A second run with `agent wait` returning `{"result":{"agent":{"status":"idle"}}}` and exit 0 proceeds to `pane rename pNEW demo/fix-code-review` and `pane send-text pNEW /fix-code-review @14-code-review-fixes-demo.md`, confirming the happy recovery path is unchanged.
- files changed: `skills/delivery/herd-next/references/stop_hook.sh:139`, `skills/delivery/herd-next/SKILL.md:68`, `.agents/tasks/herdr-plugin-delivery-flow/04-plan-herdr-plugin.md:133`
- regression check: `bash -n` and `shellcheck` both exit 0 on `stop_hook.sh`; `npm test` 61/61; `node scripts/validate.mjs` and `node scripts/sync-plugin.mjs --check` both exit 0; the two mock-`herdr` reproductions above.

## Advisory Decisions

### ADV-012

- disposition: accepted
- reason: added one sentence to the gate block in `SKILL.md`, directly after its `agent start`/`pane rename`/`pane send-text` code block: "The `agent_not_ready` handling is the one already stated in step 7; the gate mode does not restate it: wait with `herdr agent wait "$name" --until idle --until done --timeout 30000` before staging the read, and report a still-blocked agent in the reply rather than sending input to it." Matches the style of the existing stage-not-submit carry-over sentence lower in the same section.

### ADV-013

- disposition: accepted
- reason: `SKILL.md` step 6 gained "The built name must start with a lowercase letter, exactly as `stop_hook.sh` checks after building it; when it does not (a slug beginning with a digit, most often), ask the user for a name and stop rather than guessing one." This mirrors what `stop_hook.sh:128` actually does on the same check - it cannot ask, so it exits 0 - rather than inventing a repair step the hook does not perform, which would have created a new disagreement between the two.

### ADV-014

- disposition: accepted
- reason: `stop_hook.sh:34-35` split the single `trap cleanup EXIT INT TERM HUP` into `trap cleanup EXIT` and `trap 'cleanup; exit 0' INT TERM HUP`, the suggestion's second option, so a signal tears down and ends the script where it is caught instead of resuming. Confirmed with two SIGTERM runs against a slowed mock `herdr`: sent before any pane exists, the hook exits 0 having made no further calls past the one in flight; sent after a pane was split, the hook exits 0 and calls `pane close` on it (logged twice - once from the INT/TERM/HUP trap, once from the EXIT trap the explicit `exit 0` still triggers - the second call is the same no-op the review already accepted).

## Verification

- command: `npm test`
- result: exit 0, `tests 61 / pass 61 / fail 0`, `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens`.
- command: `node scripts/validate.mjs`
- result: exit 0, `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens, packs checked with /usr/local/bin/archon`.
- command: `node scripts/sync-plugin.mjs --check`
- result: exit 0, `plugin in sync (version 2.1.0, 35 skills, 7 agents)`.
- command: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 15 subjects`.
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0.
- command: mock-`herdr` harness reproducing CR-005's still-blocked case (`agent wait --until idle --until "done"` exits 1 within timeout) and its recovered case (`agent wait` returns `idle` and exits 0)
- result: still-blocked case stops before `pane rename`/`pane send-text` and closes the pane; recovered case proceeds to `pane rename` and `pane send-text` exactly as the pre-existing happy path.
- command: SIGTERM sent to the running hook before and after pane creation (ADV-014)
- result: both runs exit 0; the pre-creation run makes no calls after the one in flight, the post-creation run calls `pane close` on the pane it had made.

## Remaining Blocks

- None.
