---
task: one-thing-i-m
type: structure-outline
summary: "The implementation is split into two vertical phases: make the stage selector enforce an available candidate set with economy-first and JEV escalation rules, then expose that set through the delivery workflow and document the contract. Each phase has focused unit or repository validation and keeps the existing fixed-routing and fail-closed semantics."
repo: skills
branch: one-thing-i-m
sha: da5c0fd
---

# Enforce economical, available model routing

The outline adds caller-provided model availability to the existing stage selector without introducing provider-specific discovery. It keeps the economical model as the default, lets JEV escalate only among available candidates for eligible phases, and persists enough selection context to explain the result.

## Desired End State

- `selectStageModel` never returns a model absent from the normalized available set.
- Omitted availability preserves current two-model behavior; explicit availability narrows it.
- Mutation, tool-oriented, and unknown phases use the economy candidate only.
- Eligible non-code phases use JEV only when both economy and reasoning candidates are available; otherwise the only available candidate is selected by policy.
- Delivery accepts and forwards `available_models`, and documentation plus a changeset describe the user-facing contract.

## Phase Checklist

- [ ] Phase 1: Enforce available candidates in the stage selector
- [ ] Phase 2: Wire delivery input, records, documentation, and release metadata

---

## Phase 1: Enforce available candidates in the stage selector

The selector becomes the single owner of candidate validation and availability filtering. Tests exercise economy defaults, unavailable candidates, eligible escalation, mutation policy, explicit empty availability, and existing fixed/JEV failure behavior.

### Change Outline

```text
atomic/lib/
└── models.mjs                 ~ normalize candidates and enforce policy
 tests/
└── atomic-model-routing.test.mjs  + selector availability and escalation cases
```

- Add an optional `availableModels` selector option.
- Normalize it as a de-duplicated non-empty string set; when omitted, use configured economy and reasoning identifiers.
- Require the economy model for every executable selection. Reject an explicit empty list or a missing economy candidate before JEV or task execution.
- Return economy policy for mutation/tool/unknown phases.
- For eligible phases, ask JEV only when both configured candidates are available; otherwise return the available economy candidate by policy.
- Add `availableModels` and `candidates` to fixed, policy, and JEV records without exposing provider secrets.

### Validation

#### Automated Verification

- [ ] `node --test tests/atomic-model-routing.test.mjs`

human-gated: false

---

## Phase 2: Wire delivery input, records, documentation, and release metadata

The workflow exposes the availability list and forwards it to every stage selection. Public documentation states caller ownership and compatibility semantics; a changeset records the user-facing routing input change.

### Change Outline

```text
atomic/workflows/delivery.ts ~ add available_models input and pass it through task inputs
atomic/lib/controller.mjs    ~ forward available models and persist selection context
 docs/model-routing.md       ~ describe economical defaults, JEV escalation, and availability
.changeset/
└── economical-model-routing.md + release note for the new routing contract
```

- Add a TypeBox optional array of non-empty strings named `available_models`.
- Preserve it in durable workflow inputs and pass it as `availableModels` to `selectStageModel`.
- Keep child workflow inputs compatible by inheriting the serialized input object.
- Document that omitted availability means both configured candidates and an explicit list is caller-provided capability information, not provider probing.
- Document failure when economy is absent and policy behavior when reasoning is absent.
- Add a focused changeset with a patch release note.

### Validation

#### Automated Verification

- [ ] `npm test`
- [ ] `npm run check-commits`

human-gated: false

## Open Questions

None. The design discussion resolved the availability ownership, compatibility, escalation, and failure semantics for autonomous implementation.

## Human Review

### Review targets

- Phase 1 owns all model candidate validation and policy decisions; Phase 2 only transports and documents the contract.
- The explicit-empty and missing-economy failures remain fail-closed.
- The full repository check validates generated/runtime resources and the changeset.

### Verify

- [ ] Phase 1 selector tests pass before Phase 2 wiring begins.
- [ ] `npm test` passes after Phase 2 and the changeset is present.

### Known limits

- Available-model truth remains caller-supplied because no provider-neutral capability API exists.
- No live provider execution is part of the repository test suite.
