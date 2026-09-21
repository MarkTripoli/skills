---
task: one-thing-i-m
type: plan
summary: "This plan implements caller-owned model availability at the existing stage-selection boundary in two phases. Phase 1 adds normalized candidate filtering, economy-only policy for mutation and unavailable escalation, and focused selector tests; Phase 2 transports the input through Atomic, documents the contract, and adds a changeset. The implementation must keep fixed routing fail-closed for unavailable models, preserve omitted-input compatibility, and record available candidates."
repo: skills
branch: one-thing-i-m
sha: 997b3c6
---

# Enforce economical, available model routing Implementation Plan

## Overview

Add an optional `available_models` workflow input and enforce it in `selectStageModel`. The existing economical model remains the default, JEV can choose the reasoning model only when both configured candidates are available for an eligible non-code phase, and all other phases use the available economy candidate without JEV.

## Current State Analysis

The repository already has an economy/reasoning split and a typed JEV choice boundary, but it accepts any non-empty model string and has no provider-neutral availability contract (`atomic/lib/models.mjs:43-47,100-155`). The controller passes model settings into each fresh stage (`atomic/lib/controller.mjs:215-230`), and workflow inputs are defined in `atomic/workflows/delivery.ts:14-28`. Existing tests use isolated JEV helpers (`tests/atomic-model-routing.test.mjs:8-20`) and assert exact selection records (`tests/atomic-model-routing.test.mjs:70-123`).

### Key Discoveries:

- `JEV_ELIGIBLE_SKILLS` and `CODE_WRITING_SKILLS` are the existing ownership boundary for escalation policy (`atomic/lib/models.mjs:9-40`).
- JEV failures for eligible phases are intentionally fail-closed; fixed routing bypasses JEV (`atomic/lib/models.mjs:110-122`; `tests/atomic-model-routing.test.mjs:70-79`).
- Runtime adapters do not expose a shared provider catalog, and documentation says the router does not scrape one (`docs/model-routing.md:38-42`; `runtimes/pi.md:4-17`).
- The full repository test command is `npm test` (`package.json:9-18`), and user-facing changes require a changeset under `.changeset/` per `AGENTS.md`.

## Desired End State

`selectStageModel` accepts optional `availableModels`, rejects explicit empty lists and unavailable economy candidates, and returns only a configured candidate present in the normalized list. Omitted availability preserves current behavior by treating both configured candidates as available. Atomic exposes `available_models`, forwards it, records the normalized list and candidate set, documents the semantics, and includes a patch changeset.

## What We're NOT Doing

- Do not import provider-private registries, scrape catalogs, probe accounts, or add provider SDK dependencies.
- Do not retry with another model after native task execution fails.
- Do not route implementation, fix, reproduction, app, recording, or unknown stages through JEV.
- Do not change runtime installation destinations, worker generation, or unrelated workflow transitions.

## Execution Strategy

Implement the invariant in `models.mjs` first, because every stage selection passes through it. Keep availability optional for compatibility, but distinguish omission from an explicit empty array. Then wire the single workflow input through existing serialized `taskInputs` and `runSkill` forwarding, update documentation, add the user-facing changeset, and run the repository's full checks.

---

## Phase 1: Enforce available candidates in the stage selector

### Goal

The model selector returns only available configured candidates, keeps economy as the default policy, and asks JEV only when reasoning escalation is possible.

### Required Edits:

#### 1.1 Normalize and validate available candidates

**File**: `atomic/lib/models.mjs`

**Changes**: Add a helper that accepts omitted availability as `[model, reasoning]`, validates explicit arrays of non-empty strings, removes duplicates, and throws on an explicit empty list. Add an error for a configured economy model absent from availability. Extend fixed/policy/JEV records with `availableModels` and `candidates` arrays. Validate availability before fixed routing so fixed mode cannot select an unavailable model.

```diff
+function availableModels(value, model, reasoning) {
+  if (value === undefined) return [...new Set([model, reasoning])];
+  if (!Array.isArray(value) || value.length === 0) throw new Error(...);
+  return [...new Set(value.map((candidate) => modelName(candidate)))];
+}
+
+function requireEconomy(model, available) {
+  if (!available.includes(model)) throw new Error(...);
+}
```

