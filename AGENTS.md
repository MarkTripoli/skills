# Agents

Map for working on this repository: building skills, packs, and their docs. Using them is a different document, [docs/cheatsheet.md](docs/cheatsheet.md).

## What lives here

- `skills/delivery/<name>/` is one delivery phase each: `create-*` and `iterate-*` write and revise an artifact, `implement-*` build from it, `reproduce-bug` and `fix-bug` reproduce and fix defects, `verify-implementation` re-runs the checks and acceptance items in a session that did not write the code, `review-code` and `fix-code-review` review until clean, `describe-pr`, `resolve-pr-reviews`, `ci-commit`, `record-evidence`, `create-epic-plan` and `start-epic-delivery`. `SKILL.md` holds the steps; `references/` holds the artifact template and the answer template the phase ends with.
- `skills/delivery/typed-judgment/` is the one skill with code: `judge.mjs` asks the TypeSafe model typed questions for the packs and for the `create-epic-plan`, `resolve-pr-reviews`, `test-app`, and `verify-implementation` steps; every caller falls back to its deterministic rule when the helper exits 3. `skills/delivery/test-app/` drives a running web, iOS, or Android app through a charter and grades the steps. `skills/delivery/deliver/` is the in-session entry point: it routes a request, then starts the Archon run and reports its first pause, or starts the chain by hand.
- `skills/delivery/agent-*/` are worker roles a phase dispatches (locate, analyze, find patterns, implement, review, research). `scripts/sync-plugin.mjs` regenerates `agents/` from them; the installer builds the per-runtime forms.
- `skills/<name>/` (`show-me`) are standalone skills outside the workflow.
- `.archon/workflows/delivery/` holds the Archon blocks and packs that chain the phases, each with `fixtures/` dry-run cases; `start/` is the one-command entry that routes a request, `program/` the PRD-to-children chain, `wave/` and `epic-wave/` launch epic children as unattended runs; every `prompt:` node names a model tier (`docs/model-routing.md`), the `verify` block runs after implementation unless a pack gets `--input verify=false` (`docs/verification.md`), and the `app-test` block runs when a pack gets `--input app_test=web|ios|android` (`docs/app-testing.md`). `delivery-omp/` is generated from it by `scripts/build-packs.mjs` and never edited.
- `shared/WRITING.md` and `shared/CONVENTIONS.md` are the prose rules and the task-directory, artifact, and commit conventions; every `SKILL.md` links both on line 6.
- `runtimes/<runtime>.md` carries what differs per runtime; `scripts/lib/build.mjs` reads it when building an install tree.
- `observability/` holds the optional Grafana dashboard; `scripts/metrics.mjs` reads Archon's SQLite database read-only and exports metrics without pack wiring.
- `evals/` runs the skills against a live model (`npm run evals`, not part of `npm test`): `run.mjs` builds the Oh My Pi tree, gives each scenario a throwaway repository from `fixtures/repo-cli/`, and runs every phase as its own `omp -p` session; `scenarios/*.mjs` name the phases, the expected handoff, and the facts each artifact must carry; `docs/testing.md`, "Evals".

## When changing something

- A skill or template: `docs/testing.md`, "Adding a skill to the workflow"; `scripts/validate.mjs` is the contract it must pass.
- A pack or block: `workflows/delivery.md`, "Pack source" for the authoring rules and "Archon notes" for the engine limits the DAG works around; then `node scripts/build-packs.mjs`.
- Docs: `workflows/delivery.md` is the long form, `docs/cheatsheet.md` the short one; both follow the YAML, not the other way round.
- Done means `npm test` passes: validator, plugin sync, generator staleness, unit tests, and the Archon dry-run, fixture, and real-run tests when `archon` 0.10 or later is on `PATH`. A change to what a skill makes a model produce also passes its `npm run evals <scenario>`.
- Commit subjects follow `scripts/check-commits.mjs`; a user-facing change adds a `.changeset/` entry.
