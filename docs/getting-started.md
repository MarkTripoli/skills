# Getting started

This guide takes one request from idea to pull request with the delivery packs, then shows the same phases by hand. The short form is [cheatsheet.md](cheatsheet.md).

## Setup

1. Install Archon 0.10 or later: `curl -fsSL https://archon.diy/install | bash`.
2. `archon setup` picks the provider (Claude Code, Codex, or Pi) and its credentials; `archon doctor` confirms the binaries and `gh` auth. Oh My Pi users skip the provider and use the `-omp` packs.
3. Install the skills and packs: `npx github:MarkTripoli/skills` (see the [README install section](../README.md#install)). The menu preselects detected harnesses and lets you install all skills or search for specific ones. A full install writes portable skills to `~/.agents/skills/`, the packs' `skills_dir` default, and packs to `~/.archon/workflows/`; `--project` puts packs in the current repository but still writes the `~/.agents/skills` copy. A partial skill selection skips packs because the workflow chain requires every delivery skill.
4. From a git checkout of the project you want to change, check the packs are visible:

   ```sh
   archon workflow list
   ```

   The list shows `delivery-full`, `delivery-lean`, `delivery-prd`, `delivery-oneshot`, `delivery-bugfix`, `delivery-epic`, `delivery-resolve-reviews`, and their `-omp` twins.

## The one rule

Every phase runs in its own session. A phase reads `task.md` and the artifacts it needs from disk, writes one artifact, and stops. Under Archon every AI node is `context: fresh`, so this happens without you doing anything; by hand, you open a new session per phase. You never carry a conversation from one phase into the next. [Context management](context-management.md) explains why and what goes wrong when you skip it.

## First run

1. Start a small, fully specified change on its own branch:

   ```sh
   archon workflow run delivery-oneshot --branch verbose-flag "Add a --verbose flag to the CLI that prints each command before running it"
   ```

   Always pass `--branch`; without it Archon names the branch `archon/task-<hash>`. Archon creates a worktree for the branch, cut from the remote's base branch, so the checkout needs a git remote (`--no-worktree` works in the live checkout without one). The first node writes `.agents/tasks/verbose-flag-cli-prints/task.md` (the slug is the request's first line with stop words dropped, four words at most) and commits it as `docs(task): open verbose-flag-cli-prints`. The next node implements, verifies, and commits in one fresh session. The review loop then runs `review-code` and `fix-code-review` in fresh sessions until a review is clean, and a join commits the review artifacts as `docs(task): review artifacts`.

2. The run pauses at the pull request gate and exits. The last lines print the run id and the gate message: "Review the pull request description in .agents/tasks/verbose-flag-cli-prints. Approve to continue, or request changes with the changes you want and the phase revises the artifact." Read `pr-description.md` in the worktree's task directory, then decide:

   ```sh
   archon workflow approve <run-id> --detach
   archon workflow reject <run-id> --detach "Mention the new flag in the README section on logging"
   archon workflow wait <run-id>
   ```

   A reject runs `describe-pr` again in a fresh session with your text as feedback and reopens the gate; `wait` returns when it does. An approve ends the run: the pull request is open and the `pr-done` join has pushed the artifact commit. Without `--detach` the approve or reject command runs the continuation in your terminal until the next gate. The web UI and chat adapters offer the same Approve and Request changes buttons.

3. When reviewers comment on the pull request, adopt the run that opened it:

   ```sh
   archon workflow run delivery-resolve-reviews --adopt <run-id> --input task_dir=.agents/tasks/verbose-flag-cli-prints "address the review comments"
   ```

   `--adopt` reuses that run's worktree and branch, where the task directory and its committed artifacts already are (`--branch verbose-flag` works too). One round per invocation; run it again when reviewers respond.

## Steering a run

The loop is: run, exit at a gate, decide with `--detach`, `wait`, repeat.

```sh
archon workflow run delivery-full --branch plugin-formatters "Add a plugin system for output formatters"
archon workflow wait <run-id>        # after a --detach decision: blocks until the next gate or the end
archon workflow approve <run-id> --detach
archon workflow reject <run-id> --detach "<what should change>"
```

- `archon workflow runs` lists runs; `archon workflow get <run-id>` shows one, `--verbose` adds the per-node summary, `--json` the machine-readable form.
- `--quiet` on any command hides the JSON log lines.
- A fresh launch of an interactive pack refuses `--detach`; only `approve`, `reject`, `respond`, and `resume` take it.
- Failure: `archon workflow resume <run-id>` skips completed nodes and re-runs the failed one against the task directory as it stands.
- Dead run: `archon workflow abandon <run-id>`. `archon workflow cancel <run-id>` stops a detached continuation only.
- Review blocked: the review loop cancels the run with the blocker recorded in the newest code-review artifact. Resolve it, then run the pack again with `--input task_dir=<task dir>` on the same branch.

## A full run

`delivery-full` adds research and design before implementation:

```sh
archon workflow run delivery-full --branch plugin-formatters "Add a plugin system for output formatters"
```

Task directory: `.agents/tasks/plugin-system-output-formatters/`. Gates, in order: `design`, `plan`, `phases` (every implementation phase), `pr`. At an implementation gate the receipt is the newest `NN-implementation-*.md`; approve to start the next plan phase, reject with text to run `iterate-implementation` before the next phase begins. The loop ends when you approve and the plan has no unchecked box left under its `## Phase N` headings. `--input review_each_phase=true` adds a review-code, fix-code-review pass before each implementation gate.

`delivery-lean` (structure outline instead of design discussion and plan; gates `outline`, `phases`, `pr`) and `delivery-prd` (PRD and TDD before the plan; gates `prd`, `tdd`, `plan`, `phases`, `pr`) follow the same shape; the chains are in [workflows/delivery.md](../workflows/delivery.md).

## Choosing the gates

The `gates` input picks which pauses happen. It is fixed for the life of the run.

```sh
archon workflow run delivery-full --branch plugin-formatters --input gates=none "Add a plugin system for output formatters"
archon workflow run delivery-full --branch plugin-formatters --input gates=plan,pr "Add a plugin system for output formatters"
```

- `none`: unattended. The design and plan skills run once, implementation phases run back to back until the plan has no unchecked box, the verification re-runs the checks and acceptance items in a fresh session (fixing and re-verifying up to three times), the review loop runs until clean, and the pull request opens without a pause. Read what happened with `archon workflow get <run-id> --json` and the `docs(task): <phase> artifacts` commits on the branch.
- `plan,pr`: the run pauses only at the plan and the pull request description; unknown names fail the run at node `gates`.
- To go unattended after a run has started, approve the remaining gates as they come. To add gates, start a new run on the same branch with `--input task_dir=.agents/tasks/<slug> --input gates=<names>`; it reuses the task directory. `--input` and `--resume` are mutually exclusive.

Gate names per pack and what each reviews: [workflows/delivery.md, Gates](../workflows/delivery.md#gates).

## A bugfix

```sh
archon workflow run delivery-bugfix --branch missing-config-exit "Missing config file: the CLI exits 0; it should exit 2 and name the file"
```

Task directory: `.agents/tasks/missing-config-file-cli/`. `reproduce-bug` runs first and writes a reproduction artifact whose frontmatter `status` is `reproduced` or `not-reproduced`. The gate message shows that status and the artifact's summary.

- Reproduced: approve to fix; reject with text to correct the reproduction.
- Not reproduced: the gate is the escalation. Approve or reject with the missing information (steps, data, environment) and `reproduce-bug` tries again with it, revising the artifact in place; abandon the run when nothing more is known. The loop ends only on approve of a reproduced bug.

With `--input gates=none` the pack tries up to four reproduction sessions on its own, each reading the previous artifact's `## Missing` list, then cancels the run with a pointer to that list when none reproduced the bug.

The `fix-bug` node reads the artifact's `## Fix` steps, makes the reproduction pass, keeps it as a regression test when it is one, and commits. Then the verification (the reproduction is re-run and the regression test is checked against the merge target), the review loop, and the pull request gate.

## An epic

```sh
archon workflow run delivery-epic --branch epic-build-billing-module "Build the billing module"
```

Task directory: `.agents/tasks/build-billing-module/`. `create-epic-plan` sizes every child against [shared/SLICING.md](../shared/SLICING.md) (one obligation, one vertical slice, one day of work, safe to merge alone), gives each one EARS acceptance criteria, writes the plan, and gates (`plan`); `start-epic-delivery` rejects a child that breaks those rules, creates one task directory per child with the criteria in its `task.md`, commits them as `docs(task): open epic children` on the epic branch, and prints one start command per wave-1 child:

```sh
archon workflow run delivery-<child workflow> --base epic-build-billing-module --input task_dir=.agents/tasks/<child slug> '<child prompt>'
```

The parent run ends there. Run each child command from the project root on the epic branch; write prompt apostrophes as ` '\'' `, and `--base` cuts the child's worktree from the epic branch and targets the child's pull request at it. An existing pull request wins as the target, then `task.md` `base:`, then the repository default branch. Later waves start after their dependencies have merged into the epic branch. The skill refuses to run on `main`, `master`, or a detached `HEAD`.

## Where things land

```text
.agents/tasks/verbose-flag-cli-prints/
  task.md                                              request, slug, workflow, created
  01-research-questions-verbose-flag-cli-prints.md
  02-research-verbose-flag-cli-prints.md
  03-design-discussion-verbose-flag-cli-prints.md
  04-plan-verbose-flag-cli-prints.md
  05-implementation-verbose-flag-cli-prints.md        one per completed implementation phase
  06-code-review-verbose-flag-cli-prints.md           one per review pass
  pr-description.md
```

Artifacts are the memory between phases. Each has frontmatter with `type` and `summary`; later phases read the full text of the artifacts they select and only `summary` from the rest. Revisions edit a file in place; numbers are never reused for a revision. The directory is committed on the branch: `task.md` as `docs(task): open <slug>`, each phase's artifacts as `docs(task): <phase> artifacts`, so they reach the pull request and any later run that adopts the branch. With a worktree, the task directory lives in that worktree; Archon prints its path when the run starts.

## Running skills by hand

Every skill runs in a plain agent session without Archon. Commands are written as `/name`; Codex users type `$name`.

1. Start a session and run the first phase with your request:

   ```text
   /create-research-questions Add a --verbose flag to the CLI that prints each command before running it
   ```

   The skill opens the task worktree first, `git worktree add ~/.agents/worktrees/<repo>/verbose-flag-cli-prints -b verbose-flag-cli-prints`, and names its path in the reply. This is the default and it is not asked about: the phases that follow commit on the task branch, and the checkout you started from stays where it is. Only the cases in the conventions' [Task worktree](../shared/CONVENTIONS.md) section skip it, one of them your own "work in this checkout" in the same session. Remove the worktree with `git worktree remove <path>` once the pull request merges.

   In that worktree the skill creates and commits `.agents/tasks/verbose-flag-cli-prints/task.md`, writes `01-research-questions-verbose-flag-cli-prints.md`, commits it as `docs(task): research-questions artifact`, and ends with a fenced command:

   ```text
   /create-research
   ```

2. Open a new session (`/clear` in Claude Code, `/new` in Codex, Oh My Pi, and Pi) in the worktree and paste the command. With several tasks in flight, add the task directory: `/create-research @.agents/tasks/verbose-flag-cli-prints`.

3. At a human gate the reply links the artifact, lists its `### Verify` checks and known limits, and names the iterate skill. To approve, run the fenced command in a new session. To change it, reply in the same session for one or two rounds, or run `/iterate-plan @04-plan-verbose-flag-cli-prints.md` in a new session after a long review. `/review-artifact-comments @<artifact file>` applies a list of notes one at a time.

4. Implementation runs phase by phase: `implement-plan` (or `implement-outline` for `lean`) implements the first unchecked phase, ticks its boxes, commits code with explicit paths, and stops with a receipt. Run the same command again in a new session for the next phase; the last phase hands off to `/describe-pr`. Run `/verify-implementation` after the last phase to re-run the checks and acceptance items in a session that did not write the code, then `/review-code` and `/fix-code-review` before `/describe-pr`, when you want the verification and the review loop by hand.

5. `describe-pr` writes and publishes the pull request description. `resolve-pr-reviews` works through review threads until reviewers approve.

Skills no pack invokes run this way only: `iterate-research-questions`, `iterate-research`, `record-evidence` (narrated video proof for the pull request), `ci-commit`, `review-artifact-comments`, `show-me`.

## When something looks wrong

- **The gate message names a run id you lost.** `archon workflow runs` lists it; `archon workflow status` shows only running and paused runs.
- **A phase cannot find the skill it names.** The skills are not in `skills_dir` (`~/.agents/skills` by default). Install the portable copy or pass `--input skills_dir=<dir>`.
- **The run fails at `task` with "is ignored by git".** An older version of this collection added `.agents/tasks/` to the project `.gitignore`; the node removes that exact line itself, so another rule still matches. Remove it and run again.
- **The reply has no command fence (by hand).** The phase did not finish its template. Ask it to "print the final answer from the template" in the same session, then continue from the fence.
- **The agent asks you to restate the task.** It is reading conversation instead of `task.md`. Point it at the task directory: `/create-plan @.agents/tasks/<slug>`.
- **The session feels slow, repetitive, or forgetful.** You are in a degraded context. Save and restart: see [Context management](context-management.md#recognizing-a-degraded-context).
