---
type: research-questions
summary: "Sets the query plan for researching how the delivery workflow currently hands off between phases/sessions (by hand and under Archon), how this repository packages and installs its skills/agents/plugin across runtimes, and what hook and session-launch capabilities Claude Code, Codex, Oh My Pi, and pi expose today. The next research phase answers these against the live repository and current external docs before any design for the requested herdr plugin begins. Typed-judgment neutrality/routing checks were skipped (no TYPESAFE_API_KEY); routing and neutrality were judged by hand."
status: complete
---

# Research Questions

## Research Goal

Investigate how the delivery workflow's phase handoff works today, both when a skill is run by hand and when Archon steers a run, how this repository packages and installs its skills, agents, and plugin manifest across its target runtimes, and what hook and session/window-launch capabilities Claude Code, Codex, Oh My Pi, and pi currently document or expose.

## Questions

1. In `workflows/delivery.md`, how does a delivery phase currently signal that work should continue in a new session, both in the by-hand flow (the command-fence handoff under "Running skills by hand") and in the Archon-orchestrated flow (`archon workflow wait`/`approve`/`reject` under "Steering a run")? (analyze)
2. Where do Claude Code hook definitions live in this repository and in this machine's `~/.claude/settings.json`, and what hook events (for example `SessionStart`, `Stop`, `SessionEnd`, `UserPromptSubmit`) are currently configured? (locate)
3. What structure do the existing configured hooks use to inject behavior into a session, and what inputs does a hook script receive and what output does it return to Claude Code? (analyze)
4. How do `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` declare this plugin's skills, and what do `scripts/build-packs.mjs`, `scripts/build-runtimes.mjs`, and `scripts/sync-plugin.mjs` do to turn the source tree into the per-runtime `dist/` output that `scripts/install.mjs` installs? (analyze)
5. What machine-readable state does `archon workflow get <run-id> --json` and `archon workflow wait <run-id>` currently return about a run's active node, paused gate, and completion, per the "Steering a run" section of `workflows/delivery.md`? (analyze)
6. What do Claude Code's, Codex's, and Oh My Pi's current documentation say about starting a new session or terminal window/pane non-interactively with an initial prompt or command, and what hook or callback events, if any, fire when a session or skill run ends? (web)

### Known limits

- Typed-judgment neutrality and routing checks were skipped: `TYPESAFE_API_KEY` is not set in this environment. Neutrality and routing tags above were judged by this skill's own reading of the collection's rules.

## Key Context Pointers

- Links: https://github.com/MarkTripoli/skills
- Repositories: MarkTripoli/skills (this checkout)
- Libraries / dependencies: Archon workflow engine, Claude Code plugin/skills system, Codex, Oh My Pi (`omp`), `pi`
- Filepaths / directories: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `workflows/delivery.md`, `runtimes/claude-code.md`, `runtimes/codex.md`, `runtimes/oh-my-pi.md`, `runtimes/pi.md`, `scripts/build-packs.mjs`, `scripts/build-runtimes.mjs`, `scripts/sync-plugin.mjs`, `scripts/install.mjs`, `skills/delivery/`, `agents/agent-*.md`, `shared/CONVENTIONS.md`, `shared/WRITING.md`, `~/.claude/settings.json`
- Commands / endpoints / schemas: `archon workflow run delivery-<type> --branch <name> "<request>"`, `archon workflow approve <run-id> --detach`, `archon workflow reject <run-id> --detach "<text>"`, `archon workflow wait <run-id>`, `archon workflow get <run-id> --json`, `npx github:MarkTripoli/skills claude-code`

## Research Boundaries

- Focus on current repository behavior, existing tests, existing conventions, and current external documentation when needed.
- Do not answer what should be built.
- Do not propose a design or implementation.
