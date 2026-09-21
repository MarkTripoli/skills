---
date: 2026-09-20T00:00:00Z
git_commit: e67c3ba
branch: one-thing-i-m
repository: skills
topic: "Model defaults, JEV escalation, and available-model selection"
type: research
summary: "The delivery controller already separates an economical model from a reasoning model and routes eligible non-code phases through JEV, while code-writing and unknown stages use the ordinary model. Model availability is not represented as a catalog or capability check: the router accepts caller-supplied strings and documentation explicitly says it does not inspect provider registries. The later design phase needs to preserve fail-closed JEV behavior and add availability-aware selection without weakening economical defaults."
tags: [research, codebase]
status: complete
---

# Research: Model defaults, JEV escalation, and available-model selection

**Date**: 2026-09-20T00:00:00Z
**Git Commit**: e67c3ba
**Branch**: one-thing-i-m
**Repository**: skills

## Research Question

1. How does this repository represent model names, provider capabilities, and availability across runtime installation, model routing, and skill execution?
2. How do delivery workflows and runtime adapters choose models for planning, implementation, verification, review, and tool-oriented work, and where are defaults enforced?
3. What tests, fixtures, documentation, and configuration currently define model selection behavior, including JEV or TypeSafe integration and fallback behavior?

## Research Methodology

This document records current behavior only. It does not recommend implementation work, refactors, optimizations, or future changes.

The pass examined `atomic/lib/models.mjs`, `atomic/lib/controller.mjs`, `atomic/workflows/delivery.ts`, the four runtime adapters, installer/build code, model-routing documentation, and model-routing/controller/JEV tests. Pi has no worker tool, so the worker roles were performed inline as required by `runtimes/pi.md:4-4`. JEV was available for the research-question neutrality and routing checks; no external model-provider catalog was fetched because the repository's current behavior is local policy over caller-supplied model identifiers.

### Known limits

- No provider-specific SDK or account capability endpoint is configured in this repository, so current account-level availability could not be observed.
- Child-worker dispatch was unavailable in this Pi session; direct repository inspection was used instead.
- JEV coverage and citation checks were performed by direct evidence review because the research artifact was assembled inline and the helper's inputs would have duplicated the cited source material.

## Summary

The current implementation has two model slots: `model`, defaulting to `openai-codex/gpt-5.6-luna-fast`, and `reasoning_model`, defaulting to `openai-codex/gpt-5.6-sol` (`atomic/lib/models.mjs:4-5`; `atomic/workflows/delivery.ts:20-22`). JEV chooses between those slots only for an allowlist of research, design, planning, verification, review, and documentation skills; mutation, tool-oriented, and unknown stages stay on the ordinary model (`atomic/lib/models.mjs:9-40,110-112`).

The selection boundary does not discover available models. It validates non-empty strings, asks JEV for `economy` or `reasoning`, and passes the chosen string to the native task runner (`atomic/lib/models.mjs:43-45,100-155`; `atomic/lib/controller.mjs:215-230`). The repository documentation explicitly says the router does not import a provider registry or scrape a catalog, and that a catalog entry is not proof of account availability (`docs/model-routing.md:38-42`).

## Detailed Findings

### 1. Delivery inputs carry two model identifiers and a separate routing mode

The delivery workflow exposes `model`, `model_routing`, and `reasoning_model` as independent inputs. The ordinary model is described as mandatory for code-writing and unknown phases; the reasoning model is available to JEV for allowed non-code phases (`atomic/workflows/delivery.ts:14-28`). `model_routing=fixed` bypasses JEV model selection, while the default `auto` allows stage routing (`atomic/lib/models.mjs:103-112`; `docs/model-routing.md:26-36`).

The controller forwards the task request, artifact summaries, and all three routing inputs to the stage selector before starting each fresh skill task (`atomic/lib/controller.mjs:215-230`). The selected model is then passed directly to `ctx.task` and both the selection record and task result retain model metadata (`atomic/lib/controller.mjs:222-251`).

#### Testing patterns

`tests/atomic-model-routing.test.mjs:70-123` covers fixed routing, JEV service failure, policy routing for writing/unknown stages, economy selection, reasoning selection, confidence bounds, and usage retention. `tests/atomic-controller.test.mjs:147-158` covers forwarding a selected model into a native task context. No test covers a provider/account availability probe because no such probe exists.

### 2. JEV escalation is allowlisted and fail-closed

`atomic/lib/models.mjs:9-40` defines the eligible skills and the code-writing skills. In auto mode, code-writing and unlisted skills return a `policy` record using the ordinary model without loading JEV (`atomic/lib/models.mjs:110-112`). Eligible skills load `typed-judgment/judge.mjs`, request a typed `economy` or `reasoning` choice, validate the choice, confidence, and a probability map, then map the choice to the configured model string (`atomic/lib/models.mjs:112-155`).

