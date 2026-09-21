# Cheat sheet

First time? Use [getting started](getting-started.md). Full workflow: [delivery reference](../workflows/delivery.md).

## Install

Need Node 20.12+. Type in terminal:

```sh
npx github:MarkTripoli/skills
npx github:MarkTripoli/skills codex --skill create-plan --yes
npx github:MarkTripoli/skills portable --atomic --project --yes
```

| Option | Effect |
|---|---|
| `claude-code`, `codex`, `oh-my-pi`, `pi`, `portable`, `all` | Pick agent. `portable` = plain skill file. `all` = pick all four |
| `--skill <name>`, `-s <name>` | Pick skill. Repeat for more, or `'*'` for all |
| `--atomic` | Add extra workflow. Need all skill + Atomic installed apart |
| `--project` | Install in this repo |
| `--global` | Install for user. Default |
| `--dry-run` | Show change, no write |
| `--yes`, `-y` | Skip menu + confirm. Default to found agent + all skill |
| `--uninstall` | Remove picked managed file. Add `--atomic` for workflow too |
| `--list`, `--help` | List skill or show usage, then stop |

Uninstall no kill task doc or worktree.

### Configure model routing

```text
/configure-model-routing
```

Use this model-called skill when no good candidate profile exist. Codex users invoke `$configure-model-routing`; other harness invoke `/configure-model-routing`. It write project profile or user file named by `SKILLS_MODEL_CANDIDATES_FILE`, then check it with `route-model`.


For allowed recorded look-and-fix, install companion plus recorder dependency:

```sh
npx github:MarkTripoli/skills oh-my-pi --skill iterate-evidence --project --yes
```

Then run `/iterate-evidence @<task-directory-or-iteration-receipt>` with wanted behavior + fix power. Default: three fix round. `0`: look only. Picked uninstall take companion, leave recorder. Use this repo installer for dependency closure. Plain skill copy no guarantee it. See [the independent loop](getting-started.md#inspect-and-repair-recorded-behavior).
### File locations

| Agent | User skills | User workers |
|---|---|---|
| Claude Code | `~/.claude/skills/` | `~/.claude/agents/` |
| Codex | `~/.agents/skills/` | `~/.codex/agents/` plus managed config block |
| Oh My Pi | `~/.omp/agent/skills/` | `~/.omp/agent/agents/` |
| Pi | `~/.pi/agent/skills/` | Worker role run in same session |
| Portable | `~/.agents/skills/` | Worker role run in same session |

Project skill use `.claude/skills/`, `.agents/skills/`, `.omp/skills/`, or `.pi/skills/`. Claude Code + Oh My Pi also use local `agents/` dir. Codex project installer skip worker + user config. Install without `--project` for those.

Atomic install `workflows/skills-delivery/` and brother `skills-delivery.mjs` under `~/.atomic/agent/`, or `.atomic/` for project install. `ATOMIC_CODING_AGENT_DIR` change user root. Workflow read all portable skill from `~/.agents/skills`, project `.agents/skills`, or your `skills_dir` input.

### Other install methods

- Claude Code plugin: `/plugin marketplace add MarkTripoli/skills`, then `/plugin install marktripoli-skills@marktripoli`.
- [skills.sh](https://skills.sh/MarkTripoli/skills): `npx skills@latest add MarkTripoli/skills` install skill only.
- Pinned release: `npx github:MarkTripoli/skills#v<version>`.
- Checkout: `node scripts/install.mjs`. Build file under `dist/` with `npm run build -- --runtime <claude-code|codex|oh-my-pi|pi|portable>`.

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

Run each in **new session**, in checkout + branch named by last reply. Use its real file name, not these example. Codex use `$skill-name`. To change doc, use its `iterate-*` skill with feedback.

## Atomic launch

After [Atomic setup](getting-started.md#add-optional-atomic-orchestration), run these in Atomic chat:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag" workflow=oneshot model_routing=fixed branch=verbose-flag gates=all
```

Use `key=value`, not `--input`. Clear `workflow` **and** `model_routing=fixed` dodge JEV, the thing that pick step or model. See [workflow choices](../workflows/delivery.md#workflow-choices-and-manual-chains), [all inputs](../workflows/delivery.md#inputs), and [model selection](model-routing.md).

## Atomic inspect and steer

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` open approval prompt. `quit` keep resumable work. It no kill it. Run without interactive screen need `gates=none`. See [control rules](../workflows/delivery.md#gates-and-native-controls).

## Existing tasks, PR feedback, and epic waves

```text
/workflow delivery request="Continue implementation" workflow=lean task_dir=.agents/tasks/example
/workflow delivery request="Address PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/example
/workflow delivery request="Start ready children" workflow=epic-wave task_dir=.agents/tasks/example-epic gates=none
```

These reuse saved task doc. Child task wait for prereq branch to merge. Pull request text no prove merge.

## Where things live

- Skills: `skills/delivery/<name>/SKILL.md` and `skills/show-me/`.
- Workflow: `atomic/workflows/delivery.ts`; helper: `atomic/lib/`.
- Task doc: `.agents/tasks/<slug>/task.md` + numbered file on task branch.

Worktree belong to owner. No kill old or dead-run worktree as install cleanup.