# Getting started

Start with one skill: instruction coding agent follow for one job. Add Atomic later if want many step.

## Install and discover skills

Use the repository installer (Node 20.12 or newer) to list available skills or install a selection:

```sh
npx github:MarkTripoli/skills --list
npx github:MarkTripoli/skills --skill video-iterative-development --yes
# Choose an agent and skill without menus:
npx github:MarkTripoli/skills oh-my-pi --skill create-research-questions --yes
```

The installer supports Claude Code, Codex, Oh My Pi, Pi, and portable skill files. Add `--project` for project-local installation; home installation is the default. Repeat `--skill` to install more than one skill. See [all install options](cheatsheet.md#install).

For skill files only, skills.sh also supports this collection (Node 22.20 or newer):

```sh
npx skills@latest add MarkTripoli/skills --agent claude-code codex --skill create-research-questions --yes
```

This does not install worker setup or Atomic workflow resources. Use the repository installer for those.

## Video-iterative delivery

- [`video-iterative-development`](../skills/delivery/video-iterative-development/SKILL.md) scopes authenticated backend/API and frontend work to the smallest required layers, then proves changed contracts and real user flows with appropriate evidence.
- [`video-iterative-orchestration`](../skills/delivery/video-iterative-orchestration/SKILL.md) coordinates prioritized, dependency-aware requirements through isolated worktrees, durable run state, recovery, and delivery gates. It uses the development skill for each implementation.

## Slack visibility

[`agent-slack-control-plane`](../skills/delivery/agent-slack-control-plane/SKILL.md) describes sparse feature updates and opt-in work-item run visibility and steering. It does not implement product work. Installing the skill does not by itself enable automatic task threading or provide a Slack daemon; follow the skill's operating contract and use [Slack coordinator](slack-coordinator.md) for the separately installed daemon.

## Run a phase by hand

1. Open coding agent in repo you want change.
2. Run `/create-research-questions Explain how login works in this project.` In Codex, use `$create-research-questions` instead.
3. Read saved task doc, called **artifact**, and reported check and limit.
4. Open new session in checkout and branch named in reply. Run next command.

New task usually get **worktree**: own checkout, own branch. Its `index.json` pick immutable artifact iteration under `artifacts/<kind>/<variant>/`. To change one, use its `iterate-*` skill with your feedback; revision record next iteration, no overwrite history. Use [common sequences](../workflows/delivery.md#workflow-choices-and-manual-chains) as guide, not rule to install every skill.
## Use optional First Sergent

Start `/deliver <your request>` in the project. On a first non-oneshot delivery, answer “Use First Sergent for this delivery?” with **yes** to have a chat liaison coordinate a separate backend, or **no** to keep the ordinary manual or Atomic path. Oneshot skips the question; explicitly ask for First Sergent if you want it there. Codex uses `$deliver`. Keep using the existing task directory to resume; opt-in manual tasks store `liaison: first-sergent` without replacing the request.

With delegated fresh-worker support, `agent-first-sergent` is the default opted-in backend even when Atomic is installed. It keeps gate hashes and step count in local task-owned state, while artifacts carry phase facts and the original task body stays unchanged. Guided PRD/TDD questions or PR action confirmations need an addressable live child session; without one, the worker stops rather than inventing an answer. Explicit Atomic opt-in launches its native controller with `liaison=first-sergent`. Quota and context controls default to `off` for the opted-in backend unless the user selects a policy; legacy `/deliver` keeps its existing path and does not inherit them.

Set `quota_mode=omp` to use native `omp usage --json` availability and headroom filtering before JEV. Provider filtering does not bind an account; report freshness and one explicit account binding are required, and the snapshot is not a concurrency reservation. `quota_mode=agent-router` has no safe production caller in this repository: the upstream Herdr launch does not prove the exact phase prompt, task worktree, and caller account binding, so the selected path is externally blocked.

Set `context_policy=stop-at-60` only when the selected managed transport exposes live `contextUsage` and a child session identity. At or above 60%, the worker saves its artifact and starts a different fresh session; no metric or identity stops at the boundary. Atomic's documented `ctx.task` API has no live child monitor, so it blocks before stage dispatch. Compaction is not a phase handoff.

See [the First Sergent reference](../workflows/delivery.md#optional-first-sergent-at-deliver) for the state and feedback loop and [context management](context-management.md#first-sergent-and-fresh-workers) for transport limits.


## Inspect and repair recorded behavior

Use `iterate-evidence` when you allow both recorded look and code fix, or want continue its receipt. For record with no fix, use `record-evidence`.

```sh
npx github:MarkTripoli/skills oh-my-pi --skill iterate-evidence --project --yes
```

Repo installer pick companion and `record-evidence`, no Atomic. Plain skill-copy installer no promise this dependency closure. Run `/iterate-evidence` with your task, wanted behavior, and allowed fix path. Default allow three fix round; `0` mean look only. Receipt keep finding, recording, check, and stop choice. No recording or no pixel look mean no success.

## Add optional Atomic orchestration

1. [Install Atomic](https://docs.bastani.ai/getting-started/installation) and [sign in](https://docs.bastani.ai/getting-started/authentication).
2. Install all skill and workflow:

   ```sh
   npx github:MarkTripoli/skills portable --atomic --yes
   ```

   Add `--project` for repo-only install. `--atomic` need all skill.
3. Start `atomic` in your project. Run these **inside Atomic**, not in shell:

   ```text
   /workflow reload
   /workflow list
   /workflow inputs delivery
   /workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot model_routing=fixed gates=all branch=verbose-flag
   ```

Listed workflow must be `delivery`. Listing prove install, not good run. This example lock step order and model pick, so routing need no JEV service.

## Configure model routing

Run `/configure-model-routing` when delivery say no good model profile. Codex users run `$configure-model-routing`; other harness use `/configure-model-routing`. Skill ask one question at a time, write project `.agents/model-candidates.json` or user-level file named by `SKILLS_MODEL_CANDIDATES_FILE`, then check saved profile with `route-model`. Pi discovery use `pi --list-models` and Oh My Pi discovery use `omp models --json` only when there; Claude Code and Codex use plain model ID.

## Automatic phase selection

JEV is service that pick step or model. `workflow=auto` let it pick next step. Apart, `model_routing=auto` let it pick model for allowed step. Both default `auto`.

Auto pick need TypeSafe key; keep key outside project. For setup, model default, and fail rule, see [model selection](model-routing.md). To dodge JEV routing, pick explicit workflow **and** `model_routing=fixed`.

## Answer gates and inspect progress

**Gate** is approval step. `gates=all` is default. Read named doc before you approve; ask change to redo it.

```text
/workflow status
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` open waiting prompt. `pause` and `quit` keep work; `resume` need saved Atomic run state, not just task file. Run with no interactive screen need `gates=none`. See [approval choices and controls](../workflows/delivery.md#gates-and-native-controls).

## Verification and application testing

`verify=true` check build before code review. Add `app_test=web|ios|android` and `app_target` to test real app. Machine need browser, simulator, or emulator. Missing tool mean blocked work, not pass.

See [verification](verification.md) and [app testing](app-testing.md) for command and recorded result.

## Run JEV UI by hand

Install standalone `jev-ui` skill with its `typed-judgment` and `record-evidence` dependency. Use browser, Android target, or iOS simulator you pick out loud. Browser control need Node 22+; iOS control need `idb` and caller-owned simulator companion.

```sh
node skills/delivery/jev-ui/scripts/jev-ui.mjs --platform android --target "$ANDROID_SERIAL" --app "$ANDROID_APP" --goal 'Complete the selected app task' --expected 'Expected status'
IDB_COMPANION=/path/to/idb-companion.sock node skills/delivery/jev-ui/scripts/jev-ui.mjs --platform ios --target "$IOS_UDID" --app "$IOS_BUNDLE_ID" --goal 'Complete the selected app task' --expected 'Expected status'
```

## Continue existing work

Use `task_dir=<task-root>/<slug>` from that task checkout and branch. `<task-root>` default `.agents/tasks`; repo exact `<!-- skills:task-root=relative/path -->` directive may change it. No make new task just because chat end. Use `workflow=resolve-reviews` for pull request feedback or `workflow=epic-wave` after prerequisite branch merge. Workflow no merge pull request.

Old workflow checkpoint cannot become Atomic checkpoint. Keep their doc and worktree, then start new run with those doc. See [ownership rules](../workflows/delivery.md#task-artifact-and-worktree-ownership).
