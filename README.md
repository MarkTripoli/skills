# skills

Instructions that help coding agents research, plan, build, check, and review changes. Use one skill or combine several.

Works with Claude Code, Codex, Oh My Pi, Pi, and other agents that read `SKILL.md` files. Skills need file access, Git for repository work, and any tools their steps name. Atomic is optional.

## Install

Use Node 22.20 or newer. Run in your terminal:

```sh
npx skills@latest add MarkTripoli/skills
# Or choose agents and one skill without menus:
npx skills@latest add MarkTripoli/skills --agent claude-code codex --skill create-research-questions --yes
```

Choose your coding agents and skills when prompted. `--agent` selects agents; `--skill` selects skills. Installs are project-local by default; add `--global` for all projects.

This installs skill files only. For agent-specific worker setup or Atomic, use this repository's installer (Node 20.12 or newer):

```sh
npx github:MarkTripoli/skills
```

See the [repository installer reference](docs/cheatsheet.md#install) for its separate flags, file locations, and other install methods.

## Use skills independently

Open your coding agent in the repository you want to change. Run:

```text
/create-research-questions Explain how login works in this project.
```

In Codex, use `$create-research-questions` instead.

Each step saves a task document, called an **artifact**. New tasks normally use a **worktree**: a separate checkout on its own branch. Read the result, then open a new session in the named checkout and run the next command.

Install only the skills you need. A suggested next skill is not a hidden dependency. See [getting started](docs/getting-started.md) or [common skill sequences](workflows/delivery.md#workflow-choices-and-manual-chains).

## Set up repository metadata

Run `/setup-repository` or `/setup-repository reconcile` to create or reconcile local `ai-utilities.json` metadata. Run `/setup-repository reset-managed` only when you explicitly want managed local state reset. Setup reads metadata only when `ai-utilities.json` is a regular non-symlink file; directories, links, FIFOs, sockets, and devices fail closed. The skill does not install skills or mutate ticketing, version-control, or other provider resources.

## Optional Atomic orchestration

Atomic runs skills in separate sessions and pauses for your approval. Install and sign in to Atomic separately, then add the workflow:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
```

This requires all skills. Follow the [Atomic setup steps](docs/getting-started.md#add-optional-atomic-orchestration). Runs without an interactive screen require `gates=none`.

## Develop

Run `npm test`. See [testing](docs/testing.md) for what these checks prove and [adding a skill](docs/testing.md#adding-a-skill-to-the-workflow) for the required files.

Follow the shared [writing](shared/WRITING.md), [task](shared/CONVENTIONS.md), and [task-sizing](shared/SLICING.md) rules. Commit subjects and pull request titles use Conventional Commits. User-facing changes need a [changeset](.changeset/README.md).

## Migration and history

The old workflow system and metrics integration are retired; there is no replacement telemetry service. To continue old work, start a new Atomic run with its existing `task_dir`. Old checkpoints cannot be converted.

Preserve task documents, published [changelog entries](CHANGELOG.md), and existing worktrees, including cancelled runs. Installation changes do not authorize deleting them.

## Reference

- [Getting started](docs/getting-started.md) and [cheat sheet](docs/cheatsheet.md)
- [Workflow inputs and steps](workflows/delivery.md), [model selection](docs/model-routing.md), and [agent setup](runtimes/)
- [Session memory](docs/context-management.md), [verification](docs/verification.md), and [app testing](docs/app-testing.md)

Skill source: `skills/delivery/<name>/`, `skills/show-me/`, and `skills/setup-repository/`.

## License

MIT. See [LICENSE](LICENSE).
