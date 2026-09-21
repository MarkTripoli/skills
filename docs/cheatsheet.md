# Cheat sheet

First run? Use [getting started](getting-started.md). Full workflow details: [delivery reference](../workflows/delivery.md).

## Install

Requires Node 20.12 or newer. Run in your terminal:

```sh
npx github:MarkTripoli/skills
npx github:MarkTripoli/skills codex --skill create-plan --yes
npx github:MarkTripoli/skills portable --atomic --project --yes
```

| Option | Effect |
|---|---|
| `claude-code`, `codex`, `oh-my-pi`, `pi`, `portable`, `all` | Choose an agent; `portable` means plain skill files, `all` selects all four agents |
| `--skill <name>`, `-s <name>` | Select skills; repeat for more, or use `'*'` for all |
| `--atomic` | Add the optional workflow; requires all skills and separately installed Atomic |
| `--project` | Install in this repository |
| `--global` | Install for the user; default |
| `--dry-run` | Show changes without writing |
| `--yes`, `-y` | Skip menus and confirmation; default to detected agents and all skills |
| `--uninstall` | Remove selected managed files; add `--atomic` to include the workflow |
| `--list`, `--help` | List skills or show usage, then stop |

Uninstall does not delete task documents or worktrees.

### Configure model routing

```text
/configure-model-routing
```

Use this model-invoked skill when no valid candidate profile exists. It writes the project profile or the user file named by `SKILLS_MODEL_CANDIDATES_FILE`, then verifies it through `route-model`.

### File locations

| Agent | User skills | User workers |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` |
| Codex | `~/.agents/skills/` | `~/.codex/agents/` plus a managed config block |
| Oh My Pi | `~/.omp/agent/skills/` | `~/.omp/agent/agents/` |
| Pi | `~/.pi/agent/skills/` | Worker roles run in the same session |
| Portable | `~/.agents/skills/` | Worker roles run in the same session |

Project skills use `.claude/skills/`, `.agents/skills/`, `.omp/skills/`, or `.pi/skills/`. Claude Code and Oh My Pi also use local `agents/` directories. The Codex project installer skips workers and user config; install without `--project` for those.

Atomic installs `workflows/skills-delivery/` and its sibling `skills-delivery.mjs` under `~/.atomic/agent/`, or `.atomic/` for project installs. `ATOMIC_CODING_AGENT_DIR` changes the user root. The workflow reads all portable skills from `~/.agents/skills`, project `.agents/skills`, or your `skills_dir` input.

### Other install methods

- Claude Code plugin: `/plugin marketplace add MarkTripoli/skills`, then `/plugin install marktripoli-skills@marktripoli`.
- [skills.sh](https://skills.sh/MarkTripoli/skills): `npx skills@latest add MarkTripoli/skills` installs skills only.
- Pinned release: `npx github:MarkTripoli/skills#v<version>`.
- Checkout: `node scripts/install.mjs`. Build files under `dist/` with `npm run build -- --runtime <claude-code|codex|oh-my-pi|pi|portable>`.

## Manual phases

```text
/create-research-questions
/create-research @01-research-questions-example.md
/create-design-discussion @02-research-example.md
/create-plan @03-design-discussion-example.md
/implement-plan @04-plan-example.md
/verify-implementation
/review-code
/describe-pr
```

Run each in a **new session**, in the checkout and branch named by the previous reply. Use its actual file names, not these examples. Codex uses `$skill-name`. To revise a document, use its `iterate-*` skill with feedback.

## Atomic launch

After [Atomic setup](getting-started.md#add-optional-atomic-orchestration), run these in Atomic chat:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag" workflow=oneshot model_routing=fixed branch=verbose-flag gates=all
```

Use `key=value`, not `--input`. An explicit `workflow` **and** `model_routing=fixed` avoid JEV, the service that chooses steps or models. See [workflow choices](../workflows/delivery.md#workflow-choices-and-manual-chains), [all inputs](../workflows/delivery.md#inputs), and [model selection](model-routing.md).

## Atomic inspect and steer

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` opens approval prompts. `quit` preserves resumable work; it does not delete it. Runs without an interactive screen require `gates=none`. See [control rules](../workflows/delivery.md#gates-and-native-controls).

## Existing tasks, PR feedback, and epic waves

```text
/workflow delivery request="Continue implementation" workflow=lean task_dir=.agents/tasks/example
/workflow delivery request="Address PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/example
/workflow delivery request="Start ready children" workflow=epic-wave task_dir=.agents/tasks/example-epic gates=none
```

These reuse saved task documents. Child tasks wait for prerequisite branches to merge; a pull request description does not prove a merge.

## Where things live

- Skills: `skills/delivery/<name>/SKILL.md` and `skills/show-me/`.
- Workflow: `atomic/workflows/delivery.ts`; helpers: `atomic/lib/`.
- Task documents: `.agents/tasks/<slug>/task.md` and numbered files on the task branch.

Worktrees belong to their owner. Do not delete old or cancelled-run worktrees as installation cleanup.
