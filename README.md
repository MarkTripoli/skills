# skills

Instructions help code agent research, plan, build, check, review change. Use one skill or mash many together.

Work with Claude Code, Codex, Oh My Pi, Pi, other agent what read `SKILL.md` file. Skill need file access, Git for repo work, and any tool their step name.

## Safety Dance

The local Safety Dance Git gate and durable validation daemon are documented in [docs/safety-dance.md](docs/safety-dance.md). Its binary releases are separate from skill installation and Changesets.

## Slack coordinator

The standalone `slack-coordinator` skill operates the daemon that reports run status and receives owner steering. Install the skill independently; build and onboard the daemon separately as described in [docs/slack-coordinator.md](docs/slack-coordinator.md). The delivery group's `agent-slack-control-plane` remains responsible for delivery-task and Jira-run visibility; it does not require the daemon.

## Jira issue hierarchy

The standalone [`jira-issue-hierarchy`](skills/jira-issue-hierarchy/SKILL.md) skill drafts KIT Epics and Stories from approved requirements, authors Sub-tasks when Story work starts, and checks Story QA readiness. Its policy and templates ship with the skill; QA reviews the Story, not agent-owned children. Install it alone or select `video-iterative-orchestration` with the repository installer to include it as a dependency. See the [quick start](docs/cheatsheet.md).

## Babysit pull requests

[`babysit`](skills/delivery/babysit/SKILL.md) supervises a frozen PR set and source-backed cross-project dependencies, prioritizes CI/review repairs, and merges only with explicit scoped authority, current required CI and host protections. GitHub is the default; an explicitly selected GitLab scope uses that host's protocol. Ordinary scoped repairs need source access and deciding checks, not old task artifacts, baselines, sealed evidence or helper preflight; full delivery proof remains binding when explicitly required by the owner, repository or original task. The [repository installer quick start](docs/getting-started.md#babysit-selected-gitlab-prs) provides existing companions without requiring their workflow. Queued requests are not merged. Monitoring lasts only while the session or an observed runtime scheduler remains active. `/deliver` stays never-merge.

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

### Working from a clone

Installed skills are copies. Opt into normal full-runtime refresh after default-branch merges with `git config skills.autoInstall auto`; use a runtime list such as `codex oh-my-pi` to choose targets. Leave it unset or set `off` for manual updates. The hook runs the regular installer without enabling orchestration. To refresh selected skills explicitly, run `node scripts/install.mjs <runtime> --skill <name> --yes` and start a new session.

### Authoring and explanation

- [`/author-skill`](skills/author-skill/SKILL.md) is the upstream “create skill” workflow: sibling/trigger check, eval-first scaffold, progressive references and executable helpers, both validators, then current-source live eval.
- [`/explain`](skills/explain/SKILL.md) produces an evidence-grounded explanation for a selected audience; optional HTML and media stay outside task roots.
- [`/land-pr-stack`](skills/delivery/land-pr-stack/SKILL.md) lands an explicitly authorized PR stack in dependency order, using GitHub by default and existing repository release requirements.


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

The active skills and deterministic helpers incorporate the skill-authoring refresh at revision `9af302dc`. The revamp adopts Claude Code skill-authoring practices: discriminating trigger descriptions, short procedural bodies, branch-loaded references, executable deterministic checks and behavior-first evals. `/author-skill` is canonical, not a new `/create-skill` alias. Atomic remains retired; task history and owner worktrees are preserved.

`/describe-pr` and `/resolve-pr-reviews` retain personal PR naming, GitHub APIs, exact current-head hosted proof and optional hooks. Review and evidence repairs have no implicit three-round cap; explicit owner limits and no-progress stops remain binding. Imported recordings are historical source evidence, not proof of this checkout. The immutable indexed-artifact, configurable-root, opt-in security and run-coordination contracts below remain authoritative.


## Reference

- [Getting started](docs/getting-started.md) and [cheat sheet](docs/cheatsheet.md)
- [Workflow inputs and steps](workflows/delivery.md), [model selection](docs/model-routing.md), [agent setup](runtimes/)
- [Session memory](docs/context-management.md), [verification](docs/verification.md), [app testing](docs/app-testing.md)

Skill source: `skills/delivery/<name>/` and standalone directories under `skills/` (including `show-me`, `explain`, `slack-coordinator`, and `jira-issue-hierarchy`).

## License

MIT. See [LICENSE](LICENSE).
## Personal contracts

The package remains `@marktripoli/skills`, with GitHub PR publication and releases. [`security-check`](skills/delivery/security-check/SKILL.md) stays opt-in. Slack coordinator provides durable run status and owner steering; it does not launch an assistant or schedule standing tasks.

Tasks use configurable roots and an immutable `skills.task-index/v1` ledger; legacy no-index tasks remain readable. Hosted proof still requires actual tested-command output, passing recorded tests/cues, current-head SHA, direct capture bytes and a distinct same-PR comment. Custom publication hooks remain supported.
