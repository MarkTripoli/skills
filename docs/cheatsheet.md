# Cheat sheet

Independent skills first; optional Atomic orchestration second. Long form: [getting started](getting-started.md) and [delivery reference](../workflows/delivery.md).

## Install

```sh
npx github:MarkTripoli/skills
npx github:MarkTripoli/skills codex --skill create-plan --yes
npx github:MarkTripoli/skills portable --atomic --yes
npx github:MarkTripoli/skills portable --atomic --project --yes
```

- Default: skills/workers only; no Atomic requirement.
- `--skill <name>`: repeatable independent selection.
- `--atomic`: opt into the workflow; requires all skills and a separately installed Atomic runtime.
- `--project`: local skills and workflow resources, not a hidden dependency on home-directory skills.
- `--dry-run`: inspect the plan; `--yes`: skip menus and confirmation.
- `--uninstall`: select the managed resources to remove; add `--atomic` to select the optional workflow entry and tree. It does not delete task artifacts or worktrees.

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

Use the actual artifact names from the preceding handoff, not these example names. Codex uses `$skill-name`. Open a fresh session in the handoff's checkout and branch each time. To change an artifact first, use its `iterate-*` skill with feedback.

## Atomic launch

Install/authenticate Atomic from its [official guide](https://docs.bastani.ai/getting-started/installation). Run `atomic` in the project, then use these **chat commands**:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag" workflow=oneshot branch=verbose-flag gates=all
/workflow delivery request="Diagnose and fix the missing config exit code" workflow=bugfix branch=config-exit-code
/workflow delivery request="Compare and implement plugin loading approaches" workflow=full branch=plugin-loader gates=plan
```

`workflow` choices: `auto`, `oneshot`, `lean`, `full`, `prd`, `bugfix`, `epic`, `program`, `resolve-reviews`, `epic-wave`.

| Input | Default | Purpose |
|---|---|---|
| `request` | required | Task outcome |
| `task_dir` | new task or existing directory | Reuse `task.md` and artifacts; preserve its request, `slug`, `workflow`, `base`, and branch |
| `skills_dir` | install-specific portable root | Complete skill collection |
| `workflow` | `auto` | Dynamic JEV selection or explicit chain |
| `gates` | `all` | `all`, `none`, `plan`, `pr` |
| `model` | `openai-codex/gpt-5.6-luna-fast` for code-writing stages | Stage model override; other blank values use Atomic's configured model |
| `verify` | `true` | Independent implementation verification |
| `app_test` | `none` | `web`, `ios`, `android`, or `none` |
| `app_target` | optional | URL/app id/path |
| `max_steps` | `40` | Skill-session bound including revisions |
| `branch`, `base` | optional | New task's branch and merge base |

Use `key=value`, not `--input`. Headless mode requires `gates=none`. `auto` requires a working JEV helper key; an explicit chain does not require JEV routing. The helper reads `TYPESAFE_API_KEY`, `TYPESAFE_API_KEY_FILE`, or `~/.config/typesafe/api_key`.

## Atomic inspect and steer

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

Answer human prompts through the native UI reached by `connect`. `quit` pauses gracefully and preserves resumable progress; it is not deletion. There are no repository shell approve/reject/wait commands. See [official command semantics](https://docs.bastani.ai/workflows/operations#workflow-commands).

## Existing tasks, PR feedback, and epic waves

```text
/workflow delivery request="Continue implementation" workflow=lean task_dir=.agents/tasks/example
/workflow delivery request="Address PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/example
/workflow delivery request="Start ready children" workflow=epic-wave task_dir=.agents/tasks/example-epic gates=none
```

The workflow reuses existing task artifacts. Epic children need actual merged dependencies; a PR description alone is not merge evidence. Review and merge externally before starting the next wave.

## Where things live

- Canonical source: `skills/delivery/<name>/SKILL.md`, `skills/show-me/`.
- Portable install: `~/.agents/skills/`; project install: `.agents/skills/`.
- Optional workflow source: `atomic/workflows/delivery.ts`, helpers `atomic/lib/`.
- Installed workflow: `<agentDir>/workflows/skills-delivery/` plus sibling `skills-delivery.mjs`; default agentDir `~/.atomic/agent`, override `ATOMIC_CODING_AGENT_DIR`. Project location: `.atomic/workflows/`.
- Task history: `.agents/tasks/<slug>/task.md` and numbered artifacts on the task branch.
- Worktrees persist until their owner deliberately removes them after inspecting/merging their work. Historical cancelled-run worktrees are not migration cleanup targets.
