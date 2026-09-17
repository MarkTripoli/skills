# Agents

Map for working on this repository: building skills, packs, and their docs. Using them is a different document, [docs/cheatsheet.md](docs/cheatsheet.md).

## What lives here

- `skills/delivery/<name>/` is one delivery phase each: `create-*` and `iterate-*` write and revise an artifact, `implement-*` build from it, `reproduce-bug` and `fix-bug` reproduce and fix defects, `review-code` and `fix-code-review` review until clean, `describe-pr`, `resolve-pr-reviews`, `ci-commit`, `record-evidence`, `create-epic-plan` and `start-epic-delivery`. `SKILL.md` holds the steps; `references/` holds the artifact template and the answer template the phase ends with.
- `skills/delivery/agent-*/` are worker roles a phase dispatches (locate, analyze, find patterns, implement, review, research). `scripts/sync-plugin.mjs` regenerates `agents/` from them; the installer builds the per-runtime forms.
- `skills/<name>/` (`show-me`) are standalone skills outside the workflow.
- `.archon/workflows/delivery/` holds the Archon blocks and packs that chain the phases, each with `fixtures/` dry-run cases. `delivery-omp/` is generated from it by `scripts/build-packs.mjs` and never edited.
- `shared/WRITING.md` and `shared/CONVENTIONS.md` are the prose rules and the task-directory, artifact, and commit conventions; every `SKILL.md` links both on line 6.
- `runtimes/<runtime>.md` carries what differs per runtime; `scripts/lib/build.mjs` reads it when building an install tree.
- `observability/` holds the optional Grafana dashboard; `scripts/metrics.mjs` reads Archon's SQLite database read-only and exports metrics without pack wiring.

## When changing something

- A skill or template: `docs/testing.md`, "Adding a skill to the workflow"; `scripts/validate.mjs` is the contract it must pass.
- A pack or block: `workflows/delivery.md`, "Pack source" for the authoring rules and "Archon notes" for the engine limits the DAG works around; then `node scripts/build-packs.mjs`.
- Docs: `workflows/delivery.md` is the long form, `docs/cheatsheet.md` the short one; both follow the YAML, not the other way round.
- Done means `npm test` passes: validator, plugin sync, generator staleness, unit tests, and the Archon dry-run, fixture, and real-run tests when `archon` 0.10 or later is on `PATH`.
- Commit subjects follow `scripts/check-commits.mjs`; a user-facing change adds a `.changeset/` entry.
