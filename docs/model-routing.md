# Model routing

Atomic chooses both the next step and the model that runs it. These settings are separate:

- `workflow=auto`: JEV chooses the next step.
- `model_routing=auto`: JEV may choose the model for an allowed step.

JEV is a TypeSafe service that makes these choices; it does not write code or task documents. To avoid JEV routing, choose an explicit workflow and `model_routing=fixed`.

## Two configured models

- `model` defaults to `openai-codex/gpt-5.6-luna-fast`. Code-writing and unknown steps always use it.
- `reasoning_model` defaults to `openai-codex/gpt-5.6-sol`. JEV may choose it only for an allowed non-code phase.

Both defaults have been exercised live. This policy makes no price claim because it cannot see account billing.

These phases always use `model`: `implement-task`, `implement-plan`, `implement-outline`, `agent-implementer`, `iterate-implementation`, `fix-bug`, `fix-code-review`, and `resolve-pr-reviews`. Unknown or ambiguous phases also use `model`. `reproduce-bug`, `test-app`, and `record-evidence` stay on `model` because they can write reproduction, driver, or recording scripts. Explicit model values are respected where the policy allows them.

Known research, planning, documentation, verification, and review phases may ask JEV to choose:

- `economy`: the configured `model`;
- `reasoning`: the configured `reasoning_model`.

JEV receives the request and saved document summaries. Any valid choice is accepted, without a confidence cutoff. The record keeps the model, source, confidence, probabilities, and helper usage when available.

## Inputs and overrides

The delivery workflow exposes:

```text
model=openai-codex/gpt-5.6-luna-fast
model_routing=auto|fixed
reasoning_model=openai-codex/gpt-5.6-sol
available_models=[...]
```

`model_routing=auto` is the default. It allows stage-model judgment for eligible phases. `model_routing=fixed` selects `model` for every phase and does not load or call JEV for model selection, but the selected model still must be listed as available. When `available_models` is omitted, the configured `model` and `reasoning_model` are treated as available for backward compatibility. An explicit list is caller-provided capability information for the active runtime or account; it is not discovered or verified by this repository.

The economical `model` must be available for every stage. If it is absent, routing fails before the task starts. Mutation, tool-oriented, and unknown phases always use that economical candidate. Eligible non-code phases call JEV only when the reasoning candidate is also available; otherwise they use the economical candidate by policy. A missing JEV helper, unavailable service, or malformed judgment still fails visibly when an escalation decision is possible. Atomic never silently changes provider, falls back after native execution failure, or uses an unrecorded model.

## Evidence and authenticated models

Each selection is recorded with the stage decision under `.agents/tasks/<slug>/.atomic-delivery/<run-id>/`. Stage execution still checks provider availability. A catalog entry is not proof that the current provider or account can use a model: a previously listed Spark candidate failed live native use for Codex with a ChatGPT account, so it is neither a default nor a fallback.

The router imports no provider registry or private SDK internals and does not scrape a catalog. It uses the two defaults unless a caller supplies another value. The published 0.9.19 main SDK model-registry export is broken in isolated direct import because dependencies are missing.

## Phase selection with JEV

`workflow=auto` selects the next phase at artifact boundaries through `skills/delivery/typed-judgment/judge.mjs` (`systemOne`/`ask`). The execution model performs the phase.

The helper looks for credentials in this order:

1. `TYPESAFE_API_KEY`.
2. The file named by `TYPESAFE_API_KEY_FILE`.
3. `~/.config/typesafe/api_key`, or `$XDG_CONFIG_HOME/typesafe/api_key` when `XDG_CONFIG_HOME` is set.

See [typed-judgment](../skills/delivery/typed-judgment/SKILL.md) for submitted state, timeout and retry controls, probabilities, and evidence recording. Keep credentials out of task artifacts and workflow inputs.