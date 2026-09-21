Task: `one-thing-i-m`

## Purpose

Keep economical models on ordinary delivery stages while allowing JEV to escalate eligible non-code stages only to a caller-declared available reasoning model.

## Special things to note

- `available_models` is caller-provided capability information; this repository does not probe provider accounts or import provider registries.
- Omitting `available_models` preserves compatibility by treating the configured economy and reasoning models as available.
- An explicit list without the economy model fails before stage execution; native provider rejection after selection remains outside this change.

## Change outline

The workflow now carries model availability into the existing selection boundary.

```diff
 delivery inputs
+  available_models: string[]
       |
       v
 controller.runSkill
+  records and forwards available_models
       |
       v
 selectStageModel
+  normalizes available candidates
+  requires the economy model
+  permits JEV escalation only when reasoning is available
```

Ownership remains concentrated in the existing routing modules.

```text
atomic/lib/models.mjs                 validates candidates and selects the stage model
atomic/lib/controller.mjs             forwards and records availability
atomic/workflows/delivery.ts          defines the public workflow input
tests/atomic-model-routing.test.mjs   covers filtering and fail-closed behavior
docs/model-routing.md                 documents the caller contract
```

Review `atomic/lib/models.mjs` first: code-writing and unknown stages still select the economy model without calling JEV.

## Human Review

### Review targets

- Candidate normalization and fail-closed economy validation in `atomic/lib/models.mjs`.
- JEV is called only for eligible non-code stages when the reasoning candidate is available.
- Workflow input transport and the caller-owned availability limitation match the documented contract.

### Verify

- [ ] `npm test` exits 0 with 155 passing tests.
- [ ] `npm run check-commits -- origin/main..HEAD` accepts every commit subject.
- [ ] Compare the implementation with [the plan](.agents/tasks/one-thing-i-m/05-plan-one-thing-i-m.md) and [verification receipt](.agents/tasks/one-thing-i-m/08-verification-one-thing-i-m.md).

### Known limits

- Provider/account availability is not discovered or independently verified; callers must supply an accurate list.
