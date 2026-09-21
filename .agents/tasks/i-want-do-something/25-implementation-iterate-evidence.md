---
task: i-want-do-something
type: implementation
summary: "R16 narrow follow-up for fresh Codex run 20260921-033850. Primary and three-rounds were proven after R15; no-progress and continuation review failed because required bare video timestamp reads were performed in concurrent tool windows, creating viewer temp files during another active tool window. Label-disagreement failed because receipt flow labels such as F-INC Add one once from zero did not resolve to increment coverage. Commit 739b0b7 adds canonical sequential-read guidance and minimally extends counterFlowCoverage parsing for action-labelled Add one flow IDs while preserving conflict-closed semantics."
round: R16
revision: 739b0b7
fixes: SEQUENTIAL_MEDIA_READS_AND_ACTION_LABELLED_FLOW_IDS
---

# R16 Implementation Receipt

## Root cause

Fresh saved grading for `evals/results/20260921-033850` proved the primary and three-round iterate-evidence cases after R15. The remaining failures had two narrow causes:

1. `iterate-evidence-no-progress` and `iterate-evidence-continuation` failed viewer authorization because required retained bare video timestamp reads were issued concurrently with other tool calls during independent review. OMP's video reader creates temporary frame paths while a read is active, so the guard correctly rejected temp files visible during an overlapping tool window.
2. `iterate-evidence-label-disagreement` failed `counterFlowCoverage` because receipt-local flow IDs labelled with observed action phrasing, e.g. `F-INC Add one once from zero`, did not map to the canonical increment flow. `F-RESET Reset from nonzero` already mapped to reset, and conflict-closed behavior still needed to reject mixed semantics.

## Fix (source commit 739b0b7)

- `skills/delivery/iterate-evidence/SKILL.md`: baseline and post-repair inspection now state that every required bare image-path read or bare video-timestamp read is a standalone sequential tool call. The agent must not run it concurrently with `bash`, `write`, another `read`, browser automation, delegation, or any other tool call, and must wait for the returned image payload before recording the observation or starting the next tool call.
- `skills/delivery/iterate-evidence/references/inspection_acceptance.md`: adds the canonical sequential viewer-call requirement next to the per-flow individual frame rule. Parallel inspection is explicitly invalid evidence because viewer temporary files must be attributable to one completed read lifetime.
- `docs/testing.md`: recorded eval guidance now repeats the sequential bare-read requirement for primary/retained reviews before writing `review.json`.
- `evals/evidence-flows.mjs`: minimally extends `flowName()` to recognize `Add one once from zero`, `Add one exactly once from zero`, and equivalent `Add one from zero once` action-labelled flow suffixes as increment.
- `tests/evals.test.mjs`: adds `F_COVERAGE_PARSE_R16`, covering `F-INC Add one once from zero` and `F-RESET Reset from nonzero`, plus an explicit mixed increment/reset semantic conflict that remains rejected.
- `.changeset/iterate-evidence-r16.md`: patch changeset for the user-facing skill guidance and parser fix.

No viewer lifetime authorization was weakened. Scenario expected outcomes were unchanged. Ignored eval review files were not edited.

## Verification

```sh
node --test tests/evals.test.mjs
# tests 19, pass 19, fail 0

node scripts/validate.mjs
# ok: 44 skills, 59 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, Atomic entry checked

node scripts/sync-plugin.mjs --check
# plugin in sync (version 3.1.0, 37 skills, 7 agents)
```

## Commit history

- `739b0b7 fix(iterate-evidence): serialize media evidence reads`
