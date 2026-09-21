---
task: one-thing-i-m
type: plan
summary: "Implement one portable route-model helper and make Atomic consume it. Add exact candidate validation, JEV expected-loss routing with economy and unknown-phase policy, a Node JSON CLI contract, harness documentation and Herdr model handoffs, focused tests, a changeset, and the updated PR description. Do not add provider proxies or private catalog scraping."
repo: skills
branch: one-thing-i-m
sha: 130b0b1
---

# Portable JEV model routing implementation plan

## Goal

Make model routing useful. Add the model-invoked `/configure-model-routing` setup path so every harness can create and verify the shared profile without storing credentials. in standalone Claude Code, Codex, Oh My Pi, and Pi skills while keeping one policy owner. Atomic must call that owner rather than retain its current two-choice implementation.

## Phase 1: Portable helper and contract

0. Add `skills/delivery/configure-model-routing/SKILL.md`. Ask one setup question at a time; support project `.agents/model-candidates.json` and user files named by `SKILLS_MODEL_CANDIDATES_FILE`; use only `pi --list-models` and `omp models --json` where available; fall back to explicit IDs; write no credentials; verify the saved profile through `route-model`.

1. Add `skills/delivery/route-model/route-model.mjs`.
   - Export `routeModel(skillsDir, options)` and constants for economy/unknown policy.
   - Validate `phase`, `routing`, `economy`, and exact candidate objects `{model,cost,description}`. Reject duplicates, empty explicit lists, invalid costs, and an economy model absent from candidates.
   - For mutation, implementation, tool, and unknown phases return economy with `source: policy` and no JEV call.
   - For eligible phases with one candidate return it by policy; with multiple candidates load `typed-judgment/judge.mjs`, ask a choice keyed by exact model IDs, validate probabilities, and select the lowest expected loss using cost plus an under-provision penalty. Record candidates, probabilities, confidence, and helper usage without secrets.
   - Export a stdin JSON CLI with documented request and response schemas. CLI errors go to stderr and exit nonzero.
2. Add `tests/route-model.test.mjs` using temporary judge helpers. Cover validation, policy phases, cheapest adequate choice, exact model IDs, malformed answers, unavailable JEV, fixed mode, and CLI JSON round-trip.

## Phase 2: Atomic integration

1. Refactor `atomic/lib/models.mjs` to adapt existing `model`, `reasoningModel`, and optional `availableModels` into portable candidate objects, then delegate to `routeModel`. Preserve omitted-input compatibility and current Luna/Sol defaults. Keep selection records compatible where practical, adding portable fields rather than a second policy.
2. Keep `atomic/lib/controller.mjs` forwarding the existing inputs, including exact candidate configuration. Update workflow input descriptions and `skills/delivery/deliver/SKILL.md` with the portable contract and supported harness rules.
3. Update Atomic model tests and controller tests for delegation, economy defaults, available candidates, and records.

## Phase 3: Runtime and Herdr handoffs

1. Update `runtimes/pi.md` and `runtimes/oh-my-pi.md` to describe native public catalog discovery only when the runtime command is stable, and require explicit candidate configuration otherwise. State that Claude Code and Codex use explicit caller/configured candidates and never private scraping.
2. Update `skills/delivery/herd-next/SKILL.md` and answer templates. Parse optional candidate configuration, call the portable helper, pass `--model <selected>` to `herdr agent start` for Claude, Codex, OMP, and Pi when enforceable, and report a recommendation instead of pretending to enforce it for manual handoffs. Keep Codex `$` conversion for the staged skill command.
3. Add tests for the Herdr instruction contract and validate generated runtime trees.

## Phase 4: Documentation and release proof

1. Replace `docs/model-routing.md` with the portable machine-readable contract, examples for Node and stdin, Atomic compatibility, catalog boundaries, credential handling, and no proxy/fallback rule.
2. Update `.changeset/economical-model-routing.md` and `.agents/tasks/one-thing-i-m/pr-description.md`.
3. Run `npm test`, focused route/Atomic tests, `npm run check-commits -- origin/main..HEAD`, and inspect the final diff. Commit artifacts, code, and docs in focused Conventional Commits. Do not push.

## Acceptance checks

- All harnesses can invoke the same helper through Node.
- Atomic does not own a separate candidate-selection policy.
- Economy remains the default for implementation and unknown phases.
- Eligible phases choose only exact supplied candidates and prefer the cheapest adequate candidate.
- `/configure-model-routing` is model-invoked, asks one question at a time, and supports project and `SKILLS_MODEL_CANDIDATES_FILE` profiles.
- Pi/OMP discovery is limited to `pi --list-models` and `omp models --json` when available; Claude/Codex require explicit candidates.
- Herdr passes selected models only when it can enforce them and otherwise reports recommendations.
- Credentials never appear in artifacts or records.
