# Agents

Map for changing this repository. For using the installed skills, read [docs/cheatsheet.md](docs/cheatsheet.md).

## Source and ownership

- `skills/delivery/<name>/SKILL.md` is the canonical independent skill; `references/` owns its artifact and reply templates. `skills/show-me/` is the standalone visualization skill. Ordinary phase skills remain usable in Claude Code, Codex, OMP, Pi, and portable mode.
- `skills/delivery/agent-*/` holds worker roles. `scripts/sync-plugin.mjs` generates plugin workers under `agents/`; runtime installation adapts skills and workers through `scripts/lib/build.mjs` and `runtimes/<runtime>.md`.
- `skills/delivery/typed-judgment/judge.mjs` owns System One/JEV typed questions and key lookup. Optional skill judgments retain their documented deterministic fallback.
- `scripts/install.mjs` installs selected skills independently by default. Project installations use local `.agents/skills/`.
- `shared/WRITING.md`, `shared/CONVENTIONS.md`, `shared/task-artifacts.md`, and `shared/SLICING.md` own prose, task/artifact/commit, and task-sizing rules. Every `SKILL.md` links the first two on line 6.
- The configured task root (default `.agents/tasks/`) contains historical task artifacts. Preserve the already-committed task directories and owner-managed worktrees, including cancelled-run worktrees; do not delete or untrack them. New task artifacts are local, ignored working state.
- `evals/` exercises skills against live OMP sessions in throwaway repositories; `evals/results/` retains evidence. It is separate from offline tests.

## Change boundaries

- Skill/template changes: [docs/testing.md](docs/testing.md), “Adding a skill to the workflow”; `scripts/validate.mjs` owns the mechanical contract. Preserve artifact-first replies and human invocation fences.
- Installation changes: preserve selected-resource ownership and the no-orchestration default. Do not delete unrelated runtime configuration, task history, or worktrees.
- Validation: `npm test` runs offline checks. Live evals prove only their skill scenarios. See [docs/testing.md](docs/testing.md) before claiming runtime readiness.
- Docs: update the workflow reference and its quick-start pointers together. Keep published changelog entries as history; remove obsolete active operational guidance. The former metrics integration is retired, with no replacement telemetry.
- Fix a recurring agent failure with a check, test or eval, not with emphasis or restated rules. A new orchestration layer lands only with an eval showing it beats plain `/deliver`.
- Commits follow `scripts/check-commits.mjs`; user-facing changes add a `.changeset/` entry.

Personal invariants: preserve `@marktripoli/skills`, GitHub identity/publication, indexed immutable artifacts and configurable task roots, strict hosted proof and custom hooks, opt-in security, Slack assistant/DM/standing tasks, `.omo/`, eval recordings, historical tasks and owner worktrees. New reviews bind observed head/source/model/checkpoint; never directory-scan indexed tasks.
