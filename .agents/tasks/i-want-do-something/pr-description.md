Task: `i-want-do-something`

## Purpose

Add `iterate-evidence`, a companion to `record-evidence` that records UI behavior, inspects retained pixels, applies evidence-backed repairs, and repeats only within explicit round and evidence guardrails.

## Acceptance criteria

- Record a video before diagnosing defects: live iterate-evidence scenarios use the installed recorder, fixed fixture captures, retained raw media, and independently opened frames. R15 source commit `fb4134f` requires bare image-path or bare retained-video timestamp reads for returned image-payload identity. R16 source commit `739b0b7` requires each required bare image or video-timestamp read to run as a standalone sequential media read, never concurrently with another tool call.
- Inspect the video and identify UI or behavior defects: receipts bind findings and coverage to recorded sessions, frame identities, viewer payloads, timestamps, trace lines, source revisions, and reservations. The first fresh valid Codex run `evals/results/20260921-033850` graded 5/7 after R15/R16 parser fixes: primary, label-disagreement, viewer-blocked, zero-limit, and three-rounds passed; no-progress and continuation exposed the concurrent media-read findings fixed by R16.
- Repair the source from observed evidence: source edits remain allowlisted and separate from receipt commits; the bounded worker cannot run until the subject has saved an active reservation; action-labelled flow IDs such as `F-INC Add one once from zero` now resolve without weakening mixed-semantics conflict closure.
- Repeat with evidence and guardrails: the targeted fresh Codex run `evals/results/20260921-042117` graded 2/2 after R16 for no-progress and continuation. Combined fresh Codex evidence is 7/7 across the two runs. Focused eval tests pass 19/19, and full `npm test` passes 191/191.

## Special things to note

- R15 fixes returned-image identity, not interpretation quality: `?q=` image questions may supplement pixel interpretation, but they do not satisfy frame binding without a bare read of the same retained sample.
- R16 fixes media-read ordering and the label-disagreement parser gap: bare evidence-frame reads must be sequential and standalone, and action-labelled Add one IDs map to increment while mixed increment/reset labels still fail closed.
- The seven accepted scenarios are split across two fresh Codex runs: `20260921-033850` carries the five unaffected/patched scenarios, and `20260921-042117` carries the two R16-targeted scenarios. Ignored eval outputs remain local evidence, not tracked source.
- Source and receipt commits remain separate. R15/R16 added patch changesets for user-facing skill guidance.

## Change outline

R15/R16 tighten the inspection contract and preserve the grader's fail-closed evidence model:

```text
iterate-evidence inspection contract
  required frame observation
    -> bare retained PNG/JPEG read, or bare retained video:timestamp read
    -> returned image payload hash recorded in trace/review binding
    -> ?q= allowed only as supplementary interpretation

  sequential media-read boundary
    -> one required media read per tool window
    -> no concurrent bash/write/read/browser/delegation/other tool
    -> wait for image payload before recording observation or next call

counterFlowCoverage
  F-INC Add one once from zero -> increment
  F-RESET Reset from nonzero -> reset
  mixed increment/reset semantics -> fail closed

fresh Codex evidence
  20260921-033850 -> 5/7 accepted after parser fix
  20260921-042117 -> 2/2 accepted after R16
  combined accepted scenarios -> 7/7
```

The source ownership is:

```text
skills/delivery/iterate-evidence/
  SKILL.md                         bare image-payload and sequential-read contract
  references/inspection_acceptance.md
                                   frame identity, ?q= limits, standalone media reads

docs/testing.md                    live review instructions for retained media review

evals/
  evidence-flows.mjs               action-labelled flow ID parsing
  iterate-evidence.mjs              retained trace, review, and grader enforcement
  worker-gate.mjs                  saved-reservation bounded worker boundary

tests/evals.test.mjs               19 focused eval regressions, including R15/R16

.changeset/
  iterate-evidence-image-payload.md
  iterate-evidence-r16.md

.agents/tasks/i-want-do-something/
  24-implementation-iterate-evidence-image-payload.md
  25-implementation-iterate-evidence.md
  26-code-review-iterate-evidence.md
  pr-description.md
```

At runtime, the subject owns receipt writes and must save `status: in-progress`, `stop_reason: none`, the consumed round, and the matching round record before invoking the disclosed worker. The reviewer owns the retained-media inspection and must bind every required flow to a completed standalone media read.

## Human Review

### Review targets

- `skills/delivery/iterate-evidence/SKILL.md`: bare image-payload wording, `?q=` limitation, and standalone sequential media-read instructions.
- `skills/delivery/iterate-evidence/references/inspection_acceptance.md`: per-flow frame identity, transformed payload handling, and the no-concurrent-tool requirement.
- `docs/testing.md`: live eval review guidance for retained frames and saved grading.
- `evals/evidence-flows.mjs`: action-labelled Add one parsing and conflict-closed mixed-label behavior.
- `tests/evals.test.mjs`: R15 image-payload instruction regression and R16 `F_COVERAGE_PARSE_R16` parser regression.
- Review artifact: `.agents/tasks/i-want-do-something/26-code-review-iterate-evidence.md`.

### Verify

- [x] `node --test tests/evals.test.mjs` passed 19/19 focused tests after R16.
- [x] `npm test` passed 191/191 full tests.
- [x] Fresh Codex saved grading for `evals/results/20260921-033850` passed 5/7: primary, label-disagreement after parser fix, viewer-blocked, zero-limit, and three-rounds.
- [x] Fresh Codex saved grading for `evals/results/20260921-042117` passed 2/2: no-progress and continuation after R16.
- [x] Combined fresh Codex evidence passed 7/7 across the two retained runs.

### Known limits

- The seven accepted scenarios are split across two fresh Codex runs, not one single seven-scenario invocation.
- Live evidence under `evals/results/` is local and ignored by Git; the PR carries source, tests, changesets, task artifacts, and commands, not the retained media bytes.
