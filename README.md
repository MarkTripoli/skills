# skills

Portable agent skills: one directory per skill, one `SKILL.md`, usable independently in Claude Code, Codex, Oh My Pi, Pi, or any skill-aware agent. Skills need a filesystem, git for repository work, and the tools their own steps name. They do not require an orchestration engine.

The optional [Atomic](https://docs.bastani.ai/) `delivery` workflow coordinates fresh-context skill stages, artifact handoffs, and human approvals. It is a separate installation choice, not a runtime-specific fork of the skills. Stage routing defaults to `model_routing=auto`, with `openai-codex/gpt-5.6-luna-fast` as the ordinary economical baseline and `openai-codex/gpt-5.6-sol` as the stronger reasoning candidate for allowed non-code phases; use `model_routing=fixed` for a JEV-free path. Manual skill sessions remain available without Atomic.

New here: [getting started](docs/getting-started.md). Existing users: [cheat sheet](docs/cheatsheet.md).

## Install

The installer needs Node 20.12+. In a terminal it offers detected harnesses, then all skills or a searchable skill picker, previews the file plan, and asks before writing.

```sh
npx github:MarkTripoli/skills
# One independent skill; no workflow or Atomic dependency:
npx github:MarkTripoli/skills claude-code --skill create-research --yes
# All portable skills plus the optional Atomic workflow:
npx github:MarkTripoli/skills portable --atomic --yes
```

| Flag or argument | Effect |
|---|---|
| `claude-code`, `codex`, `oh-my-pi`, `pi`, `all`, `portable` | Select installation targets; `portable` installs plain skill directories |
| `--skill <name>`, `-s <name>` | Install only named skills; repeat for several |
| `--atomic` | Also install the optional `delivery` workflow; requires the complete skill collection |
| `--project` | Install in the current repository, including local `.agents/skills/` for portable workflow inputs |
| `--dry-run` | Preview without writing |
| `--yes` | Skip menus and confirmation; use detected targets and all skills when unspecified |
| `--uninstall` | Remove the selected managed installation; use `--atomic` to select the optional workflow too |

| Runtime | User skills | User workers |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` |
| Codex | `~/.agents/skills/` | `~/.codex/agents/` and a managed config block |
| Oh My Pi | `~/.omp/agent/skills/` | `~/.omp/agent/agents/` |
| Pi | `~/.pi/agent/skills/` | Inline worker roles |
| Portable | `~/.agents/skills/` | Inline worker roles |

Atomic resources install under `<agentDir>/workflows/skills-delivery/`; `agentDir` defaults to `~/.atomic/agent` and respects `ATOMIC_CODING_AGENT_DIR`. Project installs use `.atomic/workflows/skills-delivery/`. The installer supplies the discovery entry alongside that tree. A user workflow reads `~/.agents/skills` by default; a project workflow uses the project's `.agents/skills`. Override `skills_dir` when launching to use another complete portable installation.

Other installation methods:

- Claude Code plugin:

  ```text
  /plugin marketplace add MarkTripoli/skills
  /plugin install marktripoli-skills@marktripoli
  ```

- [skills.sh](https://skills.sh/MarkTripoli/skills): `npx skills@latest add MarkTripoli/skills`. Skill files only, without optional orchestration.
- Pinned release: `npx github:MarkTripoli/skills#v<version>`.
- Checkout: `node scripts/install.mjs`; `npm run build -- --runtime <claude-code|codex|oh-my-pi|pi|portable>` builds an adapted tree under `dist/`.

## Use skills independently

Start a skill in your own agent session: `/create-research-questions`, or `$create-research-questions` in Codex. Supply the request or an existing task/artifact. Each phase saves its artifact and prints the next invocation. Open a fresh session at the checkout and branch it names before continuing. Install only the phases you need; a handoff to a missing skill is a suggestion to install or perform that next phase, not a hidden dependency.

Canonical skills live in `skills/delivery/<name>/` and `skills/show-me/`. [Manual chains and the phase table](workflows/delivery.md#running-skills-by-hand) describe how to combine them. [Context management](docs/context-management.md) explains fresh sessions and artifact memory.

## Optional Atomic orchestration

Install and authenticate Atomic separately using its [installation](https://docs.bastani.ai/getting-started/installation) and [authentication](https://docs.bastani.ai/getting-started/authentication) guides, then opt in with `--atomic`. Start `atomic` in the target repository. These are commands **inside Atomic**, not shell subcommands:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot gates=all branch=verbose-flag
/workflow status
/workflow connect <run-id>
```

The controller chooses the next skill from the request and current artifacts rather than carrying one long conversation through the task. Every skill stage uses `context: "fresh"`; disk artifacts are cross-stage memory. Human approvals appear in Atomic's native workflow UI. Connect to the run to answer them; use native pause, quit, and resume controls. Headless execution requires `gates=none`.

Full inputs, workflow choices, bounded repair behavior, task ownership, and native controls: [workflows/delivery.md](workflows/delivery.md). JEV judgments use the existing `typed-judgment/judge.mjs` helper and its optional TypeSafe key; ordinary skills do not acquire an Atomic dependency.

## Develop

- `npm test` runs the repository's validation and tests; [docs/testing.md](docs/testing.md) distinguishes offline checks, live skill evals, and Atomic runtime proof.
- Add a skill with unique directory/frontmatter names and the shared links on line 6. Keep its artifact and reply templates under `references/`, and add its phase-table row. Workflow integration is optional and belongs in `atomic/workflows/delivery.ts`, not in the ordinary skill.
- Follow [shared/WRITING.md](shared/WRITING.md), [shared/CONVENTIONS.md](shared/CONVENTIONS.md), and [shared/SLICING.md](shared/SLICING.md). Commit subjects and PR titles follow Conventional Commits; the `Commits` CI workflow checks them.
- User-facing changes need a [changeset](.changeset/README.md). The `Release` workflow opens the version PR and tags releases after merge.

## Migration and history

This is a breaking orchestration replacement. Retired workflow resources, generators, and metrics integrations are no longer part of the active installation. There is no replacement telemetry service. Use a new Atomic run with an existing `task_dir` to continue from saved artifacts; older controller checkpoints are not converted into Atomic checkpoints.

Published [changelog entries](CHANGELOG.md) and `.agents/tasks/` remain historical records and may name retired systems. Existing or cancelled-run worktrees belong to their owner and are not globally purged by this cutover. Inspect and retain their work before any deliberate removal.

## Reference

- [Getting started](docs/getting-started.md) and [cheat sheet](docs/cheatsheet.md)
- [Delivery workflow and inputs](workflows/delivery.md)
- [Context management](docs/context-management.md), [verification](docs/verification.md), and [app testing](docs/app-testing.md)
- [Model routing](docs/model-routing.md) and [testing](docs/testing.md)
- [Runtime adapters](runtimes/)

## License

MIT. See [LICENSE](LICENSE).
