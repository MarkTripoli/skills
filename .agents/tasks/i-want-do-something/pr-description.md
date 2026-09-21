Task: `i-want-do-something`

## Purpose

Add `iterate-evidence`, a companion to `record-evidence` that records UI behavior, inspects retained pixels, applies evidence-backed repairs, and repeats only within explicit round and evidence guardrails.

## Acceptance criteria

- Record a video before diagnosing defects: the `iterate-evidence` live scenarios use the installed recorder, fixed fixture captures, retained raw media, and independently opened frames; prior V9 primary, label-disagreement, zero-limit, three-rounds, continuation, and viewer-blocked evidence proves these paths at the preceding source revision.
- Inspect the video and identify UI or behavior defects: receipts bind findings and coverage to recorded sessions, frame identities, viewer payloads, timestamps, and source revisions; `node --test tests/evals.test.mjs` passes the inspection and provenance regressions.
- Repair the source from observed evidence: source edits remain allowlisted and separate from receipt commits; the R14 gate refuses a bounded worker until the subject has saved an active reservation and never writes evidence on the subject's behalf.
- Repeat with evidence and guardrails: reservations consume bounded rounds, worker delegation is retained in `worker/delegation.jsonl`, terminal receipts cannot reserve work, and `node --test tests/evals.test.mjs` passes 17/17 focused tests. A fresh seven-flow live rerun remains blocked by provider quotas and is not claimed as passing.

## Special things to note

- R14 fixes the V9 failure at the delegation boundary, not with additional prose: the pinned launcher fails closed on missing, stale, or terminal reservations and records the exact refusal.
- The fresh seven-flow rerun could not execute valid subjects: Anthropic Sonnet hit its monthly spend limit, and the cost-effective DeepSeek fallback hit its five-hour limit. Retained V9 evidence and deterministic boundary rehearsal are reported separately; no new live pass is claimed.
- Source and receipt commits remain separate. No dependency or changeset update was needed.

## Change outline

The new bounded delegation path is isolated from the existing grader while sharing one checkpoint predicate:

```text
evals/worker-gate.mjs
  reservationCheckpoint(receipt)
  reservationGateDecision(receipts)
  boundedWorkerLauncher(spec)

runEvidenceScenario(no-progress)
  generated pinned launcher -> worker/delegation.jsonl
  invalid checkpoint -> exit 3, no worker, no receipt mutation
  valid checkpoint -> real worker, reservationSha256 retained

gradeEvidenceScenario(no-progress)
  require allowed retained decision
  require receipt hash before app.js mutation
  inspect worker trace/source transition
```

The source ownership is:

```text
skills/delivery/iterate-evidence/
  SKILL.md                         reservation and repeat-round contract
evals/
  worker-gate.mjs                  fail-closed bounded delegation boundary
  iterate-evidence.mjs              scenario setup, snapshots, and grader
tests/evals.test.mjs                reservation and launcher regressions
docs/testing.md                    live evaluation and known-limit guidance
.agents/tasks/i-want-do-something/
  22-implementation-iterate-evidence.md
  23-code-review-iterate-evidence.md
  pr-description.md
```

At runtime, the subject owns receipt writes and must save `status: in-progress`, `stop_reason: none`, the consumed round, and the matching round record before invoking the disclosed worker. The pinned launcher validates those bytes before spawning; the grader then verifies the retained decision and source transition.

## Human Review

### Review targets

- `evals/worker-gate.mjs`: terminal receipts, missing receipts, multiple attempts, hash binding, and the one-worker guard.
- `evals/iterate-evidence.mjs`: pinned module inclusion, no-progress launcher wiring, and grader ordering checks.
- `skills/delivery/iterate-evidence/SKILL.md`: reservation and refusal instructions.
- `tests/evals.test.mjs`: negative terminal-receipt case and valid-worker admission case.
- Review artifact: `.agents/tasks/i-want-do-something/23-code-review-iterate-evidence.md`.

### Verify

- [ ] Re-run the seven named iterate-evidence scenarios with a supported, quota-available subject model; the current attempt is blocked by provider quotas.
- [ ] Confirm the human review agrees that the launcher refuses terminal reservations without writing a receipt and admits only a real worker after the saved checkpoint.

### Known limits

- Live evidence is local and ignored by Git. The fresh seven-flow run is blocked by provider quotas; prior V9 evidence covers the six unaffected flows, while R14's focused tests and retained V9 boundary rehearsal cover the new delegation behavior.
