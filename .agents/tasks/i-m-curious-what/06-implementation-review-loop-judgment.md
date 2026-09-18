---
type: implementation
completed_phase: 2
summary: "Phase 2 of the review-loop judgment plan puts a true/false boundary on the five questions the review, verification, and bugfix loops route on: `noul()` takes an optional second `criteria` argument and omits the field when it is absent, and `reviewStatus`'s `open_major` and `blocked`, `reproductionStatus`'s `shown`, and `verificationStatus`'s `open_fail` and `blocked` each state what makes the answer true and what makes it false. Instructions, thresholds, and the downgrade-only status rules are unchanged, so no verdict moves on the stub. Two assertions on the outbound body prove a gate question sends `criteria` and that `plan-remaining`'s `remaining`, which states no boundary, still sends none; the live endpoint's acceptance of the field stays deferred human evidence."
---

# Implementation Receipt

## Source
- task: `.agents/tasks/i-m-curious-what/task.md`
- plan artifact: `.agents/tasks/i-m-curious-what/04-plan-review-loop-judgment.md`
- phase range: Phase 2 of 5

## Child Workers
- implementer: none; performed inline, because this session is directed not to start subagents. The `agent-implementer` role was executed by this session, as in Phase 1.
- reviewer: none; the diff was read against the plan's Required Edits inline.

## Completed Work
- `noul` takes an optional `criteria` and spreads it only when truthy, so a question with no stated boundary sends the same two-key object it sent before. `skills/delivery/typed-judgment/judge.mjs:114`
- `reviewStatus`'s `open_major` and `blocked` carry the plan's wording: an open gating finding or an advisory that meets the bar is true; only advisories, or findings recorded as fixed or declined, is false. A check that ran and failed is named a finding, not a block. `skills/delivery/typed-judgment/judge.mjs:154-161`
- `reproductionStatus`'s `shown` separates a recorded, run attempt that exhibits the behavior and names the causing code from one that is only described. `skills/delivery/typed-judgment/judge.mjs:176-179`
- `verificationStatus`'s `open_fail` and `blocked` separate a fail verdict or an unresolved finding from an all-pass table, and a missing toolchain, dependency, service, or credential from a check that ran and failed. `skills/delivery/typed-judgment/judge.mjs:192-199`
- The review-status test asserts the outbound `open_major` has exactly `type`, `instructions`, `criteria`, in that order, and that its `false` text is the one written here. `tests/judge.test.mjs:65-67`
- The `plan-remaining` test asserts `remaining` sends no `criteria`, which is the regression guard on the spread. `tests/judge.test.mjs:46`
- No instruction string, threshold, `T` constant, status rule, or `--json` shape changed. No file outside `judge.mjs` and its test was touched.

## Automated Verification
- command: `node --test tests/judge.test.mjs`
- result: pass, 9 of 9, `duration_ms 5143`
- evidence: `judge review-status and reproduction-status: a claim only ever moves toward the safer status, at the majority bar` passes with the new body assertions, and `judge plan-remaining: ...` passes with the no-criteria assertion.

- command: `npm test`
- result: pass, 62 of 62, `duration_ms 26176`
- evidence: `scripts/validate.mjs`, `sync-plugin --check`, and `build-packs --check` are green ahead of `node --test tests/`; `tests/install.test.mjs` passes because `npm ci` was run in this worktree during Phase 1.

## Deferred Human Evidence

- One live `review-status` call with `TYPESAFE_API_KEY` set, confirming the endpoint accepts `criteria` on a `noul` question rather than rejecting the body. Not executed; the key is unset here. Pointer: the plan's Phase 2 deferred-evidence bullet, `.agents/tasks/i-m-curious-what/04-plan-review-loop-judgment.md:345`, and the verification artifact's `## Items` table when this task is verified.

## Commit Handoff
The phase commit was created after both checks were green, staging `skills/delivery/typed-judgment/judge.mjs` and `tests/judge.test.mjs` explicitly. `.agents/tasks/` files and the untracked `.backups/phase2-judge-criteria/` rollback copies are not in it.

## Human Review

### Review targets

- `skills/delivery/typed-judgment/judge.mjs:154-161,176-179,192-199`, the true/false wording of the five gate questions. This is the text the loops route on, so a boundary written one notch off moves a real verdict even though no threshold changed.
- `skills/delivery/typed-judgment/judge.mjs:114`, the spread: a falsy `criteria` (including an empty object, which is truthy, and `null`, which is not) decides whether the field is sent. Only the five call sites above pass one.
- The asymmetry the plan keeps: `choice()` and `score()` require `criteria`, `noul()` does not. The nine other `noul` call sites still send instructions alone.

### Verify

- `node --test tests/judge.test.mjs` passes, 9 of 9.
- `npm test` passes, 62 of 62.
- `Object.keys` on the outbound `open_major` is exactly `["type", "instructions", "criteria"]`, so the field name and nesting are what the endpoint will see.
- `plan-remaining`'s `remaining` question sends no `criteria` key at all, not an empty one.

### Known limits

- `TYPESAFE_API_KEY` is unset here, so no live call has confirmed the endpoint accepts `criteria` on a `noul` question. If it rejects the unknown field, every one of the five gates exits 3 and each loop routes on the session's own claim, which is the existing behavior on any outage. The deferred check above is what would catch it.
- The stub echoes probabilities the test fixes; it does not read `criteria`, so these tests prove the field is sent and shaped correctly, not that the wording changes any judgment.
- Phases 3 and 4 add the `axis-coverage` command and the provenance lines; neither depends on this phase, and Phase 2 added no new command, env variable, or exit code.
