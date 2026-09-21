---
name: deliver
description: Run for /deliver requests, for `/deliver --run <run-id>`, or when a request needs a delivery chain. Route to a workflow and review policy; use optional Atomic orchestration or open a task for independent skill sessions.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

Choose a delivery chain and review policy. Atomic is optional; every phase also works independently in Claude Code, Codex, Oh My Pi, Pi, or a portable installation. This entry skill opens or routes the task, rather than implementing it.

## 1. Take the request or reconnect

For `--run <run-id>`, use Atomic's native `/workflow status <run-id>` and `/workflow connect <run-id>` in Atomic. Read the reported state and artifact paths. A connection inspects the existing run; it does not approve a gate or resume paused work. Outside Atomic, give those native commands as inline text for the user to enter there. Never fabricate a run id or start a replacement run. Use `references/deliver_atomic_answer.md` for an active run and `references/deliver_ended_answer.md` for a terminal result.

Otherwise take the request verbatim, stripping a leading `/deliver`. Ask for the request when it is empty. Its first line is the title. Honor an explicit manual/no-workflow request even when Atomic is installed.

## 2. Route the request

Where available, pass only the request on stdin to these helpers, installed beside this skill (`skills/delivery` in a checkout):

- `node <skills dir>/typed-judgment/judge.mjs route-workflow --json -` returns `{workflow, suggested, confidence, probabilities}`. Below 0.8 confidence, `workflow` is already `full`.
- `node <skills dir>/typed-judgment/judge.mjs autonomy --json -` returns `{autonomy, suggested, confidence}`. Map `autonomy` directly to the `gates` value `all`, `none`, `plan`, or `pr`; do not expand it into a comma-separated list.

An explicitly named workflow or gate policy wins. The helper does not return `program`: choose it when the request names it, or when a `prd` request contains `prd` or `requirements` and also `epic`, `children`, `issues`, or `pull requests`.

| Workflow | Use when | First manual action |
|---|---|---|
| `oneshot` | Small change, stated expected behavior, verification available, no design choice. | Implement, verify, and commit the requested change; then `/review-code`. |
| `bugfix` | Observed behavior differs from expected and needs a reproduction. | `/reproduce-bug` |
| `lean` | Shape is clear, with several files and an ordering. | `/create-research-questions` |
| `full` | Competing approaches, cross-module impact, migration, or interface design. | `/create-research-questions` |
| `prd` | Product requirements, users, or edge behavior need definition. | `/create-research` |
| `epic` | Several independently mergeable deliverables. | `/create-research-questions` |
| `program` | Product definition followed by epic children. | `/create-research` |
| `resolve-reviews` | An existing pull request needs review threads resolved. | `/resolve-pr-reviews` |
| `epic-wave` | An existing epic has ready children to continue. | Read its epic-delivery receipt and open each ready child's first skill. |

If the helper is absent or exits nonzero, choose from this table and use `gates: all` unless the request explicitly chooses another policy. Say once that judgments were skipped. Do not require Node, a key, or a sibling skill to route manually.

When confidence is below 0.8, the top two probabilities differ by less than 0.2, or two chains fit equally, ask one question naming those choices and the proposed gates. Otherwise continue without asking. Route on the request, not repository exploration.

## 3. Optional Atomic launch

Use this branch only when Atomic and the collection's registered `delivery` workflow are available and orchestration is wanted. Check `/workflow list` and `/workflow inputs delivery` in Atomic first. A binary alone does not establish that the workflow is installed. Installation is opt-in with `--atomic`; normal skill installation has no workflow dependency.

Start through Atomic's native command surface:

```text
/workflow delivery request="<request>" workflow=<workflow> gates=<gates>
```

Encode string inputs as JSON strings, preserving quotes, newlines, and backslashes. This is a command entered in Atomic, not a shell subcommand. From another coding runtime, present it inline for the user to enter in Atomic; report that launch is pending, not running. Do not type it into an unrelated agent prompt. When a native workflow tool is available, inspect its installed input contract and launch semantics before using it; do not invent shell equivalents.

The registered inputs are:

