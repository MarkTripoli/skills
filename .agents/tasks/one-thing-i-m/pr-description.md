Task: `one-thing-i-m`

## Purpose

Route portable skill phases through one shared JEV helper across Claude Code, Codex, Oh My Pi, Pi, portable installs, and Atomic. Economy remains the default for implementation and unknown phases; eligible phases choose the cheapest adequate exact candidate.

## What changed

- Added `skills/delivery/route-model/route-model.mjs` and the `route-model` skill with a Node import and JSON-stdin contract.
- Validated exact `{model,cost,description}` candidates and rejected duplicates, invalid costs, empty lists, and missing economy candidates.
- Made Atomic adapt its existing inputs to the shared helper instead of owning separate routing policy.
- Limited native catalog discovery to documented stable Pi and Oh My Pi commands. Claude Code and Codex use explicit caller/configured candidates.
- Added one candidate-profile convention: explicit candidates, `SKILLS_MODEL_CANDIDATES_FILE`, then project `.agents/model-candidates.json`; manual delivery and Herdr next-phase handoffs use it automatically.
- Integrated Herdr instructions for native `-- --model` enforcement and recommendation-only manual handoffs.
- Added focused portable and Atomic coverage, docs, runtime guidance, and a patch changeset.

## Boundaries

The repository does not copy an external router, add proxy interception, scrape provider-private registries, probe account access, or fall back after native provider rejection. Candidate order defines capability from weakest to strongest; costs and availability are caller-owned, and credentials remain outside artifacts.

## Verification

- `npm test`
- `npm run check-commits -- origin/main..HEAD`
- `node --test tests/route-model.test.mjs tests/atomic-model-routing.test.mjs tests/atomic-controller.test.mjs`