Unavailable JEV is an error rather than a silent fallback for eligible phases (`atomic/lib/models.mjs:49-51,116-122`; `tests/atomic-model-routing.test.mjs:70-79`). The workflow's separate next-phase judgment also fails when JEV cannot load or returns an invalid answer (`atomic/lib/controller.mjs:45-62`). The JEV helper itself records model and token usage on answered calls (`skills/delivery/typed-judgment/SKILL.md:48-66`; `tests/judge.test.mjs:147-177`).

#### Testing patterns

The model-routing fixture creates an isolated `typed-judgment/judge.mjs` and captures the state and questions sent to `systemOne` (`tests/atomic-model-routing.test.mjs:8-20`). Tests reject malformed response envelopes and probability maps (`tests/atomic-model-routing.test.mjs:23-68`), and verify that code/unknown stages do not call JEV (`tests/atomic-model-routing.test.mjs:81-92`).

### 3. Model availability is a caller-supplied string, not a discovered capability

`modelName` accepts any non-empty string and applies only a default when the value is absent (`atomic/lib/models.mjs:43-47`). Neither `models.mjs` nor the workflow imports a provider registry, queries an account, or probes a model before starting the stage. The native task receives the selected string as-is (`atomic/lib/controller.mjs:227-230`).

The documentation records this boundary directly: the router uses two defaults, does not import provider registry/private SDK internals or scrape a catalog, and distinguishes a catalog entry from authenticated account availability (`docs/model-routing.md:38-42`). Runtime adapters only explain how skills and workers are installed. They do not define model names or capabilities (`runtimes/claude-code.md:1-17`; `runtimes/codex.md:1-19`; `runtimes/oh-my-pi.md:1-17`; `runtimes/pi.md:1-17`).

#### Testing patterns

`tests/atomic-model-routing.test.mjs:94-123` proves explicit caller model strings are preserved in both economy and reasoning outcomes. `tests/install.test.mjs:88-145` tests runtime/config installation and does not test provider model discovery. No availability contract, model catalog fixture, or capability probe test was found.

### 4. Workflow phase selection and stage-model selection are separate decisions

At each delivery boundary, `eligible` computes the allowed next skills from artifacts and proof state (`atomic/lib/controller.mjs:65-132`). Adaptive workflow mode asks JEV to choose among those candidates (`atomic/lib/controller.mjs:114-128`), while explicit workflow mode selects the first eligible skill. After a skill is selected, `runSkill` performs a second, independent model-selection call for the stage (`atomic/lib/controller.mjs:215-230`).

This separation is documented for users: `workflow=auto` chooses the next step and `model_routing=auto` may choose a model for an allowed step (`docs/model-routing.md:3-8`). It means a future availability-aware model selection change belongs at the stage selection boundary, while workflow routing remains a separate JEV decision.

#### Testing patterns

`tests/atomic-controller.test.mjs` covers controller transitions, proof invalidation, and selected-model forwarding. `tests/judge.test.mjs:147-177` covers typed-judgment transport and retry behavior. The tests do not exercise a full live delivery run against a real provider.

## Code References

### Stage model policy and execution

- `atomic/lib/models.mjs:4-155` - exhaustive model defaults, eligibility sets, JEV choice validation, and selection records for the researched boundary.
- `atomic/lib/controller.mjs:215-253` - stage prompt, model selection, native task invocation, observation, and model metadata persistence.
- `atomic/workflows/delivery.ts:14-28` - workflow inputs that expose model routing.

### Runtime and installation boundary

- `runtimes/claude-code.md:1-17` - Claude Code skill/worker installation and Atomic notes.
- `runtimes/codex.md:1-19` - Codex skill/worker installation and Atomic notes.
- `runtimes/oh-my-pi.md:1-17` - Oh My Pi skill/worker installation and Atomic notes.
- `runtimes/pi.md:1-17` - Pi's inline-worker limitation and installation behavior.
- `scripts/lib/build.mjs:1-90` - runtime tree generation and worker format selection.
- `scripts/install.mjs:88-145` - skill catalog selection; this is not a provider model catalog.

### Documentation and tests

- `docs/model-routing.md:1-54` - public model-routing policy and availability boundary.
- `tests/atomic-model-routing.test.mjs:8-123` - isolated model-router contract tests.
- `tests/atomic-controller.test.mjs:147-158` - controller model forwarding test.
- `tests/judge.test.mjs:147-177` - JEV availability, retry, and usage tests.

## Architecture Documentation

```text
workflow inputs
  ├─ model + reasoning_model + model_routing
  └─ workflow + artifact state
       ├─ controller.eligible -> next phase candidates -> JEV phase choice (adaptive only)
       └─ controller.runSkill -> models.selectStageModel
            ├─ policy: ordinary model for mutation/tool/unknown skills
            └─ JEV: economy|reasoning -> configured model string
                 -> ctx.task({ model })
```

The current system has no model catalog or capability abstraction between `selectStageModel` and `ctx.task`. Installation discovers skill resources only, and runtime adapters do not add provider metadata. JEV's current role is escalation between two configured identifiers, not discovery or verification of which identifiers the active provider/account can execute.

## Open Questions

None.
