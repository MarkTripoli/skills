# Getting started

Start with one skill: instructions your coding agent follows for one task. Add Atomic later if you want it to run several steps.

## Install only what you need

Requires Node 20.12 or newer. In your terminal:

```sh
npx github:MarkTripoli/skills
# Or choose one agent and skill without menus:
npx github:MarkTripoli/skills oh-my-pi --skill create-research-questions --yes
```

Repeat `--skill` to select more skills. Add `--project` to install only in this repository. See [all install options](cheatsheet.md#install).

## Run a phase by hand

1. Open your coding agent in the repository you want to change.
2. Run `/create-research-questions Explain how login works in this project.` In Codex, start with `$create-research-questions` instead.
3. Read the saved task document, called an **artifact**, and the reported checks and limits.
4. Open a new session in the checkout and branch named in the reply. Run its next command.

A new task normally gets a **worktree**: a separate checkout on its own branch. Saved documents carry facts between sessions. To revise one, use its `iterate-*` skill with your feedback. Use the [common sequences](../workflows/delivery.md#workflow-choices-and-manual-chains) as a guide, not a requirement to install every skill.

## Add optional Atomic orchestration

1. [Install Atomic](https://docs.bastani.ai/getting-started/installation) and [sign in](https://docs.bastani.ai/getting-started/authentication).
2. Install all skills and the workflow:

   ```sh
   npx github:MarkTripoli/skills portable --atomic --yes
   ```

   Add `--project` for a repository-only install. `--atomic` requires all skills.
3. Start `atomic` in your project. Run these **inside Atomic**, not in your shell:

   ```text
   /workflow reload
   /workflow list
   /workflow inputs delivery
   /workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot model_routing=fixed gates=all branch=verbose-flag
   ```

The listed workflow must be `delivery`. Listing it proves installation, not successful execution. This example fixes the step sequence and model choice, so routing needs no JEV service.

## Automatic phase selection

JEV is a service that chooses steps or models. `workflow=auto` lets it choose the next step. Separately, `model_routing=auto` lets it choose a model for allowed steps. Both default to `auto`.

Automatic choices need a TypeSafe key; keep it outside the project. For setup, model defaults, and failure rules, see [model selection](model-routing.md). To avoid JEV routing, choose an explicit workflow **and** `model_routing=fixed`.

## Answer gates and inspect progress

A **gate** is an approval step. `gates=all` is the default. Read the named document before approving; request changes to revise it.

```text
/workflow status
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` opens pending prompts. `pause` and `quit` preserve work; `resume` needs saved Atomic run state, not only task files. Runs without an interactive screen require `gates=none`. See [approval choices and controls](../workflows/delivery.md#gates-and-native-controls).

## Verification and application testing

`verify=true` checks the implementation before code review. Add `app_test=web|ios|android` and `app_target` to test the real app. The running machine needs the browser, simulator, or emulator. Missing tools mean blocked work, not a pass.

See [verification](verification.md) and [app testing](app-testing.md) for commands and recorded results.

## Continue existing work

Use `task_dir=.agents/tasks/<slug>` from that task's checkout and branch. Do not create another task because a chat ended. Use `workflow=resolve-reviews` for pull request feedback or `workflow=epic-wave` after prerequisite branches merge. The workflow does not merge pull requests.

Old workflow checkpoints cannot become Atomic checkpoints. Preserve their documents and worktrees, then start a new run using those documents. See [ownership rules](../workflows/delivery.md#task-artifact-and-worktree-ownership).
