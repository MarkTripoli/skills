# Agents

Map for changing this repository. For using the installed skills, read [docs/cheatsheet.md](docs/cheatsheet.md).

## Source and ownership

- `skills/delivery/<name>/SKILL.md` is the canonical independent skill; `references/` owns its artifact and reply templates. `skills/show-me/` is the standalone visualization skill. Ordinary phase skills remain usable in Claude Code, Codex, OMP, Pi, and portable mode without Atomic.
- `skills/delivery/agent-*/` holds worker roles. `scripts/sync-plugin.mjs` generates plugin workers under `agents/`; runtime installation adapts skills and workers through `scripts/lib/build.mjs` and `runtimes/<runtime>.md`.
- `skills/delivery/typed-judgment/judge.mjs` owns System One/JEV typed questions and key lookup. Optional skill judgments retain their documented deterministic fallback. The Atomic controller's automatic routing requires an available judgment and fails visibly without one.
- `atomic/workflows/delivery.ts` is the optional dynamic controller registered as `delivery`; `atomic/lib/` holds cohesive helpers. Native skill stages use `context: "fresh"`; artifacts, not conversations, carry cross-stage memory. Keep graph branches, gates, and stop conditions visible in the workflow entry.
- `scripts/install.mjs` installs selected skills independently by default. `--atomic` requires the full collection and adds the workflow tree plus a top-level `skills-delivery.mjs` discovery entry. Atomic scans workflow files non-recursively. Project installations use local `.agents/skills/`; user resources respect `ATOMIC_CODING_AGENT_DIR`.
- `shared/WRITING.md`, `shared/CONVENTIONS.md`, and `shared/SLICING.md` own prose, task/artifact/commit, and task-sizing rules. Every `SKILL.md` links the first two on line 6.
- The configured task root (default `.agents/tasks/`) contains historical task artifacts. Preserve them and owner-managed worktrees, including cancelled-run worktrees; they are not install or migration cleanup targets.
- `evals/` exercises skills against live OMP sessions in throwaway repositories; `evals/results/` retains evidence. It is separate from offline tests and optional Atomic runtime proof.

## Change boundaries

- Skill/template changes: [docs/testing.md](docs/testing.md), “Adding a skill to the workflow”; `scripts/validate.mjs` owns the mechanical contract. Preserve artifact-first replies and human invocation fences.
- Controller changes: [workflows/delivery.md](workflows/delivery.md) owns documented inputs and phase chains. Verify APIs against the installed Atomic version and [official authoring](https://docs.bastani.ai/workflows/authoring) / [operations](https://docs.bastani.ai/workflows/operations); documentation may describe APIs newer than the installed package. Reuse the typed helper instead of assuming an unavailable SDK export.
- Installation changes: preserve selected-resource ownership and the no-orchestration default. Do not delete unrelated runtime configuration, task history, or worktrees. `--atomic` is opt-in, not a new runtime flavor.
- Validation: `npm test` runs offline checks. Live evals prove only their skill scenarios; Atomic registration/import checks do not prove stage execution, human gates, or durable resume. See [docs/testing.md](docs/testing.md) before claiming runtime readiness.
- Docs: update the workflow reference and its quick-start pointers together. Keep published changelog entries as history; remove obsolete active operational guidance. The former metrics integration is retired, with no replacement telemetry.
- Commits follow `scripts/check-commits.mjs`; user-facing changes add a `.changeset/` entry.
