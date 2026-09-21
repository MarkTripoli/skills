# Model routing

Run `/configure-model-routing` when a project or user-level candidate profile is missing or needs replacement. It asks one setup question at a time, writes the shared profile, and verifies it through the helper.

`skills/delivery/route-model/route-model.mjs` is the shared model-selection owner for Claude Code, Codex, Oh My Pi, Pi, portable skill installs, and Atomic. It accepts exact caller-supplied candidates and returns one native model identifier; it does not proxy requests, scrape provider-private registries, probe accounts, or fall back after native execution failure.

## Machine-readable contract

Node callers pass:

```js
const result = await routeModel(skillsDir, {
  phase: 'create-plan',
  request: 'Plan the change',
  artifacts: [],
  economy: 'provider/economy',
  routing: 'auto',
  candidates: [
    { model: 'provider/economy', cost: 1, description: 'ordinary work' },
    { model: 'provider/reasoning', cost: 4, description: 'difficult reasoning' }
  ]
});
```

The equivalent JSON-over-stdin command is:

```sh
printf '%s\n' '<request JSON>' | node <skills-dir>/route-model/route-model.mjs
```

Candidate configuration precedence is explicit `--candidates <json-file>` and `--economy <model>`, then `SKILLS_MODEL_CANDIDATES_FILE`, then `<project>/.agents/model-candidates.json`. Use `/configure-model-routing` to create either supported file. The profile shape is:

```json
{"economy":"provider/economy","candidates":[{"model":"provider/economy","cost":1,"description":"ordinary work"}],"routing":"auto"}
```

Candidates are ordered weakest to strongest; costs are independent and may vary in either direction. Without a profile, routing preserves the economy behavior and reports that no profile was used, so a manual handoff enforces no model. The Herdr Stop hook uses the same precedence, requires successful routing when a profile exists, and launches no pane on malformed profiles or routing errors.

`candidates` must be a non-empty array of unique objects with an exact native `model` string, a finite non-negative caller-supplied `cost`, and a non-empty capability `description`. `economy` must identify one candidate. The response includes `model`, `source`, `candidates`, `availableCandidates`, `confidence`, and `probabilities`; JEV responses also include expected losses and helper usage. Credentials are read only by the typed-judgment helper and are never placed in request or response artifacts.

## Policy

Implementation, mutation, tool-oriented, and unknown phases always use `economy` without JEV. Eligible non-mutating phases use JEV only when more than one candidate is supplied. The helper combines JEV adequacy probabilities with normalized candidate cost and an under-provision penalty, selecting the candidate with the lowest expected loss. A standalone portable call falls back to `economy` with `source: "fallback"` and a `reason` when the sibling typed-judgment helper or JEV service is unavailable. Atomic passes `requireJev` and fails closed instead of falling back.

Atomic adapts its existing `model`, `reasoning_model`, and `available_models` inputs into this contract. Omitted availability preserves the Luna-fast economy and Sol escalation compatibility path. Explicit candidate objects are preferred for portable callers because they carry the cost and capability data required for multi-model routing.

## Candidate discovery

Pi may discover exact candidates with `pi --list-models`, and Oh My Pi may discover them with `omp models --json`, only when those documented public commands are available. Missing or failed discovery falls back to explicit input. Claude Code and Codex require explicit caller or configuration candidates; this repository does not scrape provider-private catalogs or import provider SDK internals. A candidate list is caller-owned capability information, not proof that the current account will accept the model.

Herdr handoffs pass a selected model after the native argument separator, as `herdr agent start ... -- --model <model>`, when candidates are configured and the native command supports enforcement. Manual handoffs print `Recommendation only: <model>` because a standalone skill cannot force the next session's model.

## Defaults

The economical default is `openai-codex/gpt-5.6-luna-fast`. Atomic's reasoning compatibility default is `openai-codex/gpt-5.6-sol`. These are policy defaults, not billing or quality claims. Use `routing: fixed` to select the economy candidate without JEV.