#### 1.2 Apply policy and JEV candidate rules

**File**: `atomic/lib/models.mjs`

**Changes**: Derive `reasoningAvailable` from the normalized set. Return policy economy for mutation/unknown phases. For eligible phases, return policy economy without JEV when reasoning is unavailable; otherwise preserve the existing typed `economy|reasoning` request and map the answer to an available configured model. Preserve existing validation, confidence, probabilities, and usage fields.

```diff
-  if (routing === 'fixed') return fixedRecord(model);
-  if (CODE_WRITING_SKILLS.has(skill) || !JEV_ELIGIBLE_SKILLS.has(skill)) return policyRecord(model);
+  const available = normalizeAvailableModels(options.availableModels, model, reasoning);
+  requireEconomy(model, available);
+  if (routing === 'fixed') return fixedRecord(model, available);
+  if (CODE_WRITING_SKILLS.has(skill) || !JEV_ELIGIBLE_SKILLS.has(skill)) return policyRecord(model, available);
+  if (!available.includes(reasoning)) return policyRecord(model, available);
```

#### 1.3 Test selector invariants

**File**: `tests/atomic-model-routing.test.mjs`

**Changes**: Update exact record expectations for the new fields. Add tests for omitted availability compatibility, available economy/reasoning JEV escalation, missing reasoning policy fallback, missing economy failure, explicit empty-list failure, duplicate/invalid candidate validation, fixed-mode availability enforcement, and no JEV call for mutation/unknown stages. Keep existing malformed JEV and service failure cases.

### Success Criteria:

#### Automated Verification:

- [x] `node --test tests/atomic-model-routing.test.mjs` -> 12 passed
- [x] `node --test tests/atomic-controller.test.mjs` -> 13 passed

human-gated: false

---

## Phase 2: Wire delivery input, records, documentation, and release metadata

### Goal

Atomic callers can provide available model identifiers, and the public contract explains economy-first and JEV escalation behavior.

### Required Edits:

#### 2.1 Expose and forward availability

**Files**: `atomic/workflows/delivery.ts`, `atomic/lib/controller.mjs`

**Changes**: Add optional TypeBox `available_models` array of non-empty strings beside existing model inputs. The persisted input snapshot already retains it; pass `inputs.available_models` as `availableModels` in the `selectStageModel` call. Keep the selection tool arguments and durable child inputs serializable.

```diff
+    available_models: Type.Optional(Type.Array(Type.String({ minLength: 1 }))),
```

```diff
-    const choice = await selectStageModel(task.skillsDir, { ..., reasoningModel: inputs.reasoning_model });
+    const choice = await selectStageModel(task.skillsDir, { ..., reasoningModel: inputs.reasoning_model, availableModels: inputs.available_models });
```

#### 2.2 Document the public behavior

**File**: `docs/model-routing.md`

**Changes**: Explain that Luna-fast is the economical default, `available_models` is caller-provided capability information, omission preserves the two configured candidates, explicit lists constrain selection, reasoning absence selects economy without JEV for eligible stages, and missing economy fails before execution. State that this is not provider probing or native execution fallback.

#### 2.3 Add release metadata

**File**: `.changeset/economical-model-routing.md`

**Changes**: Add a patch changeset for `@marktripoli/skills` describing available-model filtering and economy-first JEV escalation. Use the existing changeset frontmatter convention.

### Success Criteria:

#### Automated Verification:

- [x] `npm test` -> 155 passed
- [x] `npm run check-commits -- origin/main..HEAD` -> 10 subjects valid

human-gated: false

## Human Review

### Review targets

- `models.mjs` remains the only owner of candidate validation and selection policy.
- The available-model input is optional for compatibility but explicit empty/missing economy cases fail closed.
- JEV is called only for eligible phases with an available reasoning candidate.
- Documentation, changeset, and tests match the actual record and input shapes.

### Verify

- [ ] `node --test tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs` passes after Phase 1.
- [ ] `npm test` and `npm run check-commits` pass after Phase 2.

### Known limits

- The availability list is supplied by the caller; no provider account probe or registry lookup is performed.
- Native provider rejection after selection remains outside this change.
