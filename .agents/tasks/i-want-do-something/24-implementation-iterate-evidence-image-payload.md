---
task: i-want-do-something
type: implementation
summary: "Follow-up fix for image-payload binding in iterate-evidence. Prior fresh Codex runs used read path?q=... text answers for required frame inspection, so primary and three-rounds could not bind returned image payload identity. Commit fb4134f clarifies the canonical skill, inspection reference, and live eval guidance: required evidence-frame reads must use bare retained image paths or bare retained video timestamp selectors when the grader/review needs a returned image hash; ?q= image questions are text-only interpretation and must be paired with a bare binding read of the same retained sample."
round: R15
revision: fb4134f
fixes: IMAGE_PAYLOAD_BINDING
---

# R15 Implementation Receipt

## Root cause

Fresh valid Codex runs passed no-progress and five other scenarios but failed primary and three-rounds because the subject inspected required evidence frames with `read path?q=...`. That returned text interpretation, not an image payload trace entry, so the grader could not bind the coverage row to returned image bytes.

The existing media/hash/timestamp rule already required retained frame hashes and video timestamp selectors, but it did not explicitly forbid using `?q=` as the binding read or require a separate bare read when `?q=` was used for interpretation.

## Fix (source commit fb4134f)

- `skills/delivery/iterate-evidence/SKILL.md`: baseline and post-repair inspection now require bare image-path reads or bare retained-video timestamp reads for frame identity. `?q=` text questions may only supplement interpretation and must be paired with a bare binding read of the same sample.
- `skills/delivery/iterate-evidence/references/inspection_acceptance.md`: per-flow and frame-identity rules now state that `?q=` returns text only, does not establish image-payload identity, and fails required frame binding unless paired with the bare read. Existing retained media, returned hash, transformation, timestamp-window, and initial-zero rules are preserved.
- `docs/testing.md`: live eval review guidance now states the same bare-read requirement for subject image payloads.
- `tests/evals.test.mjs`: added a focused instruction-contract regression so the canonical skill and acceptance reference keep the bare-read / `?q=` caveat.
- `.changeset/iterate-evidence-image-payload.md`: patch changeset for the user-facing skill guidance.

## Verification

```sh
node scripts/validate.mjs
# ok: 44 skills, 59 answer templates, 20 human-review templates, 4 execution-DAG templates, 2 work-breakdown templates, 0 banned tokens, Atomic entry checked

node --test tests/evals.test.mjs
# tests 18, pass 18, fail 0
```

## Commit history

- `fb4134f fix(iterate-evidence): require image payload reads`

No prior review artifact or ignored eval output was edited.
