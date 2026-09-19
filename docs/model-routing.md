# Model routing

Atomic delivery keeps phase selection separate from stage-model selection. `workflow=auto` asks JEV which eligible phase to run; stage-model routing separately asks the installed typed-judgment helper whether an eligible non-code phase can use the ordinary model or needs the stronger reasoning model.

## Two configured models

The ordinary `model` defaults to `openai-codex/gpt-5.6-luna-fast`. It is the economical baseline and is mandatory for every code-writing and unknown phase. The stronger `reasoning_model` defaults to `openai-codex/gpt-5.6-sol`; JEV may select it only for an allowed non-code phase. This is a preference between these two explicitly configured, live-verified providers; actual account billing and subscription pricing are not observable, so the policy makes no numeric price claim.

Code-writing stages always use `model`, including `implement-task`, `implement-plan`, `implement-outline`, `agent-implementer`, `iterate-implementation`, `fix-bug`, `fix-code-review`, and `resolve-pr-reviews`. Unknown or ambiguous stages also use `model`. `reproduce-bug`, `test-app`, and `record-evidence` remain on `model` because they can write reproduction, driver, or recording scripts. Explicit `model` and `reasoning_model` values are respected where the policy permits them.

Known research, planning, documentation, verification, and review phases may ask JEV to choose `economy` (the ordinary `model`) or `reasoning` (the configured `reasoning_model`) from the exact request and supplied artifact summaries. A valid candidate choice is used without an arbitrary confidence threshold, so moderate confidence is not rejected. The routing record retains the selected model, source, confidence, full probabilities, and helper usage when available.

## Inputs and overrides

The delivery workflow exposes these inputs:

```text
model=openai-codex/gpt-5.6-luna-fast
model_routing=auto|fixed
reasoning_model=openai-codex/gpt-5.6-sol
```

`model_routing=auto` is the default and allows the stage-model judgment for eligible phases. `model_routing=fixed` selects `model` directly for every phase and does not load or call JEV for stage-model selection. In `auto`, a missing helper, unavailable service, or malformed judgment fails visibly; Atomic never silently upgrades to another provider or falls back to an unrecorded model.

## Evidence and authenticated models

Each selection is recorded with the stage decision under `.agents/tasks/<slug>/.atomic-delivery/<run-id>/` alongside the other delivery records. Stage execution still validates provider availability. A catalog listing is not proof that a model is usable with the current provider or account: a previously listed Spark candidate failed live native use for Codex with a ChatGPT account, so it is not a default or fallback here. Authentication and availability remain Atomic and stage-execution concerns.

The router does not import a provider registry, private SDK internals, or scrape a catalog. It uses only the two configured defaults unless a caller explicitly supplies another model value. The published 0.9.19 main SDK model-registry export is broken in isolated direct import because dependencies are missing.

## Phase selection with JEV

`workflow=auto` selects the next phase at artifact boundaries using the existing `typed-judgment/judge.mjs` helper (`systemOne`/`ask`). The execution model performs the phase; typed judgment does not write its artifact or implement code.

The helper reads credentials in this order:

1. `TYPESAFE_API_KEY`.
2. The file named by `TYPESAFE_API_KEY_FILE`.
3. `~/.config/typesafe/api_key`.

See [typed-judgment](../skills/delivery/typed-judgment/SKILL.md) for submitted state, timeout/retry controls, probabilities, and evidence recording. Do not put credentials in task artifacts or workflow inputs.
