# Delivery workflow

The optional Atomic workflow registered as `delivery` coordinates the same independent skills that a person can invoke by hand. Source: `atomic/workflows/delivery.ts`, with deterministic and typed-judgment helpers in `atomic/lib/`. Ordinary phase skills remain in `skills/delivery/<name>/`; they do not import Atomic or require a workflow run.

The controller examines the request and saved task artifacts at each boundary, selects a skill, runs it in a fresh native Atomic stage, and records the result before deciding again. A fixed `workflow` selects a known chain; `auto` uses JEV judgments to choose the next phase from the current evidence. This is dynamic control flow, not generated per-runtime workflow copies.

## Install and launch

Install Atomic separately from its [official installation guide](https://docs.bastani.ai/getting-started/installation), configure provider credentials, and install this optional integration:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
# Or install skills and workflow only in this repository:
npx github:MarkTripoli/skills portable --atomic --project --yes
```

`--atomic` requires every skill. Without it the installer installs skills and runtime worker definitions only. Selecting individual skills never adds an orchestration dependency.

Workflow resources live under `<Atomic agentDir>/workflows/skills-delivery/` (default `~/.atomic/agent/workflows/skills-delivery/`, respecting `ATOMIC_CODING_AGENT_DIR`) or project `.atomic/workflows/skills-delivery/`, with a discovery entry installed alongside them. The workflow reads a full portable skill installation: `~/.agents/skills` for a user install, `.agents/skills` for a project install, or the explicit `skills_dir` input.

Start Atomic from the target repository. The following commands are **Atomic chat commands**, not commands to append after `atomic` in a shell:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot gates=all branch=verbose-flag
```

Official command and lifecycle reference: [Atomic workflow operations](https://docs.bastani.ai/workflows/operations). TypeScript workflow contract: [Atomic authoring](https://docs.bastani.ai/workflows/authoring). Documentation examples describe the contract; discovering a workflow is not proof of a completed live delivery run.

## Inputs

Use bare `key=value` tokens, not shell-style `--input` flags. Atomic parses JSON values, so `verify=false` is a boolean and `max_steps=40` a number.

| Input | Type/default | Meaning |
|---|---|---|
| `request` | required string | The requested outcome; keep credentials out of it |
| `task_dir` | optional string | Reuse an existing task; read `task.md` and preserve its request, `slug`, `workflow`, `base`, branch, and artifacts |
| `skills_dir` | optional string | Complete portable skill root; installation defaults described above |
| `workflow` | string, `auto` | `auto`, `oneshot`, `lean`, `full`, `prd`, `bugfix`, `epic`, `program`, `resolve-reviews`, or `epic-wave` |
| `gates` | string, `all` | `all`, `none`, `plan`, or `pr`; no comma-separated gate list |
| `model` | string, `openai-codex/gpt-5.6-luna-fast` | Ordinary economical stage model; explicit values are honored and it is mandatory for code-writing and unknown phases |
| `model_routing` | string, `auto` | `auto` asks JEV whether `model` suffices or `reasoning_model` is required for eligible non-writing phases; `fixed` selects `model` directly with no JEV call |
| `reasoning_model` | string, `openai-codex/gpt-5.6-sol` | Stronger reasoning candidate considered only by eligible phases in `model_routing=auto` |
| `app_test` | string, `none` | `none`, `web`, `ios`, or `android` |
| `app_target` | optional string | URL, bundle id, package, or app path for UI testing |
| `verify` | boolean, `true` | Run independent implementation verification before review |
| `max_steps` | number, `40` | Bound skill sessions, including revisions and repair attempts |
| `branch` | optional string | Task branch for a new task worktree |
| `base` | optional string | Base branch for task worktree and pull request |

## Workflow choices and manual chains

These are values of one workflow's `workflow` input, not separately registered workflow names. `auto` revisits phase selection from artifacts; an explicit choice follows its chain. An explicit workflow does not disable stage-model JEV; add `model_routing=fixed` when the whole run must be JEV-free. In stage-model `auto`, JEV choices are `economy` (the ordinary `model`) and `reasoning` (the configured `reasoning_model`); code-writing and unknown phases always use `model`. Verification can be disabled only with `verify=false`; application testing is requested separately.

| Choice | Chain | Use when |
|---|---|---|
| `auto` | Judge the next phase at artifact boundaries, then execute it in a fresh stage | Let evidence determine the amount of research, design, and planning |
| `oneshot` | Small implementation, verify-implementation, review-code/fix-code-review, describe-pr | Fully specified change with no open design choice |
| `lean` | create-research-questions → create-research → create-structure-outline → implement-outline → verify-implementation → review loop → describe-pr | Shape known; several files and ordered steps |
| `full` | create-research-questions → create-research → create-design-discussion → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Competing designs or cross-module impact |
| `prd` | create-research → create-prd → create-tdd → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Requirements need product and technical design |
| `bugfix` | reproduce-bug → fix-bug → verify-implementation → review loop → describe-pr | Observed behavior differs from expected behavior; fix waits for reproduction |
| `epic` | Research → create-epic-plan → start-epic-delivery → ready children | Independently mergeable deliverables with dependencies |
| `program` | Research → create-prd → create-tdd → create-epic-plan → start-epic-delivery → ready children | Requirements through an initiative of child pull requests |
| `resolve-reviews` | resolve-pr-reviews | Address review feedback on an existing task and PR |
| `epic-wave` | Recheck an existing epic's dependencies and run ready children | Start the next wave after prerequisite branches merge |

Run `gather-sources` first when the request names external material that later phases need. Run `record-evidence` when narrated video proof is needed. Neither requires optional orchestration.

## Gates and native controls

- `all`: review artifact and implementation boundaries.
- `plan`: review planning boundaries: design discussion, PRD, TDD, plan, structure outline, epic plan, and reproduction.
- `pr`: review the pull request description only.
- `none`: no human UI calls. This is the only supported mode for headless execution.

Gates appear in Atomic's native workflow UI. Connect to the run, read the artifact and its verification/known-limits sections, then answer the prompt. Requesting changes passes feedback to a fresh revision stage; approval continues. Model judgments never impersonate human approval.

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` opens the graph and pending human prompts. `pause` holds work resumably; `quit` gracefully pauses while preserving durable progress rather than deleting the task. `resume` uses Atomic's saved run state when available. Use the exact run id shown by Atomic. Do not invent shell `approve`, `reject`, `wait`, or `connect` subcommands.

Headless dispatch can reach a human prompt only to fail: Atomic's `ctx.ui` interaction is unavailable there. Choose `gates=none` before launching headlessly; a missing JEV key or blocked artifact remains an error/blocker, not permission to bypass a required check.

## Controller decisions and JEV

The controller uses the existing `skills/delivery/typed-judgment/judge.mjs` System One/`ask` integration for JEV. Its credential order is `TYPESAFE_API_KEY`, then the file named by `TYPESAFE_API_KEY_FILE`, then `~/.config/typesafe/api_key`. Keep the key outside the repository. See the [typed-judgment skill](../skills/delivery/typed-judgment/SKILL.md) for the helper's timeout, retry, and evidence contract.

`workflow=auto` requires an available typed judgment for phase selection. Stage-model routing also defaults to `model_routing=auto`, so an explicit workflow choice alone does not make a run JEV-free. Use `model_routing=fixed` to select the caller's `model` directly and skip JEV for stage-model selection; missing credentials or an unavailable service then cannot affect that fixed stage path. Individual skills retain their documented deterministic fallback where typed judgments are optional. Atomic's own routing records preserve the selected model and native stage records preserve actual `modelAttempts`.

The controller-owned `NN-execution-plan-<slug>.md` artifact records phase decisions. Research and design artifacts remain the source of truth; stage conversations are not cross-stage memory. `max_steps` limits the total skill sessions so a repeatedly failing review or revision cannot run forever. A blocked phase reports the missing prerequisite; it is not counted as successful completion.

## Verification, app testing, and review

Implementation runs one plan phase or outline step at a time. The controller reads saved artifacts rather than treating a stage's prose claim as completion. Each new skill or revision runs with `context: "fresh"`.

Unless `verify=false`, `verify-implementation` independently runs repository checks and the promised acceptance items. An enabled `test-app` phase exercises the real application surface. Failures return to `iterate-implementation`; a new verification/testing stage checks the repair. `review-code` and `fix-code-review` repeat until the review is clean or the run reaches a blocker or its step bound. These checks precede the final pull request description. See [verification](../docs/verification.md) and [app testing](../docs/app-testing.md).

## Task, artifact, and worktree ownership

A task is `.agents/tasks/<slug>/task.md` plus numbered artifacts. `.agents/tasks/` is committed project history, not disposable workflow state. Revisions edit their existing artifact; new phases take the next number. `pr-description.md` is unnumbered and has no frontmatter because it is the PR body. The [collection conventions](../shared/CONVENTIONS.md) define the exact formats and commit ownership.

A new task opens its own persistent worktree and branch; an explicit existing `task_dir` reuses the task and its artifacts. Continue later manual sessions in the checkout and branch printed in the handoff. Stage code commits use explicit paths; artifact commits stage only the task's files. A workflow-owned operation does not authorize committing unrelated staged work.

Atomic owns its run state; the user owns task branches, artifacts, and worktrees. Pausing, quitting, uninstalling skills, or replacing orchestration does not authorize deleting old task records or cancelled-run worktrees. Historical engine checkpoints are not imported as Atomic checkpoints: continue from preserved artifacts in a new `delivery` run when necessary.

## Epics

Epic plans describe one independently mergeable obligation per child, with `workflow`, `depends_on`, acceptance criteria, and prompt. `start-epic-delivery` creates the child task directories and, when GitHub prerequisites are available, their issues. See [shared/SLICING.md](../shared/SLICING.md).

Ready children run as child workflows in separate worktrees. Readiness requires prerequisite branch merge ancestry, not merely the presence of a PR-description artifact. The workflow does not merge pull requests. Unmerged dependencies block later waves; merge/review externally, then invoke the same registered workflow with `workflow=epic-wave` and the existing epic `task_dir`.

```text
/workflow delivery request="Build usage billing" workflow=program branch=epic-billing gates=plan
/workflow delivery request="Run the next ready wave" workflow=epic-wave task_dir=.agents/tasks/billing gates=none
/workflow delivery request="Address the PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/billing-client branch=billing-client
```

## Phase table

Artifact type is the template's frontmatter `type`. Human gates below apply when enabled by the workflow; every skill is also usable by hand. Worker-role skills are listed separately in the source tree.

| Skill | Artifact type | Human gate | Runs in |
|---|---|---|---|
| gather-sources | sources | no | By hand before a chain; external source digest |
| create-research-questions | research-questions | no | Research |
| iterate-research-questions | research-questions | optional | Research revision or by hand |
| create-research | research | no | Research |
| iterate-research | research | optional | Research revision or by hand |
| create-design-discussion | design-discussion | yes | Full or auto design |
| iterate-design-discussion | design-discussion | yes | Design feedback |
| create-prd | design-prd | yes | PRD, program, or auto |
| iterate-prd | design-prd | yes | PRD feedback |
| create-tdd | design-tdd | yes | PRD, program, or auto |
| iterate-tdd | design-tdd | yes | TDD feedback |
| create-structure-outline | structure-outline | yes | Lean or auto planning |
| iterate-structure-outline | structure-outline | yes | Outline feedback |
| create-plan | plan | yes | Full, PRD, or auto planning |
| iterate-plan | plan | yes | Plan feedback |
| create-epic-plan | epic-plan | yes | Epic or program; also revises its plan |
| start-epic-delivery | epic-delivery | no | Epic or program child preparation |
| implement-plan | implementation | yes | One plan phase per stage |
| implement-outline | implementation | yes | One outline step per stage |
| iterate-implementation | implementation | yes | Implementation feedback and repairs |
| review-code | code-review | no | Review loop |
| fix-code-review | code-review-fixes | no | Repair review findings |
| reproduce-bug | reproduction | yes | Bugfix before product edits |
| fix-bug | fix | no | Bugfix after reproduction |
| record-evidence | evidence | no | By hand; narrated video proof |
| deliver | none | no | Independent entry point; optional Atomic handoff |
| herd-next | none | no | By hand inside Herdr; stage the next session |
| verify-implementation | verification | no | Before review unless `verify=false`; also by hand |
| test-app | app-test | no | When `app_test` is enabled; also by hand |
| typed-judgment | none | no | Optional skill judgments and controller JEV routing |
| describe-pr | pr-description | yes | Final PR description and its revisions |
| resolve-pr-reviews | pr-review | no | Existing PR review round |
| ci-commit | commit | no | By hand; explicit-path commit conventions |
| review-artifact-comments | comment-review | no | By hand; artifact feedback |
| show-me | show-me | no | By hand; visual explanation |

## Running skills by hand

Invoke `/<skill> @<artifact or task directory>` in Claude Code, OMP, Pi, or another compatible host; use `$<skill>` in Codex. An individual skill needs no Atomic installation or running controller. The task conventions open a worktree for a new task unless an explicit exception applies. Later phases use that same checkout and branch.

Use the chain table above as a guide, not a requirement to install every phase. A normal handoff names the saved artifact and ends with:

````markdown
Next action:
Open a new session in {run_location}, then run:

```text
/<next-skill> @<artifact_file>
```
````

Running the next phase records approval in a manual chain. To revise first, start a new session with the appropriate `iterate-*` skill and your feedback. A terminal reply has no next-command fence. Atomic orchestration consumes the same artifacts while its stage prompt supplies orchestration context; the ordinary human invocation contract stays intact.
