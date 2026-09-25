# skills

Instructions help code agent research, plan, build, check, review change. Use one skill or mash many together.

Work with Claude Code, Codex, Oh My Pi, Pi, other agent what read `SKILL.md` file. Skill need file access, Git for repo work, and any tool their step name. Atomic optional.

## Safety Dance

The local Safety Dance Git gate and durable validation daemon are documented in [docs/safety-dance.md](docs/safety-dance.md). Its binary releases are separate from skill installation and Changesets.

## Slack visibility

[`agent-slack-control-plane`](skills/delivery/agent-slack-control-plane/SKILL.md) describes two operator-controlled patterns: sparse feature updates and opt-in work-item run visibility and steering. It does not implement product work. Installing the skill alone does not enable automatic task threading; see its guide for the current operating contract. The separate [`slack-coordinator`](skills/slack-coordinator/SKILL.md) skill operates the daemon documented in [docs/slack-coordinator.md](docs/slack-coordinator.md); installing either skill does not install the daemon.

## Install and discover skills

Use the repository installer (Node 20.12 or newer) to browse or install personal skills:

```sh
npx github:MarkTripoli/skills --list
npx github:MarkTripoli/skills --skill create-research-questions --yes
# Choose an agent and skill without menus:
npx github:MarkTripoli/skills codex --skill create-research-questions --yes
```

The installer supports Claude Code, Codex, Oh My Pi, Pi, and portable skill files. Add `--project` for project-local installation; home installation is the default. Repeat `--skill` to select more skills. See the [installer reference](docs/cheatsheet.md#install) for targets, locations, and options.

For a skill-file-only install through skills.sh (Node 22.20 or newer):

```sh
npx skills@latest add MarkTripoli/skills --agent claude-code codex --skill create-research-questions --yes
```

The skills.sh installer does not install worker setup or Atomic. Use this repository's installer for those:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
```

`--atomic` installs the full skill collection and optional workflow. Follow [Atomic setup steps](docs/getting-started.md#add-optional-atomic-orchestration).

## Use skills independently

Open the coding agent in the repository you want to change. Run:

```text
/create-research-questions Explain how login works in this project.
```

In Codex, use `$create-research-questions` instead.

Each step saves a task document, called an **artifact**. A new task normally uses a **worktree**: a separate checkout on its own branch. Read the result, then open a new session in the named checkout and run the next command.

Install only the skill you need; suggested next skills are not hidden dependencies. See [getting started](docs/getting-started.md) or [common skill sequences](workflows/delivery.md#workflow-choices-and-manual-chains).

[`video-iterative-development`](skills/delivery/video-iterative-development/SKILL.md) scopes authenticated backend/frontend requirements and requires appropriate API or real user-flow evidence. [`video-iterative-orchestration`](skills/delivery/video-iterative-orchestration/SKILL.md) coordinates ordered, dependency-aware requirements through isolated worktrees and delivery gates.

For an authorized inspect-and-repair loop on recorded behavior, use [iterate-evidence](docs/getting-started.md#inspect-and-repair-recorded-behavior). Its repository-installer selection includes the recorder dependency; Atomic is not required.

## Optional Atomic orchestration

Atomic runs the skill workflow in a separate session and pauses for approval. Install and sign in to Atomic separately, then add the workflow using the full skill collection:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
```


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

Skill source: `skills/delivery/<name>/`, `skills/show-me/`, and `skills/slack-coordinator/`.

## License

MIT. See [LICENSE](LICENSE).
