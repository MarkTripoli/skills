# Getting started

Start with independent skills. Add Atomic only if you want automated phase selection, fresh-stage execution, and native approval gates. Manual invocation and handoff remain available without Atomic. Neither choice changes the task/artifact format.

## Install only what you need

The installer requires Node 20.12+:

```sh
npx github:MarkTripoli/skills
# Or choose one runtime and one skill without menus:
npx github:MarkTripoli/skills oh-my-pi --skill create-research --yes
```

Choose Claude Code, Codex, Oh My Pi, Pi, or portable. `--skill` is repeatable; `--project` writes a project-local installation. Ordinary installation adds no Atomic dependency and no workflow. See the [README destination table](../README.md#install).

## Run a phase by hand

1. Open your coding agent in the repository you want to change.
2. Invoke a skill with the request, such as `/create-research-questions` (Codex: `$create-research-questions`). You can also pass an existing task directory or the artifact that phase consumes.
3. Read its saved artifact and the reply's verification and known-limits sections. A new task normally gets its own worktree; the reply gives the actual checkout and branch.
4. Open a fresh session at that location and run the fenced next command. For revisions, invoke the matching `iterate-*` skill with the artifact and feedback instead.

A phase's saved artifact, not its conversation, carries memory forward. The [manual chains](../workflows/delivery.md#workflow-choices-and-manual-chains) give common sequences; you do not need every phase for every task. Install a suggested next skill only when you need it.

## Add optional Atomic orchestration

1. Install and authenticate Atomic using its [installation](https://docs.bastani.ai/getting-started/installation) and [authentication](https://docs.bastani.ai/getting-started/authentication) guides.
2. Install the entire skill collection plus the integration:

   ```sh
   npx github:MarkTripoli/skills portable --atomic --yes
   ```

   Add `--project` for project-local `.agents/skills/` and `.atomic/workflows/` resources. The global workflow tree goes to `~/.atomic/agent/workflows/skills-delivery/` unless `ATOMIC_CODING_AGENT_DIR` overrides the agent directory. The adjacent managed `skills-delivery.mjs` entry makes the nested source discoverable.

3. Start `atomic` from the target repository. In its chat, inspect the installed workflow before launching:

   ```text
   /workflow reload
   /workflow list
   /workflow inputs delivery
   ```

   Confirm the registered name is `delivery`. Discovery checks registration, not live provider access or completion of a delivery task.

4. For a small specified change, choose an explicit chain:

   ```text
   /workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot gates=all branch=verbose-flag
   ```

   These are native Atomic chat commands. There is no shell `atomic workflow run` wrapper in this collection.

## Automatic phase selection

`workflow=auto` (the default) asks JEV what phase to run next from the request and current artifacts. It needs the existing typed-judgment helper's TypeSafe key: `TYPESAFE_API_KEY`, the file named by `TYPESAFE_API_KEY_FILE`, or `~/.config/typesafe/api_key`. Store secrets outside the project. Missing or unavailable JEV judgment stops automatic routing visibly; choose an explicit workflow for a deterministic phase chain rather than expecting a fabricated fallback decision.

Stage-model routing is separate. `model` defaults to `openai-codex/gpt-5.6-luna-fast` as the ordinary economical baseline and is mandatory for code-writing and unknown phases. `reasoning_model` defaults to `openai-codex/gpt-5.6-sol`; `model_routing=auto` (the default) may ask JEV to choose `economy` (the ordinary model) or `reasoning` for eligible non-writing phases. For an explicit non-`auto` workflow, use `model_routing=fixed` to select `model` directly with no stage-model JEV call. Explicit `model` and `reasoning_model` values are honored where permitted; an explicit `workflow` alone does not make stage selection JEV-free. Full [inputs and controller contract](../workflows/delivery.md#inputs).

## Answer gates and inspect progress

```text
/workflow status
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

Connect opens the graph and pending human prompts. Review the named artifact before approving; request changes in the native prompt to run a revision stage. Pause and quit preserve resumable work; neither deletes a task worktree. Resume depends on saved Atomic run state, not just the existence of task files. See [official operations](https://docs.bastani.ai/workflows/operations).

`gates=all` is the default. `plan` retains planning/reproduction review, `pr` retains only PR-description review, and `none` performs no human UI calls. **Headless execution requires `gates=none`.** Gates are not a comma-separated list.

## Verification and application testing

`verify=true` independently checks implementation before code review. `app_test=web|ios|android` adds UI testing; `app_target` supplies a URL, app path, or application id. The machine running the stage needs the actual browser, simulator, or emulator. A missing prerequisite is blocked work, not a pass.

```text
/workflow delivery request="Add a settings toggle" workflow=lean app_test=web app_target="http://localhost:3000" branch=settings-toggle
```

Read [verification](verification.md) and [app testing](app-testing.md) for the evidence each phase records.

## Continue existing work

Pass `task_dir=.agents/tasks/<slug>` to reuse saved task artifacts. Run it from the correct checkout and branch; do not start a second task merely because an earlier chat ended. `workflow=resolve-reviews` handles an existing PR round; `workflow=epic-wave` revisits an epic after prerequisite branches have merged. Children run in separate worktrees; the workflow does not merge their PRs.

Older engine checkpoints are not Atomic checkpoints. Preserve their task artifacts and worktrees, then start a new Atomic run from those artifacts if desired. Published changelog entries and `.agents/tasks/` are deliberate historical records, not current operating instructions. Installation changes do not authorize a global worktree or state-directory purge.
