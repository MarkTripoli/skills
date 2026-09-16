# skills

A collection of portable agent skills. Each skill is one directory with a `SKILL.md` that any skill-aware coding agent can load; the skills need nothing but a file system, git, and the agent's own tools. Most of them form a delivery workflow that takes a task from request to merged pull request in fresh-context phases with human gates; the rest are utilities and the child-worker roles the phases delegate to. The collection is organized so unrelated skills and other workflows can be added beside it.

New here? Read [Getting started](docs/getting-started.md), then [Context management](docs/context-management.md) for why every phase runs in its own session and how to do that on your runtime.

## Install

One command, no clone. It finds the coding agents on your `PATH` (Claude Code, Codex, Oh My Pi, Pi), shows what it will write, asks, and installs the skills with each runtime's notes, the worker definitions, and the `/run-task` extension where the runtime has one:

```sh
npx github:MarkTripoli/skills
```

Variants: name the targets (`npx github:MarkTripoli/skills oh-my-pi pi`, `all`, or `portable` for a plain `~/.agents/skills/` copy), `--project` to install into the current repository instead of your home directory, `--dry-run` to look first, `--yes` to skip the question, `--uninstall` to remove exactly what it wrote (it tracks its block in `~/.codex/config.toml` with markers). Node 20 or newer is the only requirement. From a checkout the same command is `node scripts/install.mjs`.

