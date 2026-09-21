---
name: route-model
description: Choose the cheapest adequate model from exact caller-supplied candidates through a portable Node and JEV contract.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Route model

Use the portable helper when a harness needs a model recommendation. It is policy, not a proxy, provider registry, account probe, or native execution fallback.

## Node contract

```js
import { routeModel } from '<skills-dir>/route-model/route-model.mjs';
const result = await routeModel('<skills-dir>', {
  phase: 'create-plan', request, artifacts,
  economy: 'provider/economy', routing: 'auto',
  candidates: [
    { model: 'provider/economy', cost: 1, description: 'ordinary work' },
    { model: 'provider/reasoning', cost: 4, description: 'difficult reasoning' }
  ]
});
```

`candidates` is an exact non-empty array. Each object has a unique native `model` identifier, a finite non-negative caller-supplied `cost`, and a capability `description`. The `economy` identifier must be present. The result contains `model`, `source`, `candidates`, `availableCandidates`, `confidence`, and `probabilities`; JEV results also contain expected losses and usage when supplied. Credentials are read only by `typed-judgment/judge.mjs` from its environment or key file.

The same contract is available without importing JavaScript:

```sh
printf '%s\n' '{"skillsDir":"/path/to/skills","phase":"create-plan","economy":"provider/economy","candidates":[{"model":"provider/economy","cost":1,"description":"ordinary"}]}' \
  | node /path/to/skills/route-model/route-model.mjs
```

Mutation, implementation, tool-oriented, and unknown phases select `economy` without JEV. Eligible phases use JEV only when more than one exact candidate is supplied; the helper combines adequacy probabilities with normalized cost and an under-provision penalty, then chooses the lowest expected loss. JEV errors are visible and fail closed when a judgment is required.

Harnesses may pass candidates explicitly. Pi and Oh My Pi may use a stable public catalog command documented by their runtime; Claude Code and Codex must use caller or configuration candidates. Never scrape provider-private registries or add a proxy.
