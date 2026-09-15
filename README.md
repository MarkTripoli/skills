# skills

A collection of portable agent skills. Each skill is one directory with a `SKILL.md` that any skill-aware coding agent can load; the skills need nothing but a file system, git, and the agent's own tools. Most of them form a delivery workflow that takes a task from request to merged pull request in fresh-context phases with human gates; the rest are utilities and the child-worker roles the phases delegate to. The collection is organized so unrelated skills and other workflows can be added beside it.

New here? Read [Getting started](docs/getting-started.md), then [Context management](docs/context-management.md) for why every phase runs in its own session and how to do that on your runtime.

## Install

Portable (any runtime that scans `~/.agents/skills/<name>/SKILL.md`, including Codex and Oh My Pi):

```sh
git clone https://github.com/MarkTripoli/skills.git
cp -R skills/skills/* ~/.agents/skills/
```

Runtime-specific trees add the runtime's invocation and worker notes to every skill and generate the worker definitions:

| Runtime | Build | Then |
|---|---|---|
| Claude Code | `npm run build -- --runtime claude-code` | copy per [runtimes/claude-code.md](runtimes/claude-code.md) |
| Codex | `npm run build -- --runtime codex` | copy per [runtimes/codex.md](runtimes/codex.md) |
| Oh My Pi | `npm run build -- --runtime oh-my-pi` | copy per [runtimes/oh-my-pi.md](runtimes/oh-my-pi.md) |

`npm test` validates the collection and runs the token-free simulation of every workflow chain; `npm run eval -- --driver <omp|claude|codex>` measures real agents against the same contract (see [docs/testing.md](docs/testing.md)); `npm run build` writes `dist/<runtime>/` (ignored by git). All use Node 20 or newer and no dependencies.

## How the workflow runs

- A task lives in `.agents/tasks/<slug>/` with a `task.md` and numbered artifacts. The contract is [shared/CONVENTIONS.md](shared/CONVENTIONS.md); the prose rules are [shared/WRITING.md](shared/WRITING.md).
- The chains (`full`, `lean`, `prd`, `oneshot`), the phase table, the human gates, and the review loop are in [workflows/delivery.md](workflows/delivery.md).
- Every phase ends with one fenced command naming the next phase. Run it in a new session, or let `/run-task` do it.

## Context management

Each phase runs in a fresh context and reads only `task.md` plus the artifacts it selects, so no session carries the whole task history; the artifacts on disk are the memory between phases. `/run-task @.agents/tasks/<slug>` drives a task through its chain: it starts each phase in a fresh context, relays only the phase's final reply, and stops at human gates. Backends, in order: a [Herdr](https://github.com/herdr) pane when `HERDR_ENV=1` and `herdr` is installed (the phase runs visibly beside your session and can ask you questions), the runtime's subagent tool, or manual (it prints the prompt for you to run in a new session). `/run-task @<task dir> --status` reports where a task stands. Phase replies are also written to `.agents/tasks/<slug>/replies/NN-<skill>.md`, which is how the orchestrator knows a phase finished and what comes next.

Every reply tells you to start the next phase in a new session. That sentence, the read budget for a phase, and the signs of a degraded context are in the conventions; the per-runtime commands (`/clear`, `/new`, `/context`, `/status`) and what to do when a session degrades are in [docs/context-management.md](docs/context-management.md).

## Docs

- [docs/getting-started.md](docs/getting-started.md): install, first task by hand and with `/run-task`, gates, feedback, worktrees, epics.
- [docs/context-management.md](docs/context-management.md): the phase model, fresh contexts per runtime, recognizing a degraded context, what a runtime plugin could add.
- [docs/testing.md](docs/testing.md): static validation, token-free simulation of every chain, and the eval harness for real agents.
- [workflows/delivery.md](workflows/delivery.md): workflow types, phase table, gates, review loop.
- [shared/CONVENTIONS.md](shared/CONVENTIONS.md) and [shared/WRITING.md](shared/WRITING.md): the contract every skill follows.
- [runtimes/](runtimes/): per-runtime invocation notes and install steps.

## Skills

| Skill | Purpose | Role |
|---|---|---|
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
| review-code | Review the diff against the merge target | phase |
| fix-code-review | Repair validated review findings | phase |
| ci-commit | Commit implementation work with explicit paths | utility |
| describe-pr | Write and publish the pull request description | phase |
| resolve-pr-reviews | Work through pull request review threads | phase |
| review-artifact-comments | Apply feedback to an artifact one item at a time | utility |
| show-me | Explain the current topic with a focused visual | utility |
| agent-codebase-locator | Find files, directories, tests, and entry points | worker |
| agent-codebase-analyzer | Explain how a narrow area of code behaves now | worker |
| agent-codebase-pattern-finder | Find existing examples and conventions | worker |
| agent-web-search-researcher | Check external documentation and references | worker |
| agent-implementer | Implement one plan phase and report checks | worker |
| agent-outline-implementer | Implement one outline phase and report markers | worker |
| agent-implementation-reviewer | Compare the implementation with its plan | worker |

## Adding skills

Add `skills/<name>/SKILL.md` with frontmatter `name` (equal to the directory) and `description`, link the two shared documents on line 6 like the existing skills, keep templates under `references/`, and run `npm test`. A skill that belongs to a workflow gets a row in that workflow's document under `workflows/`; a skill that belongs to no workflow needs nothing else.

## License

MIT. See [LICENSE](LICENSE).
