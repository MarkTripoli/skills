# Delivery workflow

A task moves from request to pull request through [Archon](https://archon.diy) workflow packs. One run, `archon workflow run delivery-<type> --branch <name> "<request>"`, drives the whole chain: the `delivery-task` block creates `.agents/tasks/<slug>/task.md` and commits it, every AI node runs a skill in a fresh session (`context: fresh`), each skill writes one artifact into the task directory, a join node commits the artifacts after each phase, and approval nodes stop the run until a human decides. The artifacts are the only memory between nodes and travel with the branch. The file and reply contracts are in [shared/CONVENTIONS.md](../shared/CONVENTIONS.md).

Pack source: `.archon/workflows/delivery/` (native: Claude Code, Codex, Pi through `prompt:` nodes) and `.archon/workflows/delivery-omp/` (generated; every prompt runs `omp -p`). See [Two flavors](#two-flavors).

## One command

`archon workflow run delivery-start "<request>"` picks the pack and the human involvement from the request itself, then runs that pack as a child run. Two judgments over the request (`judge.mjs route-workflow`, `autonomy`) decide:

| The request | Pack | Gates |
|---|---|---|
| "add 1 2 prints NaN; just fix it, no need to check with me" | `delivery-bugfix` | `none` |
| "add a --json flag to the list command" | `delivery-oneshot` | `all` (nothing said, so every gate) |
| "write the PRD for multi-tenant billing, I want to review the PRD and the design first" | `delivery-prd` | `prd,tdd,plan` |
| "take this PRD to pull requests: split it into epics and issues, hands off" | `delivery-program` | `none` |

Autonomy levels: `none` (hands-off) needs a decisive reading; `pr` (show me the result) and `plan` (review the plan or design, then build) a confident one; anything less, or nothing said, is `all`. `plan` maps to each pack's planning gates (full `design,plan`; prd and program `prd,tdd,plan`; lean `outline`; bugfix `reproduce`; epic `plan`; oneshot `pr`). When the pack is judged below 0.8 and gates are on, the run pauses once at `confirm`: approve, or request changes naming the pack and gates (`lean, outline`). Unattended and unsure takes `delivery-full`, the pack with the most process. `--input workflow=` and `--input gates=` override either judgment; a child gate pauses the parent, and `archon workflow approve <child run id>` continues it. In an agent session the `deliver` skill makes the same call, starts the run in the foreground, and replies with the run id and the first pause; without Archon it opens the task worktree and the task directory in it, then hands off to the chain's first skill.

## Packs

`workflow` in `task.md` records the pack that created the task. Chains list the skills in order; "gate" marks an approval node. The Gates column lists the names the `gates` input accepts; see [Gates](#gates).

| Pack | Chain | Gates | Use when |
|---|---|---|---|
| `delivery-full` | create-research-questions, create-research, create-design-discussion (gate), create-plan (gate), implement-plan per phase (gate after each), verify-implementation, review loop, describe-pr (gate) | `design`, `plan`, `phases`, `pr` | Competing approaches, cross-module impact, migrations, a new or changed interface others depend on, or the user asks for a design review. |
| `delivery-lean` | create-research-questions, create-research, create-structure-outline (gate), implement-outline per step (gate after each), verify-implementation, review loop, describe-pr (gate) | `outline`, `phases`, `pr` | The shape is clear but several files and an ordering are involved. |
| `delivery-prd` | create-research (questions derived from `task.md`), create-prd (gate), create-tdd (gate), create-plan (gate), implement-plan per phase (gate after each), verify-implementation, review loop, describe-pr (gate) | `prd`, `tdd`, `plan`, `phases`, `pr` | The requirement itself is open: what it should do, for whom, edge behavior; product-facing work; stakeholders beyond the requester. |
| `delivery-oneshot` | one session implements, verifies, and commits per the `ci-commit` conventions; verify-implementation; review loop; describe-pr (gate) | `pr` | A small change with a stated expected behavior, a way to verify it, no design choice, a small footprint. |
| `delivery-bugfix` | reproduce-bug (gate), fix-bug, verify-implementation, review loop, describe-pr (gate) | `reproduce`, `pr` | Observed behavior differs from expected behavior and a reproduction is possible. No product code is edited before the bug reproduces. |
| `delivery-start` | route (judge the pack and the autonomy level), confirm (gate, only when unsure), then the chosen pack as a child run | `auto` (judged), or any value the chosen pack accepts | You do not want to pick a pack: `archon workflow run delivery-start "<request>"`. `--input workflow=<pack>` and `--input gates=<...>` override the judgments. |
| `delivery-epic` | research, create-epic-plan (gate), start-epic-delivery (task directories, GitHub issues), wave 1 of the children as their own unattended runs | `plan` | Several independently mergeable deliverables, work for more than one person, more than about eight plan phases, or work no single pull request can carry in a day. Run with `--branch epic-<slug>`; `--input children=manual` prints the child commands instead of starting them. |
| `delivery-program` | research, create-prd (gate), create-tdd (gate), create-epic-plan (gate), start-epic-delivery, wave 1 | `prd`, `tdd`, `plan` | An initiative that starts from requirements and ends as several pull requests: PRD, design, decomposition into children with issues, then the children run. `--branch epic-<slug>`. |
| `delivery-epic-wave` | ready children of an epic launched as unattended runs | none | Later waves of an epic: after the previous wave's pull requests merged into the epic branch, `archon workflow run delivery-epic-wave --branch epic-<slug> --input epic_dir=.agents/tasks/<epic slug> "next wave"`. |
| `delivery-resolve-reviews` | resolve-pr-reviews, one round | none | Reviewers left comments on a pull request a delivery run opened. Start it with `--adopt <run-id>` of that run (or `--branch <pr branch>`) so it works in the adopted worktree, pass `--input task_dir=<task dir>`, and run it again when reviewers respond. |

`delivery-full`, `delivery-lean`, and `delivery-prd` accept `--input review_each_phase=true`, which adds one review-code, fix-code-review pass after every implementation phase. The five implementing packs run `verify-implementation` after implementation unless `--input verify=false`; see [Verify before review](#verify-before-review). All packs accept `--input skills_dir=<dir>` (default `~/.agents/skills`), the directory holding one `<skill>/SKILL.md` per installed skill, and `--input task_dir=<dir>` to reuse an existing task directory (an epic child, or one created by hand) instead of creating one. `delivery-task` expands a leading `~` in `skills_dir` (Archon passes inputs through verbatim and not every agent's file tool expands one), warns on stderr when the directory is missing, and returns it as `$task.output.skills_dir`, which every later node reads.

## Blocks

Packs compose eight blocks with `include:`. None runs on its own.

| Block | Construct | Inputs | Does |
|---|---|---|---|
| `delivery-task` | one `bash:` node, returns `{task_dir}` | `workflow`, `task_dir` | Slug from the request's first line (two to four kebab-case words, stop words dropped, `-2`, `-3` suffix when the directory exists), writes `task.md` with `slug`, `title`, `workflow`, `created`, and the request as body, then commits it as `docs(task): open <slug>`; see [Task directory on the branch](#task-directory-on-the-branch). A non-empty `task_dir` is returned as is and nothing is written. The request arrives as `$ARGUMENTS`. |
| `delivery-research` | two `prompt:` nodes | `skills_dir`, `task_dir` | create-research-questions, then create-research. |
| `delivery-gate-phase` | `cycle`: a `loop_group` (`max_iterations: 100`) of `prompt:` and `approval:` under `when: "$INPUTS.gate == 'true'"`; `once`: one `prompt:` under `when: "$INPUTS.gate != 'true'"` | `skills_dir`, `task_dir`, `skill`, `iterate`, `label`, `gate` | Gated: the first pass runs `skill`; the gate asks to review `label`; every rejection runs `iterate` with the reviewer's text (`$LOOP_PREV.gate.output.text`) and gates again; `until_bash` exits when the decision is `approve`. Unattended: `skill` runs once. |
| `delivery-implement` | `phases`: a `loop_group` (`max_iterations: 16`) of `prompt:`, optional review pass, `approval:`, under `when: "$INPUTS.gate == 'true'"`; `phases-auto`: the same body without the approval, under the complementary `when:` | `skills_dir`, `task_dir`, `skill` (`implement-plan` or `implement-outline`), `review`, `gate` | One plan phase per iteration; see [Implementation loop](#implementation-loop). |
| `delivery-review` | `loop_group` (`max_iterations: 4`) of `prompt:` (JSON output), `cancel:`, `prompt:` | `skills_dir`, `task_dir` | review-code, fix-code-review until clean; see [Review until clean](#review-until-clean). |
| `delivery-verify` | `loop_group` (`max_iterations: 3`) of `prompt:` (JSON output), `bash:` cross-check, `prompt:`, commit join, `cancel:` | `skills_dir`, `task_dir` | verify-implementation, iterate-implementation on a failure, until a pass; blocked cancels; see [docs/verification.md](../docs/verification.md). |
| `delivery-app-test` | `loop_group` (`max_iterations: 3`) of `prompt:` (JSON output), `prompt:`, commit join, `cancel:` | `skills_dir`, `task_dir`, `kind`, `target` | test-app, iterate-implementation on a failure, until a pass; blocked cancels; see [docs/app-testing.md](../docs/app-testing.md). |
| `delivery-wave` | three `bash:` nodes and a join | `skills_dir`, `epic_dir`, `max_parallel`, `children`, `flavor` | `ready` lists the epic's children whose dependencies have merged into the epic branch (their `pr-description.md` is on it); `launch` pushes the epic branch to `origin` (Archon cuts a child from `origin/<base>`), then starts each ready child as its own unattended run (`--branch <slug> --base <epic branch> --input gates=none`), at most `max_parallel` at once; `children=manual` prints the commands instead, and the epic branch is then pushed by hand before they run. |

## Gates

A gate is an `approval:` node with two decisions, `approve` and `reject` (labelled "Request changes"). The pack reads the decision as `$gate.output.decision` and the text as `$gate.output.text`. On `reject`, the text becomes the feedback the iterate skill applies to the newest artifact it owns (`iterate-plan`, `iterate-prd`, `describe-pr` again for the pull request description, `iterate-implementation` after an implementation phase); the gate then reopens. On `approve`, the loop's `until_bash` passes and the chain continues. Pull request approval stays external: `delivery-resolve-reviews` runs one round per invocation.

### The `gates` input picks which pauses happen

Every pack except `delivery-resolve-reviews` declares a `gates` input, read by a top-level `bash:` node `gates` that runs right after `task`:

- `all` (default): every gate pauses.
- `none`: no gate pauses; the run is unattended.
- a comma list, for example `--input gates=plan,pr`: only the named gates pause. Whitespace around names is dropped.
- an unknown name fails the run at node `gates` with the message `gates: unknown gate "<name>"; use all, none, or a comma-separated subset of: <names>`.

The node prints `{"design":"true","plan":"false",...}` and each include receives its flag as `gate: $gates.output.<name>`. Gates are fixed for the life of a run; see [Steering a run](#steering-a-run).

| Gate | Packs | Reviews |
|---|---|---|
| `design` | full | the design discussion (`create-design-discussion`, revised by `iterate-design-discussion`) |
| `outline` | lean | the structure outline (`create-structure-outline`, `iterate-structure-outline`) |
| `prd` | prd | the product requirements document (`create-prd`, `iterate-prd`) |
| `tdd` | prd | the technical design document (`create-tdd`, `iterate-tdd`) |
| `plan` | full, prd, epic | the plan (`create-plan`, `iterate-plan`); in `delivery-epic` the epic plan (`create-epic-plan` on both passes) |
| `phases` | full, lean, prd | every implementation phase's receipt, the newest `NN-implementation-*.md` (`implement-plan` or `implement-outline`, `iterate-implementation` on reject) |
| `reproduce` | bugfix | the reproduction artifact and its `status` (`reproduce-bug` on every pass) |
| `pr` | full, lean, prd, oneshot, bugfix | the pull request description (`describe-pr` on both passes) |

A gated loop allows 100 rounds (`max_iterations: 100` on `cycle` and on the bugfix `reproduce` loop): a paused gate costs nothing, so the cap only guards against a runaway loop. The implementation loop keeps `max_iterations: 16` in both modes because each iteration is a plan phase.

### What replaces the human when a gate is off

| Gate off | Node | Behavior |
|---|---|---|
| `design`, `outline`, `prd`, `tdd`, `plan`, `pr` | `delivery-gate-phase` `once` | The create skill runs once; no revision pass. |
| `phases` | `delivery-implement` `phases-auto` | Phases run back to back, one fresh session each, until the newest plan or outline has no unchecked box under a `## Phase N` or `## Step N` heading; sixteen iterations fail the node. `review=true` still runs the per-phase review pass. |
| `reproduce` | `delivery-bugfix` `reproduce-auto`, `not-reproduced` | Up to four reproduction sessions, each a fresh session reading the previous artifact's `## Missing` list. A `status` of `reproduced` moves on to `fix`; after the fourth `not-reproduced` a `cancel:` node ends the run with "Bug not reproduced after 4 reproduction session(s); supply what the newest reproduction artifact's `## Missing` list names, then run the workflow again." |
| any | `delivery-review` | Unchanged: review-code, fix-code-review until `clean` or four rounds; `blocked` cancels the run. This loop never had a gate. |

To see what an unattended run decided: `archon workflow get <run-id> --json` lists every node's state and output (`--verbose` adds the per-node summary); `git log --grep 'docs(task)'` on the branch shows one commit per phase with the artifacts it added; the code-review artifacts (`NN-code-review-*.md`) record each review round's findings and the `status` the loop routed on.

## Review until clean

`delivery-review` runs `review-code` in a fresh session; the node prompt asks for a JSON-only final answer `{status, artifact, summary}` after the code-review artifact is saved, `status` copied from the artifact's frontmatter (`clean`, `findings`, or `blocked`). Then:

- `clean`: `until_bash` (`test "$status" = clean`) ends the loop.
- `findings`: `fix-code-review` runs against the named artifact, advisories included, and the loop repeats.
- `blocked`: a `cancel:` node stops the run with the message "Review blocked; resolve the blocker recorded in the newest code-review artifact, then run the workflow again."

Four passes with findings still open fail the node. Every pack runs this block after implementation and, unless `verify=false`, after the verification below.

## Verify before review

`delivery-verify` runs `verify-implementation` in a fresh session that never saw the implementer's context: it re-runs the repository's own checks (test, lint, build, from the manifest and CI, never from the receipts) and every acceptance item the artifacts promise (`task.md` acceptance criteria, the plan's `## Desired End State` and `### Verify` boxes, the receipts' `### Verify` lines, a bugfix's reproduction), diffs the test files against the merge target for weakened checks, grades each item (`judge.mjs grade-steps --kind command`, deterministic exit codes first), and saves a `verification` artifact. The node prompt asks for a JSON-only final answer `{status, artifact, summary}`; the `verification-status` bash node checks that claim against the artifact (`judge.mjs verification-status`, only ever moving `passed` toward `failed` or `blocked`), and the loop routes on the checked status:

- `passed`: `until_bash` ends the loop and the pack continues to `app-test` (when asked) and the review.
- `failed`: `iterate-verify` runs `iterate-implementation` with the artifact's `## Findings` as feedback, and the loop verifies again in a fresh session; three failed rounds fail the node.
- `blocked`: the artifact is committed and a `cancel:` node stops the run with "Verification blocked; supply what the newest verification artifact's `## Missing` list names, then run the workflow again."

The phase runs before the review so that a fix it triggers is reviewed, the same reason `app-test` sits there. The rules it applies (run the checks yourself, treat receipts as claims, fail on tampered tests, deterministic before model judgment, `unclear` to a person) are the ones the sources in [docs/research/llm-output-verification.md](../docs/research/llm-output-verification.md) support; [docs/verification.md](../docs/verification.md) has the operator's view.

## Implementation loop

`delivery-implement` runs one iteration per plan phase. With `gate=true` the `phases` loop runs. Its `implement-phase` prompt reads the previous gate's decision: empty or `approve` runs `skill` (implement the first incomplete phase of the newest plan or outline, tick its boxes, write its receipt, commit with explicit paths, stop); `reject` runs `iterate-implementation` with the reviewer's text and does not start the next phase. With `review=true`, `review-phase` (review-code, JSON answer) and `fix-phase` (fix-code-review, when `status == 'findings'`) run once between the implementation and the gate; the gate's `trigger_rule: none_failed_min_one_success` lets it fire whether or not those optional nodes ran.

`until_bash` ends the loop when the decision is `approve` and the newest `??-plan-*.md` or `??-structure-outline-*.md` in the task directory has no unchecked `- [ ]` box under any `## Phase N` or `## Step N` heading (boxes under other headings, such as `## Human Review`, do not count). Approve with phases remaining starts the next phase; sixteen iterations fail the node.

With `gate=false` the `phases-auto` loop runs instead: body `implement-phase-auto`, `review-phase-auto`, `fix-phase-auto`, no approval, and an `until_bash` that is the checkbox test alone. The body is duplicated because Archon cannot share a loop body between two `loop_group`s.

## Bugfix chain

With the `reproduce` gate on, `delivery-bugfix` puts `reproduce-bug` and its gate in one `loop_group` (`reproduce`, `max_iterations: 100`). The `attempt` node answers with JSON `{status, summary, artifact}`, `status` copied from the reproduction artifact (`reproduced` or `not-reproduced`). The gate message shows the status and summary. `until_bash` passes only when the decision is `approve` and the status is `reproduced`, so the same gate serves two purposes:

- reproduced: approve to move on to the fix; reject with text to correct the reproduction.
- not reproduced: the gate is the escalation. Either decision with text re-runs `reproduce-bug`, which treats the text as new information (steps, data, environment) and revises the artifact in place; abandon the run when nothing more is known.

With the gate off, `reproduce-auto` (`max_iterations: 4`) runs `attempt-auto` and then `attempt-count`, a `bash:` node that commits the session's artifact (`docs(task): reproduce artifacts`) and prints `{status, attempt}`; `until_bash` stops on `reproduced` or on the fourth session. `not-reproduced` is a `cancel:` node under `when: "$reproduce-auto.output.status != 'reproduced'"`; the artifacts it points at are already on the branch. The `reproduce-done` join depends on all three and fires with `trigger_rule: none_failed_min_one_success`.

`fix-bug` reads `task.md` and the newest reproduction artifact, follows its `## Fix` steps, makes the reproduction pass, runs the narrowest checks, commits the code per the `ci-commit` conventions, and keeps the reproduction as a regression test when it is one. Then the review loop and the pull request gate.

## Steering a run

The loop, from a git checkout of the project:

```sh
archon workflow run delivery-full --branch verbose-flag "Add a --verbose flag ..."
# runs in the foreground, prints "Workflow paused" and the run id, and exits at the first gate
archon workflow approve <run-id> --detach
archon workflow reject <run-id> --detach "<what should change>"
archon workflow wait <run-id>
# blocks until the next gate or the end of the run; then approve or reject again
```

- Always pass `--branch <name>` for code changes; without it Archon names the branch `archon/task-<hash>`. The run works in a worktree of that branch, which Archon cuts from the remote's base branch: the checkout needs a git remote (`origin`) whose base branch exists, or `--no-worktree` to work in the live checkout.
- `approve` and `reject` without `--detach` run the continuation in the foreground through every AI node until the next gate. With `--detach` a background child continues and the command returns at once; `archon workflow wait <run-id>` blocks until the run pauses or ends (`--timeout <seconds>` gives up earlier). `respond <run-id> <decision> [text]` is the general form; `approve` and `reject` are its sugar. The web UI and chat adapters offer the same two decisions.
- A fresh launch of an interactive pack refuses `--detach`; the packs declare `interactive: true`. `--detach` is accepted on `approve`, `reject`, `respond`, and `resume`.
- `--quiet` hides the JSON log lines on stdout; `--json` on `get`, `wait`, `runs`, `approve`, `reject` prints machine-readable output.
- Gates are fixed per run: `--input` and `--resume` are mutually exclusive, so `gates` cannot change mid-run. To go unattended from a gate onward, approve the remaining gates as they come. To add gates, start a new run with `--input task_dir=.agents/tasks/<slug> --input gates=<names>` on the same `--branch`; the run reuses the task directory and its committed artifacts.
- Continue after a failure: `archon workflow resume <run-id>` (or `archon workflow run delivery-<type> --resume` for the most recent failed or paused run of that pack in this directory) skips completed nodes and re-runs the failed one against the task directory as it stands.
- Dead run: `archon workflow abandon <run-id>` marks it cancelled without stopping host work. `archon workflow cancel <run-id>` stops a detached continuation only.
- Find a run: `archon workflow runs` lists recent runs, `archon workflow status` only running and paused ones, `archon workflow get <run-id>` one run.
- Pick a pack: name it, or give the request to Archon's router (`archon chat`, Slack, the web UI), which matches the "Use when / NOT for" lines in each pack description.

## Task directory on the branch

`.agents/tasks/` is committed history; nothing in the collection ignores it.

- `delivery-task` commits `task.md` as `docs(task): open <slug>` on the run's branch. When `git check-ignore -q` reports `task.md` ignored, the node removes an exact `.agents/tasks/` line from the project `.gitignore` (added by earlier versions of this collection), stages that edit in the same commit, and exits 1 with an instruction when the path is still ignored. Outside a git work tree nothing is committed. A reused `task_dir` is not touched.
- Every `*-done` join stages and commits only the run's task directory as `docs(task): <phase> artifacts`; code an AI phase left staged stays out of it. `<phase>` is `research`, `design`, `outline`, `prd`, `tdd`, `plan`, `implement`, `review`, `reproduce`, `pr`, or `review-round`. The bugfix `fix-bug` session commits its own task-directory writes as `docs(task): fix artifacts`; `delivery-epic` commits `docs(task): open epic children` after `start`.
- `pr-done` (after every `pr` include) and `round-done` (`delivery-resolve-reviews`) also `git push -q` when the branch has an upstream, because `describe-pr` and `resolve-pr-reviews` push before the join lands their artifact.
- The `fix` and `implement` prompts (bugfix, oneshot) and every skill commit code with explicit paths and never mix artifact files in; a skill run by hand commits its artifact as `docs(task): <artifact type> artifact`.

Why: an Archon run works in a disposable worktree, so an uncommitted task directory would vanish with it. On the branch, the artifacts reach the pull request, where a reviewer can open the plan and the review receipts, and `delivery-resolve-reviews --adopt <run-id>` finds them in the adopted worktree. `record-evidence` writes `evidence/.gitignore` (`*`) before its first recording so videos stay out of the artifact commits.

## Typed judgments

Where a pack once parsed prose, it now asks `typed-judgment/judge.mjs` (installed beside the skills) a typed question and branches on the answer; the deterministic rule stays as the fallback, so a machine without `TYPESAFE_API_KEY` runs exactly as before. Calls take under a second. Where each sits:

| Decision | Node | Command | Fallback |
|---|---|---|---|
| Is the plan finished; which phase is next | `delivery-implement` `until_bash`, `next-phase`, `next-phase-auto` | `plan-remaining` | the `## Phase N` checkbox awk |
| Is a review really clean | `delivery-review` `verify-review`; `delivery-implement` `verify-phase`, `verify-phase-auto` | `review-status` (only ever moves a claim toward `findings` or `blocked`) | the claimed status |
| Was the bug really reproduced | `delivery-bugfix` `verify-reproduction`, `attempt-count` | `reproduction-status` | the claimed status |
| Did the verification really pass | `delivery-verify` `verification-status` | `verification-status` (only ever moves a claim toward `failed` or `blocked`) | the claimed status |
| What a "request changes" text asks for | `delivery-gate-phase` and `delivery-implement` `until_bash` (`proceed` ends the loop) and `intent` (`stop` cancels through `stopped`) | `feedback-intent` | `revise` |
| The task slug, complexity, and the pack the request reads like | `delivery-task` `create` (`complexity:` and `suggested_workflow:` in `task.md`, a stderr warning on a mismatch) | `slug`, `tier`, `route-workflow` | the word rule; no fields |
| Whether an epic child is one pull request, and which split fits when it is not | `create-epic-plan` step 4 (the `## Sizing judgments` table) | `size-children` | the skill's own reading of [shared/SLICING.md](../shared/SLICING.md) |
| The JSON object an `omp -p` answer contains or implies | every `-omp` schema node | `extract-json` | the fence-stripping awk |
| Which pack, and how much human involvement, a request asks for | `delivery-start` `route`; the `deliver` skill | `route-workflow`, `autonomy` | `full`, `all`, and a `confirm` pause when gates are on |
| Research: is a question neutral, which worker answers it, which candidates to read first, is each cited claim supported, is every question answered | `create-research-questions`, `create-research`, and their iterate skills | `neutral`, `route-question`, `rerank`, `cite`, `coverage` | the skill's own reading |

Skills call it too where their steps say so (`create-epic-plan`, `resolve-pr-reviews`, `test-app`, `verify-implementation`); `shared/CONVENTIONS.md`, "Typed judgments", has the rules. Verdicts and probabilities are recorded in the artifacts, not in the run.

## Model tiers

Every `prompt:` node carries `model: small|medium|large`; Archon binds the word to a provider and model (`archon ai tier set`, or `--model large=<provider>/<model>` for one run), and no pack sets a workflow-level `model:`. The gate-phase authoring nodes add `effort: high`. `scripts/validate.mjs` fails a prompt node without a tier word. Reasons, binding commands, the `-omp` mapping, and routing a run by the request: [docs/model-routing.md](../docs/model-routing.md).

| Nodes | Tier |
|---|---|
| `delivery-research` (both nodes), `delivery-prd` `research`, `delivery-epic` `start`, `delivery-resolve-reviews` `round`, bugfix `attempt` and `attempt-auto`, `fix-phase`, `fix-phase-auto`, `fix-review` | medium |
| `delivery-gate-phase` (create, iterate, `describe-pr`; `effort: high`), `implement-phase`, `implement-phase-auto`, `review-phase`, `review-phase-auto`, `review-code`, bugfix `fix`, oneshot `implement`, `delivery-app-test` `test-app` and `iterate-app` | large |

## Two flavors

| Flavor | Directory | AI node | Providers |
|---|---|---|---|
| native | `.archon/workflows/delivery/` | `prompt:` | Claude Code, Codex, Pi, whatever Archon runs |
| `-omp` | `.archon/workflows/delivery-omp/` | `bash:` running `omp -p --auto-approve --no-session --max-time=45m "$prompt"` | Oh My Pi, which Archon has no provider for |

The installer writes the native flavor for Claude Code, Codex, Pi, or portable targets and the `-omp` flavor for the `oh-my-pi` target, so Archon's router (which lists every discovered workflow, blocks included, and reads their "Use when / NOT for" lines) shows one set of packs on a one-runtime machine. Archon has no field that hides a block from the router; `recommendedWorkflows` in `.archon/config.yaml` pins the packs you use in the web UI.

The OMP flavor is generated: `node scripts/build-packs.mjs` rewrites every native file into `<pack>-omp` with the same DAG (inputs, gates, loops, includes, and deterministic nodes unchanged), `$INPUTS.x` read from `INPUTS_<UPPER>` environment variables, and `$node.output` refs hoisted into shell variables. The prompt is read with `{ prompt=$(cat); } <<DELIVERY_PROMPT`, a heredoc feeding a brace group: bash 3.2 (macOS `/bin/bash`) scans a heredoc nested in `$(...)` for quotes, so an unpaired apostrophe in a prompt would fail to parse there. `node scripts/build-packs.mjs --check` exits 1 when the generated tree is stale. Never edit `delivery-omp/` by hand.

What the flavor loses: a `bash:` node has no per-node cost, retry, or idle timeout, so `--max-time=45m` is the only bound on a stuck session; each generated node carries `timeout: 2760000` (46 minutes) because Archon kills a bash node after 120 seconds by default, and runs `omp` with stdin from `/dev/null`, since `omp -p` waits for more prompt text while stdin is the open pipe Archon hands a bash node (both found in the first live run). Archon ignores `output_format` on a `bash:` node, so the generator moves a prompt node's schema into the prompt text (the same "respond with only a JSON object" instruction Archon appends for AI nodes) and drops the field. The answer goes through `judge.mjs extract-json`: a contained JSON object is taken as is; prose is read for the schema's enum fields and the one artifact name it mentions when the TypeSafe key is set; otherwise the fence-stripping awk runs and a non-JSON answer surfaces one node later, when `$review-code.output.status` or `$attempt-auto.output.status` is read and fails the run. A node's `model:` tier becomes `--model="$OMP_MODEL_<TIER>"` when that variable is set and `effort:` becomes `--thinking=<level>`. A native Oh My Pi provider in Archon is the fix; the flavor is a stopgap.

## Phase table

Artifact type is the frontmatter `type` of the artifact the skill writes. "Human gate" says whether an approval node follows the skill in the packs when its gate is on. "Runs in" names the pack or block whose node invokes the skill; "by hand" means no pack invokes it.

| Skill | Artifact type | Human gate | Runs in |
|---|---|---|---|
| gather-sources | sources | no | by hand, before the chain: fetches the docs, specs, tickets, pages, and repositories the task names into a cited digest that research, PRD, and TDD sessions read in place of fetching |
| create-research-questions | research-questions | no | `delivery-research` (full, lean) |
| iterate-research-questions | research-questions | no | by hand |
| create-research | research | no | `delivery-research` (full, lean); `delivery-prd` `research` node |
| iterate-research | research | no | by hand |
| create-design-discussion | design-discussion | yes | `delivery-gate-phase` in `delivery-full` |
| iterate-design-discussion | design-discussion | yes | `delivery-gate-phase` in `delivery-full`, on reject |
| create-prd | design-prd | yes | `delivery-gate-phase` in `delivery-prd` |
| iterate-prd | design-prd | yes | `delivery-gate-phase` in `delivery-prd`, on reject |
| create-tdd | design-tdd | yes | `delivery-gate-phase` in `delivery-prd` |
| iterate-tdd | design-tdd | yes | `delivery-gate-phase` in `delivery-prd`, on reject |
| create-structure-outline | structure-outline | yes | `delivery-gate-phase` in `delivery-lean` |
| iterate-structure-outline | structure-outline | yes | `delivery-gate-phase` in `delivery-lean`, on reject |
| create-plan | plan | yes | `delivery-gate-phase` in `delivery-full`, `delivery-prd` |
| iterate-plan | plan | yes | `delivery-gate-phase` in `delivery-full`, `delivery-prd`, on reject |
| create-epic-plan | epic-plan | yes | `delivery-gate-phase` in `delivery-epic` (first pass and every revision) |
| start-epic-delivery | epic-delivery | no | `delivery-epic` `start` node; the run ends, children start by hand |
| implement-plan | implementation | yes | `delivery-implement` `phases` (gated) or `phases-auto` in `delivery-full`, `delivery-prd` |
| implement-outline | implementation | yes | `delivery-implement` `phases` (gated) or `phases-auto` in `delivery-lean` |
| iterate-implementation | implementation | yes | `delivery-implement` `phases`, on reject; `delivery-verify` `iterate-verify` and `delivery-app-test` `iterate-app`, on a failed round |
| review-code | code-review | no | `delivery-review`; `delivery-implement` `review-phase` and `review-phase-auto` with `review_each_phase=true` |
| fix-code-review | code-review-fixes | no | `delivery-review`; `delivery-implement` `fix-phase` and `fix-phase-auto` |
| reproduce-bug | reproduction | yes | `delivery-bugfix` `reproduce` loop (gated) or `reproduce-auto` (up to four reproduction sessions, then cancel) |
| fix-bug | fix | no | `delivery-bugfix` |
| record-evidence | evidence | no | by hand |
| deliver | none | no | by hand: routes a request to a pack and an autonomy level (`judge.mjs route-workflow`, `autonomy`), then starts `archon workflow run delivery-<pack>` in the foreground, waits for its first pause or its end, and reports the run id and the gate it stopped at; without Archon, opens the task worktree and the task directory in it and hands off to the chain's first skill |
| verify-implementation | verification | no | `delivery-verify` `verification` loop in every pack except `delivery-epic`, `delivery-program`, and `delivery-resolve-reviews`, unless `verify` is `false` |
| test-app | app-test | no | `delivery-app-test` `test` loop in every pack except `delivery-epic` and `delivery-resolve-reviews`, when `app_test` is `web`, `ios`, or `android` |
| typed-judgment | none | no | helper: `judge.mjs` is run by pack bash nodes and by `create-epic-plan`, `resolve-pr-reviews`, `test-app`, and `verify-implementation` steps |
| describe-pr | pr-description | yes | `delivery-gate-phase` `pr` in every pack except `delivery-epic` and `delivery-resolve-reviews`; also the iterate skill of that gate |
| resolve-pr-reviews | pr-review | no | `delivery-resolve-reviews` |
| ci-commit | commit | no | by hand; the `delivery-oneshot` and `delivery-bugfix` commit prompts follow its conventions |
| review-artifact-comments | comment-review | no | by hand |
| show-me | show-me | no | by hand |

`describe-pr` writes an unnumbered `pr-description.md` without frontmatter, because the file is published verbatim as the pull request body. A file with no frontmatter otherwise takes its type from the name segment between `NN-` and the slug.

## Running skills by hand

Every skill still works in a plain agent session without Archon: `/<skill> @<artifact or task dir>` (Codex: `$<skill>`). A skill given no task directory opens the task worktree, `git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>`, then creates the directory in it and commits `task.md` as `docs(task): open <slug>`; the worktree is the default and no skill asks about it, which gives a by-hand run the same isolation an Archon run gets from `--branch` (the skip cases are in [CONVENTIONS.md](../shared/CONVENTIONS.md), Task worktree). Later phases run from that path; `git worktree remove <path>` after the pull request merges. A reply that hands off to another skill ends with `Next action:`, `Open a new session, then run:`, and one fenced `text` command naming that skill. Paste the command into a new session. A terminal reply ends with its current state and contains no command fence. Under Archon, the engine ignores the handoff copy because it already knows the next node. Skills that no pack invokes (`gather-sources`, `iterate-research*`, `record-evidence`, `ci-commit`, `review-artifact-comments`, `show-me`) run this way only.

`gather-sources` runs before a chain when the request points at material outside the repository: vendor documentation, an existing PRD or spec in Notion or a wiki, a ticket thread, another repository. It fetches each source once and saves `NN-sources-<slug>.md` (`type: sources`) with a digest and verbatim excerpts per source. `create-research-questions`, `create-research`, `create-prd`, and `create-tdd` read the newest sources artifact fully when one exists. Its handoff follows the task's `workflow`, with one exception: when the request converts an existing document the sources hold, it hands off to the skill that owns that document's form, `create-prd` for a product document, `create-tdd` for an RFC or technical spec. Those two skills then convert in one pass without their interviews: every section the source covers is mapped and cited, every section or item the source leaves open reads `Not stated in <source>` and becomes a `### Known limits` item and a `### Verify` box, and `create-tdd` fills Local Patterns from the repository through its child workers. The reply hands off to `create-tdd` or `create-plan` as usual, so a team with an approved PRD or an accepted RFC enters the chain there. `evals/` runs both conversions and the full and lean chains against a live model (`npm run evals`; [docs/testing.md](../docs/testing.md#evals)).

## Epics

Start the parent on its own branch: `archon workflow run delivery-epic --branch epic-<slug> "<request>"`. `delivery-epic` researches the request before `create-epic-plan` splits it into children with their own `workflow` and dependencies. Each child is sized against [shared/SLICING.md](../shared/SLICING.md): one obligation, one vertical slice, one day of work, safe to merge alone. A child entry carries `name`, `workflow`, `slice` (`vertical` or `enabler`), `depends_on`, `acceptance` (one to five EARS sentences), `prompt`, and `flag` when a flag guards the merge; the plan's `## Slice Check` records the observable increment, the size evidence, and the merge safety per child. `start-epic-delivery` rejects an entry that breaks those rules, reads the epic branch (`git rev-parse --abbrev-ref HEAD`; it refuses `main`, `master`, or a detached `HEAD` and asks for `--branch epic-<slug>`), creates one task directory per child (with `parent`, `base`, and `depends_on` in its `task.md`, and the acceptance criteria in its body), commits them as `docs(task): open epic children`, and prints one start command per wave-1 child:

```sh
archon workflow run delivery-<child workflow> --base <epic branch> --input task_dir=.agents/tasks/<child slug> '<child prompt>'
```

Run it from the project root on the epic branch. The child command uses shell single quotes, writing each prompt apostrophe as ` '\'' `; `--base` cuts the child's worktree from the epic branch, which holds the child's `task.md`, and makes the epic branch the target of the child's pull request. `task_dir` makes the child run reuse that directory instead of creating a second one.

With `children=auto` (the default) the `delivery-wave` block runs right after `start-epic-delivery` and starts every wave-1 child itself, each as its own unattended run (`--input gates=none`), at most `max_parallel` (default 3) at once; the parent run ends when the children have been started, and `archon workflow runs` lists them. Children are ordinary runs, not sub-runs: Archon's `fan_out` refuses any child workflow that contains an approval node, whatever its `gates` input says, and every pack does. A later wave starts by hand once the previous wave's pull requests have merged into the epic branch: `archon workflow run delivery-epic-wave --branch epic-<slug> --input epic_dir=.agents/tasks/<epic slug> "next wave"`. A child counts as done when its `pr-description.md` is on the epic branch (squash merges keep the file), as started when a branch named after it exists, and as ready when it is neither and every `depends_on` sibling is done.

When `gh` is authenticated and `origin` is a GitHub remote, `start-epic-delivery` opens one issue per child (the prompt, `Depends on: #n`, the epic branch, the task directory; label `epic:<slug>`), records `issue: <number>` in the child's `task.md`, and the child's pull request description ends with `Closes #<number>`. `delivery-program` is the same chain with a PRD and a TDD gate before the epic plan: `archon workflow run delivery-program --branch epic-<slug> "<initiative>"`.

## Archon notes

Engine behavior, verified against Archon 0.10.1, that the packs work around:

1. A `loop_group` that is the entry node of an include whose `depends_on` names another include never runs its body: the body inherits the unexpanded include alias. Packs place a plain `bash:` join node (`research-done`, `plan-done`, `review-done`, ...) between consecutive includes; the join doubles as the artifact commit. An entry node inside the block does not help, because the body inherits the block's boundary, not its sibling's.
2. A skipped node's output is unreadable, so a block cannot branch on `gate` inside one node. `delivery-gate-phase`, `delivery-implement`, and the bugfix reproduction each carry two top-level twins under complementary `when:` conditions (`cycle`/`once`, `phases`/`phases-auto`, `reproduce`/`reproduce-auto`).
3. A join that depends on a twin pair needs `trigger_rule: none_failed_min_one_success`; with the default rule the skipped twin skips the join, the rest of the DAG is skipped, and the run reports `completed` having done nothing after the gate.
4. A `loop_group` nested inside a `loop_group` body does not run, and a loop body cannot be shared between two `loop_group`s through an include. Per-phase review in `delivery-implement` is one review-code, fix-code-review pass, not a nested loop; the twin loops duplicate their bodies.
5. A `cancel:` node cannot read a loop body node's output or the output of a failed `loop_group`. `reproduce-auto` ends on the fourth failure through `attempt-count` instead of `max_iterations`, so `not-reproduced` can read `$reproduce-auto.output.status`.
6. `interactive: true` stays on `delivery-gate-phase` and `delivery-implement`: the loader requires it on any file with a pause node (#2738). When a pack includes them, the include-expander logs `droppedFields: ["interactive"]` on stdout in non-JSON mode; the line is expected, and `--json` output and `parseWarnings` are clean.
7. `$INPUTS.x` is not substituted into `bash:` bodies for literal-bound inputs. Bash nodes read `INPUTS_<UPPER_SNAKE>` environment variables instead (`INPUTS_GATES`, `INPUTS_WORKFLOW`, `INPUTS_TASK_DIR`). A real run delivers them to included bash nodes too (an include's `with:` values arrive as `INPUTS_*`); `--dry-run --exec-code` delivers them only to top-level bash nodes, so `delivery-task` then defaults to `workflow: full`. `until_bash` receives the `$INPUTS.x` macro but not the environment variables, and a dry run never executes it: a loop is assumed complete after one iteration.
8. `archon workflow run <name>` resolves the name by exact match, then case-insensitive, suffix, and substring match. A native pack that fails to load silently runs its `-omp` twin; check the resolved name in `archon workflow get <run-id> --json` (tests assert on it).
9. An include alias shadows a body node of the same id when `$id.output` refs are rewired. Block body ids differ from every alias packs use; see [Pack source](#pack-source).
10. `output_format` on a `bash:` node is ignored (log line `bash_node_ai_fields_ignored`); stdout that parses as a JSON object still serves `$node.output.field`. Deterministic nodes keep the field as documentation of what they print; the generator moves a prompt node's schema into the OMP prompt text.
11. A `loop_group` inside an include that is itself included never runs its body (the body keeps the inner file's un-namespaced `depends_on` ids), and every pack loops, so a pack cannot be included by another pack. `delivery-start` runs the chosen pack as a `workflow:` child run instead. A `workflow:` node takes `with:` or `input:`, not both, so the child gets its inputs and no message; `delivery-start` creates the task directory itself and passes `task_dir`. A child gate pauses the parent (`Blocked on sub-run`); approve the child's run id.
12. `fan_out` on a `workflow:` node refuses a child that contains an approval node ("interactive-class"), whatever its inputs say. `delivery-wave` launches children with `archon workflow run` from a bash node instead (`--branch`, `--base`, and `--input` are honoured; the environment is inherited).
13. `--dry-run --exec-code` delivers no `INPUTS_*` environment to included bash nodes, while a real run does; the `$INPUTS.x` macro in an included `bash:` body is substituted at include time in both. Included bash nodes therefore read `${INPUTS_X:-$INPUTS.x}`: the environment first, the include-time value second.

### Pack source

`scripts/build-packs.mjs` rewrites the native YAML line by line, so the source follows these conventions:

- Every AI node is `prompt: |` (a literal block scalar), with `context: fresh`.
- One workflow per `<pack>/<workflow>/<name>.yaml` directory; the generator writes `<pack>-omp/<workflow>/<name>-omp.yaml`, appends an "Oh My Pi flavor" line to the description, and copies `fixtures/*.stubs.yaml` verbatim (node ids are the same in both flavors, so `archon workflow test delivery-omp` runs the native fixtures). Fixtures live in `<pack>/<workflow>/fixtures/<name>.stubs.yaml`; see [docs/testing.md](../docs/testing.md).
- Runtime refs in prompts are `$node.output`, `$node.output.field`, or `$LOOP_PREV.node.output[.field]`; inputs are `$INPUTS.name`.
- A body node whose output a pack or block reads by id has an id distinct from every include alias packs use (`task`, `research`, `design`, `outline`, `prd`, `tdd`, `plan`, `implement`, `verify`, `app-test`, `review`, `pr`). Body ids: `create`, `cycle`, `once`, `phase`, `gate`, `phases`, `phases-auto`, `implement-phase`, `implement-phase-auto`, `review-phase`, `review-phase-auto`, `fix-phase`, `fix-phase-auto`, `loop`, `review-code`, `review-blocked`, `fix-review`, `verification`, `verify-implementation`, `verification-status`, `iterate-verify`, `verification-done`, `verification-blocked`, `test`, `test-app`, `iterate-app`, `test-done`, `test-blocked`, and in `delivery-bugfix` `reproduce`, `reproduce-auto`, `attempt`, `attempt-auto`, `verify-reproduction`, `attempt-count`, `not-reproduced`. The `delivery-research` node `research` shares its alias's name; it is the block's `returns` and nothing reads it by id.
- `output_format` on a prompt node states the JSON the skill's final answer must match and sits right after the `prompt: |` block; the requirement lives in the prompt, not in the skill, and the generator appends it to the OMP prompt.
