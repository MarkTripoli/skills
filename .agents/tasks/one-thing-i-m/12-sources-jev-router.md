---
type: sources
summary: "Two Jev router repositories were gathered at their 2026-09-19 heads. The gargpratyush repository documents cross-harness CLI wrappers, native model-catalog discovery, per-turn routing, and fail-open policy; the rajdhakad9826 repository documents a provider-neutral library API that combines Jev probabilities with caller-supplied model costs. Later phases can use the quoted contracts and differences without fetching either repository again."
gathered: 2026-09-20
status: complete
---

# Sources

## Purpose

Capture reusable cross-harness model-routing patterns from the two repositories the user named for extending this branch beyond Atomic.

## Sources

### gargpratyush/jev-router

- Location: https://github.com/gargpratyush/jev-router
- Kind: repository
- Authority: repository maintainer; first-party
- Version or date: commit `38da6b84ea01241bfc41fbddc0928d0f40a703f0`, 2026-09-19
- Fetched: shallow `git clone` on 2026-09-20

#### Digest

The repository supplies `jev-claude` and `jev-codex` wrappers that launch the upstream command-line interfaces, preserve their authentication and interfaces, and route each fresh user turn. It represents routing through fast, balanced, strong, and long tiers, but sends Jev the exact native model catalog exposed by the signed-in account. A policy layer applies explicit user overrides, confidence limits, context-sensitive downgrade protection, availability clamping, and an opt-in long tier.

Claude Code uses a loopback proxy selected through `ANTHROPIC_BASE_URL`; Codex uses a temporary custom provider. Concrete user-selected models bypass routing. Tool-loop continuations retain the model chosen at the start of the turn. Failures keep the current model rather than block the request, and routing exchanges are stored temporarily for explanation.

#### Excerpts

> Automatic per-turn model routing for Claude Code and OpenAI Codex. Jev sends simple work to the fast tier and difficult work to the strong tier, while preserving each CLI's native interface, tools, sessions, permissions, and authentication.

`README.md`, opening paragraph.

> Both commands launch the real upstream CLI. Jev only chooses the model for a fresh user turn.

`README.md`, command table introduction.

> explicit requests such as `use opus`, `use luna`, or `use strong` win;
> failure, timeout, or an unrecognised Jev answer keeps the current model;
> low confidence never downgrades and caps upgrades at the balanced tier;
> large conversations refuse downgrades that would waste more prompt-cache work than they save;
> unavailable tiers step upward rather than silently choosing a weaker model;
> the long tier is disabled unless `JEV_ALLOW_FABLE=1`.

`README.md`, “Routing policy”.

> Both launchers send Jev the exact models in the signed-in account's native catalog, so model versions such as `claude-opus-4-8` and `claude-opus-5` remain separate choices. Static model ids are used only until the CLI fetches its catalog.

`README.md`, “Configuration”.

> The routing call happens only for the first request of a user turn. Tool-loop continuations reuse the pinned tier, avoiding repeated routing latency and model changes mid-task. A concrete model chosen in Claude Code bypasses routing until the user selects **Jev Router** again.

`docs/jev-claude-architecture.md`, closing paragraph.

> Turns a Jev answer into the model we will actually run. Pure and total: any missing, malformed, or unavailable input falls back to the model already in use.

`src/policy.mjs`, `decide` documentation.

> Pick the cheapest exact model that can fully complete this coding request in one pass, without retrying on a stronger model.

`src/config.mjs`, `questionForModels` instructions.

### rajdhakad9826/jev-router

- Location: https://github.com/rajdhakad9826/jev-router
- Kind: repository
- Authority: repository maintainer; first-party
- Version or date: commit `9c332db56da87a559a1e18d0331c8fcb303b40fd`, 2026-09-19
- Fetched: shallow `git clone` on 2026-09-20

#### Digest

The repository publishes a TypeScript `Router` library. Callers provide two to ten models ordered from weakest to strongest, with a name, cost, and capability description. Jev returns a probability distribution over required capability tiers; the router combines that distribution with normalized model cost and a quadratic under-provision penalty, then selects the model with the lowest expected loss.

The public result contains the selected model name, tier index, and Jev probabilities. The current version fixes the under-provision penalty at one and throws when Jev fails rather than providing a built-in fallback.

#### Excerpts

> jev-router selects an LLM based on the expected capability required by a query while considering model cost.

`README.md`, opening sentence.

> interface ModelConfig {
>     name: string;         // model identifier, e.g. "claude-opus"
>     cost: number;         // any consistent unit; normalized internally
>     description: string;  // capability description sent to Jev
> }

`README.md`, “API”.

> The router selects the model with the **lowest expected loss**.
>
> This means Jev's highest-probability tier isn't always selected.

`README.md`, “How routing works”.

> * No built-in fallback — route() throws if the Jev call fails.

`README.md`, “Current limitations”.

> const probabilities = await this.classifier.classify(query, this.models);
> const expectedLosses = calculateExpectedLoss(probabilities, this.lossMatrix)
> let bestModelIndex = selectBestTier(expectedLosses)

`src/router.ts`, `Router.route`.

> if (models.length < 2)
>     throw new Error("Router requires at least 2 models");
>
> if (models.length > 10)
>     throw new Error("Router supports at most 10 models (Jev's Score primitive limit)");

`src/router.ts`, `Router.validateModels`.

## Conflicts

- Failure behavior differs. `gargpratyush/jev-router` states, “failure, timeout, or an unrecognised Jev answer keeps the current model” (`README.md`, “Routing policy”). `rajdhakad9826/jev-router` states, “No built-in fallback — route() throws if the Jev call fails” (`README.md`, “Current limitations”).
- Selection policy differs. `gargpratyush/jev-router` asks Jev to “Pick the cheapest exact model that can fully complete this coding request in one pass” (`src/config.mjs`, `questionForModels`). `rajdhakad9826/jev-router` says the selected model has the lowest expected loss and “Jev's highest-probability tier isn't always selected” (`README.md`, “How routing works”).

## Unreachable

None.

### Known limits

- Both repositories were fetched as shallow clones at their 2026-09-19 heads; later upstream changes are not represented.
- The source digest records repository claims and code contracts but does not establish compatibility with this repository's supported harness versions.
