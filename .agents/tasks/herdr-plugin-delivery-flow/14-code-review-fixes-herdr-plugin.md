---
type: code-review-fixes
date: 2026-09-18
branch: herdr-plugin-delivery-flow
review_artifact: .agents/tasks/herdr-plugin-delivery-flow/13-code-review-herdr-plugin.md
reviewed_head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f
fixed_head_sha: 3497cbb14a4974ab69417e1e878803154e4ca21f (working tree, uncommitted at write time)
status: complete
summary: "Fixed CR-004, the only major finding: stop_hook.sh's agent-start call now keeps both streams (`2>&1`) and branches on the string, not the exit status, so `agent_not_ready` reaches the `herdr agent wait` recovery branch even though the CLI reports it as a non-zero exit; every other non-zero exit still exits 0 as before. All six advisories were also fixed: the EXIT-only trap now also catches INT/TERM/HUP (ADV-006), the handoff reply template no longer names the dropped `gates: none` branch (ADV-007), the Optional Stop hook section now states the unbounded same-tab pane accumulation and that nothing auto-closes it (ADV-008), the gate reply now says the watch ended at this pause and a later gate needs another `--run` (ADV-009), the hook's skill-body summary now names the ancestor walk it performs (ADV-010), and the remaining `workflows/delivery.md:147` line-number citation is now a heading reference matching the style of the citation round 12 already converted (ADV-011). npm test (61/61), scripts/check-commits.mjs (15 subjects), shellcheck, and bash -n all pass on the fixed files, and an isolated harness reproduces the CR-004 branch logic against mocked exit codes to confirm the fix takes the wait path exactly when the error string names it."
---

# Code Review Fixes

## Scope Drift

- base or head changes since review: the repository default branch moved from `31d9b0ffce0773d00b37011a3dab0ed9e1c366e1` (the review's recorded `base_sha`) to `3fafa2513a9a2073978bdcc4592b1127ffcae9c7` between the review and this fix round (16 commits, unrelated work on other skills, `scripts/validate.mjs`, and `shared/CONVENTIONS.md`). None of those commits touch `skills/delivery/herd-next/` or any file this branch changes, so no finding needed re-checking against the new base; recorded here because the template requires it.
- unrelated changes preserved: yes. Only the four files the review scoped in - `skills/delivery/herd-next/SKILL.md`, `references/stop_hook.sh`, `references/herd_next_answer.md`, `references/herd_next_gate_answer.md` - were touched.

## Finding Dispositions

CR entries are the review's critical/major-severity findings; ADV entries are the rest (minor/trivial/info).

### CR-004

- disposition: fixed
- evidence: `stop_hook.sh`'s agent-start line changed from `start=$(herdr agent start "$name" --kind "$kind" --pane "$pane" 2>/dev/null) || exit 0` to capturing both streams and reading the code: `start=$(herdr agent start "$name" --kind "$kind" --pane "$pane" 2>&1)` followed by `rc=$?`, then a `case "$start" in *agent_not_ready*) ... ;; *) test "$rc" = 0 || exit 0 ;; esac`. The error JSON that used to be discarded by `2>/dev/null` and never reached because `|| exit 0` fired first is now the value the `case` matches on, so `agent_not_ready` reaches `herdr agent wait` regardless of the CLI's documented exit-1 convention for that error, while every other error code still falls to `test "$rc" = 0 || exit 0` and exits exactly as before.
- files changed: `skills/delivery/herd-next/references/stop_hook.sh:129-138`
- regression check: `bash -n` and `shellcheck` both exit 0 on the file; `npm test` 61/61. Because no local agent is actually blocked at startup, the branch logic was additionally proven in isolation with a mock `herdr` function returning each of the three shapes the review documented (`agent_not_ready` on exit 1, `agent_pane_not_found` on exit 1, success on exit 0): the fixed snippet took the wait branch only for the first, exited only for the second, and fell through only for the third.

## Advisory Decisions

### ADV-006

- disposition: accepted
- reason: `trap cleanup EXIT` (`stop_hook.sh:34`) is now `trap cleanup EXIT INT TERM HUP`, per the suggestion, so a hook killed by Claude Code's own timeout or another signal still tears down the pane or tab it created.

### ADV-007

- disposition: accepted
- reason: `references/herd_next_answer.md:5` dropped "because the task declares `gates: none` or" from the submitted-command slot, leaving `--submit` as its only stated trigger, matching what Step 8 now implements.

### ADV-008

- disposition: accepted
- reason: added one sentence to the Optional Stop hook section of `SKILL.md` stating that the busy check never treats a same-slug pane as busy, so a full chain accumulates one pane per phase in the same tab with nothing closing the finished ones, and that they need closing by hand. Left the split-vs-tab behavior itself unchanged, per the suggestion's smaller option, since changing the busy-check behavior was not decided by the design discussion this review cites.

### ADV-009

- disposition: accepted
- reason: `references/herd_next_gate_answer.md:5` gained a closing sentence: "This watch ended at this pause; a later gate in the same run needs `/herd-next --run <run-id>` again," so a pack with several gates does not read as if the same invocation is still watching.

### ADV-010

- disposition: accepted
- reason: `SKILL.md:129`'s summary of what the hook does now names the ancestor walk from `cwd` up to the nearest directory holding `.agents/tasks/`, alongside the other differences that paragraph already listed.

### ADV-011

- disposition: accepted
- reason: `SKILL.md:86`'s `workflows/delivery.md:147` citation is now `workflows/delivery.md`, "Steering a run" - the heading directly above that line - matching the heading-reference form round 12 already used for the Step 1 citation, so both citations now survive future line insertions the same way.

## Verification

- command: `npm test`
- result: exit 0, `tests 61 / pass 61 / fail 0`, `ok: 42 skills, 57 answer templates, 20 human-review templates, 0 banned tokens`.
- command: `node scripts/check-commits.mjs main..HEAD`
- result: exit 0, `ok: 15 subjects`.
- command: `shellcheck skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0, no output.
- command: `bash -n skills/delivery/herd-next/references/stop_hook.sh`
- result: exit 0.
- command: isolated mock-`herdr` harness exercising the fixed `case`/`rc` branch against `agent_not_ready`-on-exit-1, `agent_pane_not_found`-on-exit-1, and success-on-exit-0
- result: waited, exited, and fell through respectively, matching the intended branch for each.

## Remaining Blocks

- None.
