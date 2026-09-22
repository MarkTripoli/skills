# skills

Instructions help code agent research, plan, build, check, review change. Use one skill or mash many together.

Work with Claude Code, Codex, Oh My Pi, Pi, other agent what read `SKILL.md` file. Skill need file access, Git for repo work, and any tool their step name. Atomic optional.

## Safety Dance

The local Safety Dance Git gate and durable validation daemon are documented in [docs/safety-dance.md](docs/safety-dance.md). Its binary releases are separate from skill installation and Changesets.

## Slack coordinator

Agents report one run per Slack thread, and the run owner steers it from that thread, through the local `slack-coordinator` daemon documented in [docs/slack-coordinator.md](docs/slack-coordinator.md). The binary is built from `tools/slack-coordinator/`; skill installation never installs it.

The assistant also supports owner DMs and standing tasks.

## Install

Use Node 22.20 or newer. Run in terminal:

```sh
npx skills@latest add MarkTripoli/skills
# Or choose agents and one skill without menus:
npx skills@latest add MarkTripoli/skills --agent claude-code codex --skill create-research-questions --yes
```

Pick agent and skill when asked. `--agent` pick agent; `--skill` pick skill. Install project-local by default; add `--global` for all project.

This put skill file only. For agent-specific worker setup or Atomic, use this repo installer (Node 20.12 or newer):

```sh
npx github:MarkTripoli/skills
```

See [repository installer reference](docs/cheatsheet.md#install) for its own flag, file place, other install way.

## Use skills independently

Open code agent in repo you want change. Run:

```text
/create-research-questions Explain how login works in this project.
```

In Codex, use `$create-research-questions` instead.

Each step save task doc, call **artifact**. New task keep immutable artifact iteration under `artifacts/<kind>/<variant>/`, picked by task `index.json`. New task normally use **worktree**: separate checkout on own branch. Read result, then open new session in named checkout and run next command.

Install only skill you need. Suggested next skill not hidden dependency. See [getting started](docs/getting-started.md) or [common skill sequences](workflows/delivery.md#workflow-choices-and-manual-chains).

For allowed poke and fix of recorded behavior, use [iterate-evidence](docs/getting-started.md#inspect-and-repair-recorded-behavior). Its chosen repo install bring recorder dependency; Atomic not need.

## Optional Atomic orchestration

Atomic run skill in separate session and stop for your yes. Install and sign in to Atomic separate, then add workflow:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
```

This need all skill. Follow [Atomic setup steps](docs/getting-started.md#add-optional-atomic-orchestration). Run with no screen need `gates=none`.

## Develop

Run `npm test`. See [testing](docs/testing.md) for what check prove and [adding a skill](docs/testing.md#adding-a-skill-to-the-workflow) for file need.

Follow shared [writing](shared/WRITING.md), [task](shared/CONVENTIONS.md), [task-sizing](shared/SLICING.md) rule. Commit subject and pull request title use Conventional Commits. User-facing change need [changeset](.changeset/README.md).

## Migration and history

Old workflow system and metrics hookup dead; no replace telemetry service. To keep old work, start new Atomic run with its old `task_dir`. Old checkpoint cannot convert.

Keep task doc, published [changelog entries](CHANGELOG.md), existing worktree, include cancelled run. Install change not allow delete them.

## Reference

- [Getting started](docs/getting-started.md) and [cheat sheet](docs/cheatsheet.md)
- [Workflow inputs and steps](workflows/delivery.md), [model selection](docs/model-routing.md), [agent setup](runtimes/)
- [Session memory](docs/context-management.md), [verification](docs/verification.md), [app testing](docs/app-testing.md)

Skill source: `skills/delivery/<name>/` and `skills/show-me/`.

## License

MIT. See [LICENSE](LICENSE).