Skills only, through the [skills.sh](https://skills.sh/MarkTripoli/skills) installer that many collections use: `npx skills@latest add MarkTripoli/skills`. It lets you pick skills and agents and writes plain skill files you can edit; it does not install the worker definitions or the extensions, so `/run-task` then uses its subagent and manual backends.

By hand: `npm run build -- --runtime <claude-code|codex|oh-my-pi|pi>` writes `dist/<runtime>/`, and each adapter under [runtimes/](runtimes/) lists where its files go. Where the files land:

| Runtime | Skills | Workers | Extension |
|---|---|---|---|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` | none yet |
| Codex | `~/.agents/skills/` | `~/.codex/agents/` plus a block in `~/.codex/config.toml` | none yet |
| Oh My Pi | `~/.omp/agent/skills/` | `~/.omp/agent/agents/` | `~/.omp/agent/extensions/run-task/` |
| Pi | `~/.pi/agent/skills/` | none (phases perform worker roles inline) | `~/.pi/agent/extensions/run-task/` |

`npm test` validates the collection and runs the token-free simulation of every workflow chain; `npm run eval -- --driver <omp|claude|codex>` measures real agents against the same contract (see [docs/testing.md](docs/testing.md)). Everything uses Node 20 or newer and no dependencies.

## Commits and releases

Every commit subject follows the Commits section of [shared/CONVENTIONS.md](shared/CONVENTIONS.md). `npm install` (no dependencies; its `prepare` step sets `core.hooksPath` to `.githooks/`) installs a `commit-msg` hook that rejects a subject that breaks the rule; the `Commits` workflow runs the same check, `node scripts/check-commits.mjs <base>..<head> --title <pr title>`, on every pull request and merge queue entry, so a commit that bypasses the hook still cannot merge. Merge commits and `fixup!`/`squash!` markers are exempt; `git revert`'s default message is not, so write it as `revert: <description>`.

Versions follow [Semantic Versioning](https://semver.org/) and are derived from those subjects by [release-please](https://github.com/googleapis/release-please): on every push to `main`, the `Release` workflow opens or updates a release pull request that bumps `package.json`, writes `CHANGELOG.md`, and, when merged, tags `v<version>` and publishes a GitHub release. `fix` bumps the patch version; `feat` bumps the minor; a `!` or `BREAKING CHANGE:` footer bumps the minor while the version is below 1.0.0 (`bump-minor-pre-major` in `release-please-config.json`) and the major after that. Install a fixed version with `git clone --branch v<version> https://github.com/MarkTripoli/skills.git`.

## How the workflow runs

- A task lives in `.agents/tasks/<slug>/` with a `task.md` and numbered artifacts. The contract is [shared/CONVENTIONS.md](shared/CONVENTIONS.md); the prose rules are [shared/WRITING.md](shared/WRITING.md).
- The chains (`full`, `lean`, `prd`, `oneshot`), the phase table, the human gates, and the review loop are in [workflows/delivery.md](workflows/delivery.md). Not sure which chain a request needs? `/start-task <request>` picks one (or none, for a change you can just ask for), asks up to three questions when it cannot tell, creates the task, and hands off to `/run-task`.
- Every phase ends with one fenced command naming the next phase. Run it in a new session, or let `/run-task` do it.

## Context management

Each phase runs in a fresh context and reads only `task.md` plus the artifacts it selects, so no session carries the whole task history; the artifacts on disk are the memory between phases. `/run-task @.agents/tasks/<slug>` drives a task through its chain: it starts each phase in a fresh context, relays only the phase's final reply, and stops at human gates. Backends, in order: a [Herdr](https://github.com/herdr) pane when `HERDR_ENV=1` and `herdr` is installed (the phase runs visibly beside your session and can ask you questions), the runtime's subagent tool, or manual (it prints the prompt for you to run in a new session). `/run-task @<task dir> --status` reports where a task stands. Phase replies are also written to `.agents/tasks/<slug>/replies/NN-<skill>.md`, which is how the orchestrator knows a phase finished and what comes next.

On Oh My Pi and Pi, an optional extension (`runtimes/oh-my-pi/run-task/`, `runtimes/pi/run-task/`) turns `/run-task` into a command that opens a new session of your TUI for each phase, waits for its reply file, records the session's context usage in `replies/phases.jsonl`, and stops at gates with an approve, request-changes, or stop dialog; the orchestrator is code and spends no tokens. Both import the same `plugin.mjs` from the installed `run-task` skill; the Pi one keeps its run state on disk because Pi replaces the extension runtime with each session. Install per [runtimes/oh-my-pi.md](runtimes/oh-my-pi.md) or [runtimes/pi.md](runtimes/pi.md).

Every reply tells you to start the next phase in a new session. That sentence, the read budget for a phase, and the signs of a degraded context are in the conventions; the per-runtime commands (`/clear`, `/new`, `/context`, `/status`) and what to do when a session degrades are in [docs/context-management.md](docs/context-management.md).

## Docs

- [docs/getting-started.md](docs/getting-started.md): install, first task by hand and with `/run-task`, gates, feedback, worktrees, epics.
- [docs/context-management.md](docs/context-management.md): the phase model, fresh contexts per runtime, recognizing a degraded context, what a runtime plugin adds.
- [docs/testing.md](docs/testing.md): static validation, token-free simulation of every chain, and the eval harness for real agents.
- [workflows/delivery.md](workflows/delivery.md): workflow types, phase table, gates, review loop.
- [shared/CONVENTIONS.md](shared/CONVENTIONS.md) and [shared/WRITING.md](shared/WRITING.md): the contract every skill follows.
- [runtimes/](runtimes/): per-runtime invocation notes and install steps.

## Skills

The delivery workflow skills live under `skills/delivery/`; `show-me` is a standalone skill at `skills/show-me/`.

| Skill | Purpose | Role |
|---|---|---|
| start-task | Route a request to the workflow type that fits it, or to none, and create the task | entry point |
| run-task | Drive a task through its workflow one fresh-context phase at a time | orchestrator |
| create-research-questions | Draft the query plan for the research phase | phase |
| iterate-research-questions | Revise the research questions from feedback | phase |
| create-research | Document the current state that the questions ask about | phase |
| iterate-research | Revise the research artifact from feedback | phase |
| create-design-discussion | Compare approaches and record the design decision | phase |
| iterate-design-discussion | Revise the design discussion from feedback | phase |
| create-prd | Write a product requirements document with the user | phase |
| iterate-prd | Revise the PRD from feedback | phase |
| create-tdd | Write a technical design document with the user | phase |
| iterate-tdd | Revise the TDD from feedback | phase |
| create-structure-outline | Write a phased implementation outline | phase |
| iterate-structure-outline | Revise the outline from feedback | phase |
| create-plan | Write a phased implementation plan with verification per phase | phase |
| iterate-plan | Revise the plan from feedback | phase |
| create-epic-plan | Split a large request into dependent child tasks | phase |
| start-epic-delivery | Create child task directories and start the first wave | phase |
| configure-workspaces | Write the workspace config that defines task worktrees | utility |
| setup-worktree | Create the task worktree from the workspace config | phase |
| implement-plan | Implement the plan phase by phase through child workers | phase |
| implement-outline | Implement the outline phase by phase through child workers | phase |
| iterate-implementation | Apply feedback to an implementation | phase |
| review-code | Review the diff against the merge target | phase (optional) |
| fix-code-review | Repair validated review findings | phase (optional) |
| ci-commit | Commit implementation work with explicit paths | utility |
| describe-pr | Write and publish the pull request description | phase |
| resolve-pr-reviews | Work through pull request review threads | phase |
| review-artifact-comments | Apply feedback to an artifact one item at a time | utility |
| record-evidence | Record narrated, annotated video proof on screens, emulators, simulators, or headless browsers; compose devices side by side | phase (optional) |
| show-me | Explain the current topic with a focused visual | utility |
| agent-codebase-locator | Find files, directories, tests, and entry points | worker |
| agent-codebase-analyzer | Explain how a narrow area of code behaves now | worker |
| agent-codebase-pattern-finder | Find existing examples and conventions | worker |
| agent-web-search-researcher | Check external documentation and references | worker |
| agent-implementer | Implement one plan phase and report checks | worker |
| agent-outline-implementer | Implement one outline phase and report markers | worker |
| agent-implementation-reviewer | Compare the implementation with its plan | worker |

## Adding skills

Add `skills/<group>/<name>/SKILL.md` (a skill that belongs to a workflow goes in that workflow's group, `skills/delivery/` today) or `skills/<name>/SKILL.md` for a standalone skill, with frontmatter `name` (equal to the directory) and `description`, link the two shared documents on line 6 like the existing skills, keep templates under `references/`, and run `npm test`. A skill that belongs to a workflow gets a row in that workflow's document under `workflows/`; a skill that belongs to no workflow needs nothing else. Skill names stay unique across groups because every install copies skills into one flat directory.

## License

MIT. See [LICENSE](LICENSE).
