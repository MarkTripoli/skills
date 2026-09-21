Task: `one-thing-i-m`

## Purpose

Delivery now keeps the economical model as the default, lets JEV escalate eligible non-code phases only when the stronger model is available, and rejects configured models outside the caller-provided availability set.

## Special things to note

- `available_models` is caller-provided capability information; this repository does not probe provider accounts or import private registries.
- Omitting `available_models` preserves the existing two-model behavior; an explicit list missing the economy model fails closed.
- `npm test` passed with 155 tests; no remote pull request was opened or pushed.

## Change outline

The delivery boundary now carries an optional available-model list into the existing stage selector.

```diff
workflow inputs
  + available_models: string[]
        |
        v
controller.runSkill
  + checkpoint args include available_models
  + selectStageModel({ availableModels })
        |
        v
selector
  + normalize and deduplicate candidates
  + require economy model
  + JEV escalation only when reasoning is available
```

The selector owns policy and records the available candidates with each decision.

```text
atomic/lib/models.mjs       candidate validation and economy/JEV policy
atomic/lib/controller.mjs   checkpoint and selector transport
atomic/workflows/delivery.ts  available_models workflow input
docs/model-routing.md       public contract
.changeset/...               patch release note
tests/atomic-model-routing.test.mjs  availability and escalation coverage
```

A missing reasoning candidate selects economy without JEV. Mutation, tool-oriented, and unknown stages never call JEV. A missing economy candidate or explicit empty availability list fails before task execution.

## Human Review

### Review targets

- `atomic/lib/models.mjs` candidate filtering, fail-closed behavior, and JEV eligibility.
- `atomic/lib/controller.mjs` checkpoint arguments and selector forwarding.
- `docs/model-routing.md`, the changeset, and focused routing tests.

### Verify

- [ ] `npm test` exits 0 with 155 passing tests.
- [ ] `npm run check-commits -- origin/main..HEAD` exits 0 with valid subjects.

### Known limits

- Provider/account availability is not independently verified; callers must provide a truthful list.