| Input | Type and default |
|---|---|
| `request` | Required string. |
| `task_dir` | Optional existing task-directory string. |
| `skills_dir` | Optional skill root; defaults to portable `~/.agents/skills`. Project installs use the project's `.agents/skills`; pass that absolute path. |
| `workflow` | `auto` by default; also `oneshot`, `lean`, `full`, `prd`, `bugfix`, `epic`, `program`, `resolve-reviews`, `epic-wave`. |
| `gates` | `all` by default; also `none`, `plan`, `pr`. |
| `model` | `openai-codex/gpt-5.6-luna-fast` by default; ordinary economical baseline and mandatory for every code-writing or unknown phase. Explicit values are honored. |
| `model_routing` | `auto` by default; `auto` asks JEV whether the ordinary model or `reasoning_model` is adequate for eligible non-writing stages, while `fixed` selects `model` directly with no JEV call. |
| `reasoning_model` | `openai-codex/gpt-5.6-sol` by default; compatibility escalation candidate for eligible stages. |
| `available_models` | Optional legacy exact model identifiers supplied by the caller. Omission preserves the two configured candidates. |
| `model_candidates` | Optional exact `{model,cost,description}` objects consumed by the portable `route-model` helper. |
| `app_test` | `none` by default; also `web`, `ios`, `android`. |
| `app_target` | Optional URL, bundle id, package, or application path string. |
| `verify` | Boolean, default `true`. |
| `max_steps` | Number, default `40`. |
| `branch` | Optional task branch string. |
| `base` | Optional merge-target branch string. |

Pass an existing task directory rather than opening a duplicate task. Resolve it, read `<task_dir>/task.md`, and preserve its `slug`, request body, `workflow`, and `base` metadata; do not classify the directory path as request text or overwrite `task.md`. Reuse its branch and merge target. `resolve-reviews` and `epic-wave` continue the saved task without changing those fields. Supply application inputs only when requested. Headless execution requires `gates=none`; approvals require an interactive Atomic session. An explicit workflow does not disable stage-model JEV; use `model_routing=fixed` when the run must be JEV-free.

Atomic owns run state and approvals. Inspect with `/workflow status <run-id>`; open the graph and answer pending prompts with `/workflow connect <run-id>`. Use `/workflow pause <run-id>` to pause, `/workflow quit <run-id>` to stop gracefully while preserving resumability, and `/workflow resume <run-id>` to continue saved work. Quit is not deletion or abandonment. Never interpret an ordinary chat reply or a phase's manual command fence as an Atomic approval. Never add a polling steward, shell response command, or automated Herdr gate pane.

Reply with `references/deliver_atomic_answer.md`, filling only observed run information. When no run was launched, state the prerequisite or pending native command instead of a run id. Every new skill stage gets a fresh context; resuming an interrupted active stage may restore that stage's own session. Completed phases pass artifacts, not conversation.

## 4. Manual fallback

Use this branch when Atomic is absent, its `delivery` workflow is unavailable, or the user chooses manual operation. All gates are human reviews between independent skill sessions; `gates=none` does not make a manual chain advance automatically.

For a new task, derive its slug from the title: lowercase, replace punctuation with spaces, drop `a an the to of for in on and or with that this add make create please fix bug`, and join the first four remaining words with `-`. Fall back to the first four original words, then `task`. Use `-2`, `-3`, and so on for collisions. Branches for `epic` and `program` use `epic-<slug>`.

Open the task worktree per the conventions before writing `.agents/tasks/<slug>/task.md`. Respect the documented worktree exceptions and an explicitly supplied task directory. Set `slug`, `title`, `workflow`, `gates`, `routed_by: deliver`, `created`, and `route_confidence` when known; preserve the request as the body. Commit `task.md` with its explicit path as `docs(task): open <slug>`, applying the conventions' ignore-file rule. Outside git, save it in place and state that it is uncommitted.

An existing task reuses its directory, branch, and artifacts. For `epic-wave`, read the epic-delivery receipt and dependency merge state; follow `start-epic-delivery`'s manual child handoffs without recreating child directories. Optional automated child launching belongs to the Atomic workflow, not this skill.

Before the first manual handoff, route the first phase with the portable helper, for example `printf '%s\n' '{"skillsDir":"<skills-dir>","phase":"<next-skill>","cwd":"<project>"}' | node <skills-dir>/route-model/route-model.mjs --candidates <json-file> --economy <model>`. It uses explicit candidates when supplied, then `SKILLS_MODEL_CANDIDATES_FILE`, then `<project>/.agents/model-candidates.json`. The profile shape is `{economy,candidates,routing?}` and candidates are ordered weakest to strongest. Report `Recommendation only: <model>` because manual copy-paste cannot enforce a model. If no valid profile exists, direct the user to `/configure-model-routing`, then state that no model was enforced.

Reply with `references/deliver_hand_answer.md`. Fill the chain from [workflows/delivery.md](https://github.com/MarkTripoli/skills/blob/main/workflows/delivery.md), the task location from observed state, and `{next_command}` from the table. For `oneshot`, explain that implementation precedes `/review-code`; never claim it has happened. For an epic wave, name the ready children and select one child's first skill for the final fence, with its task directory stated above it. Keep the final manual command fence and fresh-session handoff intact.

## References

Read from this skill directory: `references/deliver_atomic_answer.md`, `references/deliver_ended_answer.md`, `references/deliver_hand_answer.md`.
