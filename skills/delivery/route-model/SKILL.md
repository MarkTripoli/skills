---
name: route-model
description: Picks the cheapest adequate model for the next phase from exact caller-supplied candidates and returns a recommendation as JSON. Use when a harness or /deliver needs a model for a phase, or when the user runs /route-model; run /configure-model-routing first when no candidate profile exists.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Route model

Use `/configure-model-routing` when no valid candidate profile exists; Codex users invoke `$configure-model-routing`. Use `/route-model` when a harness needs a model recommendation for the next phase. It returns a recommendation; it does not start an agent, proxy requests, discover private catalogs, or force a model in a harness that lacks a model flag.

## Accepted input

The request is a JSON object with:

- `phase`: next skill or phase name. Unknown names keep the economy candidate.
- `request`: the bounded user/task request string.
- `artifacts`: optional summaries safe to send to JEV.
- `economy`: exact native model identifier that must be among the candidates.
- `routing`: `auto` or `fixed`; `fixed` returns economy without JEV.
- `candidates`: non-empty exact array ordered from weakest to strongest. Each item is `{model, cost, description}`. Model identifiers are unique, `cost` is finite and non-negative, and `description` explains the candidate's capability. Costs may vary independently of capability order.
- Candidate configuration precedence is explicit `--candidates` or `candidates` input, then `SKILLS_MODEL_CANDIDATES_FILE`, then `<project>/.agents/model-candidates.json`. A profile contains `{ "economy": "exact/model", "candidates": [{"model":"exact/model","cost":1,"description":"capability"}], "routing":"auto" }`; `routing` is optional.

Send the request as one JSON object on stdin:

```sh
printf '%s\n' '<request JSON>' | node <skills-dir>/route-model/route-model.mjs
```

Flags: `--candidates <file>` explicit profile; `--economy <model>` overrides the profile's economy; `--project-only` ignores `SKILLS_MODEL_CANDIDATES_FILE`; `--require-jev` fails instead of falling back.

## Exact output and reporting

The JSON result always contains `model`, `source` (`policy`, `fixed`, `jev`, or `fallback` with a `reason`), `profileSource` (`explicit`, `env`, `project`, or `none`), `candidates`, `availableCandidates`, `confidence`, and `probabilities`. A JEV result also contains `expectedLosses`, `requestedModel`, and helper `usage` when available. The selected `model` is one exact supplied identifier, or `null` without a profile. Errors are written to stderr and return a nonzero exit code. Credentials are read only by `typed-judgment/judge.mjs` from its environment or key file.

Mutation, implementation, tool-oriented, and unknown phases select `economy` without JEV. Eligible phases ask JEV to distinguish the described candidates, combine adequacy probabilities with cost and under-provision loss, and select the lowest expected loss. If the sibling helper or JEV service is unavailable, standalone use returns economy with `source: "fallback"` and a reason. A harness that cannot enforce a model reports `Recommendation only: <model>; start the next session with that model if desired.` rather than claiming enforcement.

Without a profile, the helper returns `model: null` with `profileSource: "none"`: no model is recommended and none is enforced. `/configure-model-routing` creates and verifies project or `SKILLS_MODEL_CANDIDATES_FILE` profiles.
