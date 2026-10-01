# Getting started

Start with one skill: instruction agent follow for one job.

## Install only what you need

Need Node 20.12+. Terminal:

```sh
npx github:MarkTripoli/skills
# Or choose one agent and skill without menus:
npx github:MarkTripoli/skills oh-my-pi --skill create-research-questions --yes
```

Repeat `--skill` for more skill. `--project` = this-repo-only install. See [all install options](cheatsheet.md#install).

Skills are installed copies, not live links to this checkout. Refresh the complete delivery chain after an update and start a new session; see [installation refresh](cheatsheet.md#other-install-methods). Partial installs bring their executable contract dependencies.

GitLab delivery need `glab` authed for repo host (`glab auth login --hostname gitlab.com` here). Private repo install need Git credentials for host.

## Run a phase by hand

1. Open coding agent in repo to change.
2. Run `/create-research-questions Explain how login works in this project.` Codex: `$create-research-questions`.
3. Read saved task doc (**artifact**), plus reported check and limit.
4. Open new session in checkout and branch named in reply. New branch: `<dev-name>/<issue-key-if-known>-<short-description>`; existing task branch keep name. Run next command.

New task usually get **worktree**: own checkout, own branch. Saved doc carry fact between session. Change one: its `iterate-*` skill plus feedback. [Common sequences](../workflows/delivery.md#workflow-choices-and-manual-chains) = guide, not rule to install every skill.

## Use `/deliver`

Start `/deliver <your request>` in the project. It picks the workflow from the request and the [size check](../shared/SLICING.md), saves the task, then runs it as one orchestrator session: builders implement, and a fresh reviewer on the strongest model checks each result. Every phase also works standalone. Codex uses `$deliver`. Resume with `/deliver <task-dir>`. `gates` is `plan` (default) or `none`; older `all` and `mr` read as `plan`.

The chain checks executable delivery prerequisites, prepares authentic baseline evidence before changing existing behavior, and requires inspected, revision-bound final proof before publication. Use the [delivery status command](../workflows/delivery.md#executable-delivery-status) to see missing requirements. Herdr is optional only when expressly selected inside Herdr (`HERDR_ENV=1`); only delivery-owned panes may be cleaned up.

## Draft KIT Jira issues

Install the standalone `jira-issue-hierarchy` skill to draft Epics and Stories from an approved requirement, draft Sub-tasks at Story work start, or check Story QA readiness. Its [local policy and templates](../skills/jira-issue-hierarchy/references/jira-issue-templates/README.md) ship with the skill; no external policy fetch is needed. The repository installer also brings it when selecting `video-iterative-orchestration`. QA reviews Stories, not agent-owned children.

## Inspect and repair recorded behavior

`iterate-evidence`: allow recorded look plus code fix, or continue its receipt. Record, no fix: `record-evidence`.

```sh
npx github:MarkTripoli/skills oh-my-pi --skill iterate-evidence --project --yes
```

Repo installer pick companion and `record-evidence`. Plain skill-copy installer no promise dependency closure. Run `/iterate-evidence` with task, wanted behavior, allowed fix path. Default three fix round; `0` = look only. Receipt keep finding, recording, check, stop choice. No recording or no pixel look = no success.

## Configure model routing

If delivery has no usable model profile, run `/configure-model-routing`. Codex users run `$configure-model-routing`; other harnesses run `/configure-model-routing`. Skill ask one question at time, write project `.agents/model-candidates.json` or user file named by `SKILLS_MODEL_CANDIDATES_FILE`, check saved profile with `route-model`. Discovery: Pi `pi --list-models`, Oh My Pi `omp models --json`, only if present; Claude Code and Codex use plain model ID.

## Automatic model selection

JEV = service that picks a model for eligible non-writing phases (profile `routing: auto`, default). It needs a TypeSafe key; keep key outside project. Setup, model default, fail rule: [model selection](model-routing.md). Skip JEV routing with `routing: fixed` in the profile.

## Verification and application testing

`/verify-implementation` checks the build before code review. `/test-app` tests the real app (web, iOS simulator, or Android emulator). Need browser, simulator, or emulator. Missing tool = blocked, not pass.

Command and recorded result: [verification](verification.md), [app testing](app-testing.md).

## Run JEV UI by hand

Install standalone `jev-ui` skill with `typed-judgment` and `record-evidence` dependency. Use explicitly named browser, Android target, or iOS simulator. Browser control need Node 22+; iOS control need `idb` and caller-owned simulator companion.

```sh
node skills/delivery/jev-ui/scripts/jev-ui.mjs --platform android --target "$ANDROID_SERIAL" --app "$ANDROID_APP" --goal 'Complete the selected app task' --expected 'Expected status'
IDB_COMPANION=/path/to/idb-companion.sock node skills/delivery/jev-ui/scripts/jev-ui.mjs --platform ios --target "$IOS_UDID" --app "$IOS_BUNDLE_ID" --goal 'Complete the selected app task' --expected 'Expected status'
```

## Continue existing work

Work from the task checkout and branch. Chat end ≠ new task. Run the next skill on the saved task directory: `/resolve-pr-reviews` for pull request feedback; `/start-epic-delivery` after prerequisite branch merge. Old workflow checkpoint cannot convert. Keep doc and worktree; run the next skill on the doc. See [ownership rules](../workflows/delivery.md#task-artifact-and-worktree-ownership).

## Video-iterative delivery

- [`video-iterative-development`](../skills/delivery/video-iterative-development/SKILL.md) scopes authenticated backend/API and frontend work to the smallest required layers, then proves changed contracts and real user flows with appropriate evidence.
- [`video-iterative-orchestration`](../skills/delivery/video-iterative-orchestration/SKILL.md) coordinates prioritized, dependency-aware requirements through isolated worktrees, durable run state, recovery, and delivery gates. It uses the development skill for each implementation.

## Slack visibility

[`agent-slack-control-plane`](../skills/delivery/agent-slack-control-plane/SKILL.md) describes sparse feature updates and opt-in work-item run visibility and steering. It does not implement product work. Installing the skill does not by itself enable automatic task threading or provide a Slack daemon; follow the skill's operating contract and use [Slack coordinator](slack-coordinator.md) for the separately installed daemon.
