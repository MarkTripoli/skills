# Adyton Skills

Instructions help code agent research, plan, build, check, review change. Use one skill or mash many together.

Work with Claude Code, Codex, Oh My Pi, Pi, other agent what read `SKILL.md` file. Skill need file access, Git for repo work, and any tool their step name.

## Safety Dance

The local Safety Dance Git gate and durable validation daemon are documented in [docs/safety-dance.md](docs/safety-dance.md). Its binary releases are separate from skill installation and Changesets.

## Slack coordinator

The standalone `slack-coordinator` skill operates the daemon that reports run status and receives owner steering. Install the skill independently; build and onboard the daemon separately as described in [docs/slack-coordinator.md](docs/slack-coordinator.md). The delivery group's `agent-slack-control-plane` remains responsible for delivery-task and Jira-run visibility; it does not require the daemon.

## Jira issue hierarchy

The standalone [`jira-issue-hierarchy`](skills/jira-issue-hierarchy/SKILL.md) skill drafts KIT Epics and Stories from approved requirements, authors Sub-tasks when Story work starts, and checks Story QA readiness. Its policy and templates ship with the skill; QA reviews the Story, not agent-owned children. Install it alone or select `video-iterative-orchestration` with the repository installer to include it as a dependency. See the [quick start](docs/cheatsheet.md).

## Install

Use Node 22.20 or newer. Run in terminal:

```sh
npx skills@latest add MarkTripoli/skills
# Or choose agents and one skill without menus:
npx skills@latest add MarkTripoli/skills --agent claude-code codex --skill create-research-questions --yes
```

Pick agent and skill when asked. `--agent` pick agent; `--skill` pick skill. Install project-local by default; add `--global` for all project.

This put skill file only. For agent-specific worker setup, use this repo installer (Node 20.12 or newer):

```sh
npx github:MarkTripoli/skills
```

See [repository installer reference](docs/cheatsheet.md#install) for its own flag, file place, other install way.

GitHub delivery requires gh authenticated for the repository host. Private installation also requires Git credentials for that host.

## Use skills independently

Open code agent in repo you want change. Run:

```text
/create-research-questions Explain how login works in this project.
```

In Codex, use `$create-research-questions` instead.

Each step save task doc, call **artifact**. New task normally use **worktree**: separate checkout on own branch. Read result, then open new session in named checkout and run next command.

Install only skill you need. Suggested next skill not hidden dependency. See [getting started](docs/getting-started.md) or [common skill sequences](workflows/delivery.md#workflow-choices-and-manual-chains).

For allowed poke and fix of recorded behavior, use [iterate-evidence](docs/getting-started.md#inspect-and-repair-recorded-behavior). Its chosen repo install bring recorder dependency.

## Develop

Run `npm test`. See [testing](docs/testing.md) for what check prove and [adding a skill](docs/testing.md#adding-a-skill-to-the-workflow) for file need.

Follow shared [writing](shared/WRITING.md), [task](shared/CONVENTIONS.md), [task-sizing](shared/SLICING.md) rule. Commit subject and pull request title use Conventional Commits. User-facing change need [changeset](.changeset/README.md).

## GitHub operation

Delivery uses GitHub pull requests and gh. Invoke /describe-pr and /resolve-pr-reviews; preserve the repository’s GitHub Actions release and review flow.

## Migration and history

Old workflow system and metrics hookup dead; no replace telemetry service. Old checkpoint cannot convert; continue old work by running the next skill on its task doc.

Keep task doc, published [changelog entries](CHANGELOG.md), existing worktree, include cancelled run. Install change not allow delete them.

## Reference

- [Getting started](docs/getting-started.md) and [cheat sheet](docs/cheatsheet.md)
- [Workflow inputs and steps](workflows/delivery.md), [model selection](docs/model-routing.md), [agent setup](runtimes/)
- [Session memory](docs/context-management.md), [verification](docs/verification.md), [app testing](docs/app-testing.md)

Skill source: `skills/delivery/<name>/` and standalone directories under `skills/` (including `show-me`, `slack-coordinator`, and `jira-issue-hierarchy`).

## License

MIT. See [LICENSE](LICENSE).
## Personal contracts

The package remains `@marktripoli/skills`, with GitHub PR publication and releases. [`security-check`](skills/delivery/security-check/SKILL.md) stays opt-in. Slack coordinator retains the personal assistant, DM and standing-task modes alongside durable run status.

Tasks use configurable roots and an immutable `skills.task-index/v1` ledger; legacy no-index tasks remain readable. Hosted proof still requires actual tested-command output, passing recorded tests/cues, current-head SHA, direct capture bytes and a distinct same-PR comment. Custom publication hooks remain supported.
