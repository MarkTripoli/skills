---
name: route-model
description: Choose the cheapest adequate model from exact caller-supplied candidates through a portable Node and JEV contract.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Route model

Use `/route-model` when a harness needs a model recommendation for the next phase. It returns a recommendation; it does not start an agent, proxy requests, discover private catalogs, or force a model in a harness that lacks a model flag.

## Accepted input

Provide a JSON request through the Node helper or stdin with:

- `phase`: next skill or phase name. Unknown names keep the economy candidate.
- `request`: the bounded user/task request string.
- `artifacts`: optional summaries safe to send to JEV.
- `economy`: exact native model identifier that must be among the candidates.
- `routing`: `auto` or `fixed`; `fixed` returns economy without JEV.
- `candidates`: non-empty exact array ordered from weakest to strongest. Each item is `{model, cost, description}`. Model identifiers are unique, `cost` is finite and non-negative, costs are non-decreasing, and `description` explains the candidate's capability.

```js
import { routeModel } from '<skills-dir>/route-model/route-model.mjs';
const result = await routeModel('<skills-dir>', {
  phase: 'create-plan', request, artifacts: [], economy: 'provider/economy', routing: 'auto',
  candidates: [
    { model: 'provider/economy', cost: 1, description: 'ordinary planning' },
    { model: 'provider/reasoning', cost: 4, description: 'complex architectural reasoning' }
  ]
});
console.log(result.model);
```

The same request can be sent as one JSON object on stdin:

```sh
printf '%s\n' '<request JSON>' | node <skills-dir>/route-model/route-model.mjs
```

## Exact output and reporting

The JSON result always contains `model`, `source` (`policy`, `fixed`, or `jev`), `candidates`, `availableCandidates`, `confidence`, and `probabilities`. A JEV result also contains `expectedLosses`, `requestedModel`, and helper `usage` when available. The selected `model` is one exact supplied identifier. Errors are written to stderr and return a nonzero exit code. Credentials are read only by `typed-judgment/judge.mjs` from its environment or key file.

Mutation, implementation, tool-oriented, and unknown phases select `economy` without JEV. Eligible phases ask JEV to distinguish the described candidates, combine adequacy probabilities with cost and under-provision loss, and select the lowest expected loss. A harness that cannot enforce a model reports `Recommendation only: <model>; start the next session with that model if desired.` rather than claiming enforcement. Herdr can enforce a configured recommendation by passing it after the native command separator: `herdr agent start ... -- --model <model>`.

Pi and Oh My Pi may use a stable public catalog command documented by their runtime; Claude Code and Codex require caller or configuration candidates. Never scrape provider-private registries or add a proxy.
