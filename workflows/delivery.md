# Delivery workflow

Atomic can run skills for you through its optional `delivery` workflow. Each step runs one skill in a new session and saves a task document, called an **artifact**. You can also run every skill by hand without Atomic.

Choose a fixed `workflow` for a known sequence, or `workflow=auto` to let JEV choose the next step. JEV is a TypeSafe service that reads the request and saved documents. Source: `atomic/workflows/delivery.ts` and `atomic/lib/`; skills: `skills/delivery/<name>/`. The portable `route-model` skill owns candidate validation and JEV model selection for every harness; Atomic delegates to it.

## Install and launch

Install Atomic using its [official guide](https://docs.bastani.ai/getting-started/installation), configure provider credentials, then install this optional integration:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
# Or install skills and workflow only in this repository:
npx github:MarkTripoli/skills portable --atomic --project --yes
```

`--atomic` installs all skills and the workflow. Without it, the installer installs skills and runtime worker definitions only. Selecting individual skills never adds an Atomic dependency.

Workflow resources are under `<Atomic agentDir>/workflows/skills-delivery/` (default `~/.atomic/agent/workflows/skills-delivery/`, respecting `ATOMIC_CODING_AGENT_DIR`) or project `.atomic/workflows/skills-delivery/`, with a discovery entry beside them. The workflow reads a complete portable skill installation: `~/.agents/skills`, `.agents/skills`, or the explicit `skills_dir` input.

Start Atomic from the target repository. These are **Atomic chat commands**, not shell arguments to append after `atomic`:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot gates=all branch=verbose-flag
```

See [Atomic workflow operations](https://docs.bastani.ai/workflows/operations) and [Atomic authoring](https://docs.bastani.ai/workflows/authoring). Discovering a workflow is not proof of a completed live delivery run.

## Inputs

Use bare `key=value` tokens, not shell-style `--input` flags. Atomic parses JSON values, so `verify=false` is a boolean and `max_steps=40` is a number.

| Input | Type/default | Meaning |
|---|---|---|
| `request` | required string | Requested outcome; keep credentials out |
| `task_dir` | optional string | Reuse an existing task; preserve its `task.md`, `slug`, `workflow`, `base`, branch, and artifacts |
| `skills_dir` | optional string | Complete portable skill root; see install paths above |
| `workflow` | string, `auto` | `auto`, `oneshot`, `lean`, `full`, `prd`, `bugfix`, `epic`, `program`, `resolve-reviews`, or `epic-wave` |
| `gates` | string, `all` | `all`, `none`, `plan`, or `pr`; no comma-separated list |
| `model` | string, `openai-codex/gpt-5.6-luna-fast` | Ordinary model; required for code-writing and unknown phases |
| `model_routing` | string, `auto` | `auto` asks JEV whether an eligible non-writing phase needs `reasoning_model`; `fixed` selects `model` without a JEV call |
| `reasoning_model` | string, `openai-codex/gpt-5.6-sol` | Stronger candidate for eligible phases in `model_routing=auto` |
| `app_test` | string, `none` | `none`, `web`, `ios`, or `android` |
| `app_target` | optional string | URL, bundle id, package, or app path for UI testing |
| `verify` | boolean, `true` | Run independent implementation verification before review |
| `max_steps` | number, `40` | Bound fresh skill sessions, including revisions and repairs |
| `branch` | optional string | Branch for a new task worktree |
| `base` | optional string | Base branch for the task worktree and pull request |

## Workflow choices and manual chains

Choose a sequence below. `auto` chooses again after each saved result. An explicit workflow does not disable automatic model selection; also set `model_routing=fixed` to avoid JEV routing. Code-writing and unknown steps always use `model`. Only `verify=false` disables independent verification; request app testing separately with `app_test`.

| Choice | Chain | Use when |
|---|---|---|
| `auto` | Judge the next phase at artifact boundaries, then execute it in a fresh stage | Evidence should determine research, design, and planning |
| `oneshot` | Small implementation, verify-implementation, review loop, describe-pr | The change is fully specified |
| `lean` | create-research-questions → create-research → create-structure-outline → implement-outline → verify-implementation → review loop → describe-pr | Shape is known; several files need ordered work |
| `full` | create-research-questions → create-research → create-design-discussion → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Designs compete or modules cross boundaries |
| `prd` | create-research → create-prd → create-tdd → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Product and technical design are required |
| `bugfix` | reproduce-bug → fix-bug → verify-implementation → review loop → describe-pr | Observed behavior differs from expected behavior |
| `epic` | Research → create-epic-plan → start-epic-delivery → ready children | Deliverables are independently mergeable and have dependencies |
| `program` | Research → create-prd → create-tdd → create-epic-plan → start-epic-delivery → ready children | Requirements span an initiative of child pull requests |
| `resolve-reviews` | resolve-pr-reviews | Existing task and PR need review feedback addressed |
| `epic-wave` | Recheck an existing epic's dependencies and run ready children | The next wave follows prerequisite merges |

Run `gather-sources` first when a request names external material. Run `record-evidence` when narrated video proof is needed. Neither requires Atomic.

## Gates and native controls

- `all`: review artifact and implementation boundaries.
- `plan`: review design discussion, PRD, TDD, plan, structure outline, epic plan, and reproduction boundaries.
- `pr`: review only the pull request description.
- `none`: show no human UI prompts. This is the only supported headless mode.

A **gate** is an approval step. Connect to the run, read the saved document and its checks and limits, then answer the prompt. Requested changes start a new revision session. Only a person can approve.

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` opens the graph and pending prompts. `pause` holds resumable work. `quit` pauses gracefully and preserves durable progress; it does not delete the task. `resume` uses Atomic's saved run state when available. Use the exact run id shown by Atomic. Do not invent shell `approve`, `reject`, `wait`, or `connect` commands.

Headless dispatch cannot answer a human prompt because `ctx.ui` is unavailable. Set `gates=none` before launch. Missing JEV credentials and blocked artifacts remain errors or blockers; they do not bypass required checks.

## Controller decisions and JEV

The controller uses `skills/delivery/typed-judgment/judge.mjs` through its System One/`ask` integration. Credential order is `TYPESAFE_API_KEY`, then the file named by `TYPESAFE_API_KEY_FILE`, then `~/.config/typesafe/api_key`. Keep the key outside the repository. The [typed-judgment skill](../skills/delivery/typed-judgment/SKILL.md) documents timeout, retry, and evidence rules.

`workflow=auto` requires JEV for phase selection. `model_routing=auto` is independent and is also the default, so choosing an explicit workflow does not make the run JEV-free. `model_routing=fixed` selects the caller's `model` directly and skips JEV for stage-model selection; missing credentials or service availability cannot affect that fixed model path. Individual skills keep their documented deterministic fallback when their own judgment is optional. Atomic records the selected model, and native stages record actual `modelAttempts`.

`NN-execution-plan-<slug>.md` records controller phase decisions. Research and design artifacts remain authoritative; stage conversations are not cross-stage memory. `max_steps` bounds all skill sessions, including failing review or revision loops. A blocked phase reports its missing prerequisite and is not successful completion.

## Verification, app testing, and review

Implementation runs one plan phase or outline step per fresh stage. The controller reads saved artifacts, not a stage's prose claim. Every skill and revision uses `context: "fresh"`.

If the current plan or outline cannot be read, the workflow records the error and runs `iterate-plan` or `iterate-structure-outline`. It does not use an older document or restart planning. The revision must restore numbered phases and usable checklists.

If an implementation step saves a new report without advancing the checklist, the workflow records the stalled work instead of accepting success:

- The before/after comparison decides this, not the report's wording.
- The record includes the report, source filenames and hashes, and reason. Next choices are only `iterate-plan`, `iterate-implementation`, or `blocked`.
- A revised plan may clear the record even if the number of remaining items stays unchanged. An implementation repair that still makes no progress cannot.

Code changes require new verification and review. Completion needs a truthful implementation report to replace the stalled-work report.

Unless `verify=false`, `verify-implementation` runs repository checks and promised acceptance items independently. Enabled `test-app` exercises the real application. Failures route to `iterate-implementation`, followed by a new verification or app-test stage. `review-code` and `fix-code-review` repeat until clean, blocked, or bounded by `max_steps`. These checks precede the pull request description. See [verification](../docs/verification.md) and [app testing](../docs/app-testing.md).

## Task, artifact, and worktree ownership

A task is `.agents/tasks/<slug>/task.md` plus numbered artifacts. `.agents/tasks/` is committed project history, not temporary controller state. Revisions edit their existing artifact; new phases take the next number. `pr-description.md` is unnumbered and has no frontmatter because it is the PR body. [Collection conventions](../shared/CONVENTIONS.md) define exact formats and commit ownership.

A new task gets its own persistent worktree and branch. An explicit existing `task_dir` reuses its task and artifacts. Continue manual sessions in the checkout and branch printed in the handoff. Code commits stage explicit code paths; artifact commits stage only task files. A workflow operation never authorizes committing unrelated staged work.

Atomic owns run state. The user owns task branches, artifacts, and worktrees. Pausing, quitting, uninstalling skills, or replacing the controller does not authorize deleting task records or cancelled-run worktrees. Historical engine checkpoints are not Atomic checkpoints; continue from preserved artifacts in a new `delivery` run when necessary.

## Epics

An **epic** splits work into child tasks that can each merge separately. Each child needs `workflow`, `depends_on`, acceptance criteria, and a prompt. `start-epic-delivery` creates their task directories and GitHub issues when access is available. See [task-sizing rules](../shared/SLICING.md).

Ready children run in separate worktrees. Prerequisite branches must have merged; a pull request description is not proof. The workflow does not merge pull requests. Merge them separately, then run `workflow=epic-wave` with the same epic `task_dir`.

```text
/workflow delivery request="Build usage billing" workflow=program branch=epic-billing gates=plan
/workflow delivery request="Run the next ready wave" workflow=epic-wave task_dir=.agents/tasks/billing gates=none
/workflow delivery request="Address the PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/billing-client branch=billing-client
```

## Phase table

Artifact type is the template's frontmatter `type`. Human gates apply only when enabled; every skill also works by hand. Worker-role skills are listed separately in the source tree.

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
| configure-model-routing | none | no | By hand or model-invoked; creates and verifies the shared candidate profile |
| herd-next | none | no | By hand inside Herdr; stage the next session |
| verify-implementation | verification | no | Before review unless `verify=false`; also by hand |
| test-app | app-test | no | When `app_test` is enabled; also by hand |
| typed-judgment | none | no | Optional skill judgments and controller JEV routing |
| jev-ui | none | no | By hand; bounded browser and Android control |
| describe-pr | pr-description | yes | Final PR description and its revisions |
| resolve-pr-reviews | pr-review | no | Existing PR review round |
| ci-commit | commit | no | By hand; explicit-path commit conventions |
| review-artifact-comments | comment-review | no | By hand; artifact feedback |
| show-me | show-me | no | By hand; visual explanation |
| safety-dance | none | no | By hand |

## Running skills by hand

Invoke `/<skill> @<artifact or task directory>` in Claude Code, OMP, Pi, or another compatible host; use `$<skill>` in Codex. An individual skill needs no Atomic installation or running controller. Unless an exception applies, task conventions open a worktree for a new task. Later phases use that checkout and branch.

Use the phase table as a guide, not a requirement to install every phase. A manual handoff names the saved artifact and ends with:

````markdown
Next action:
Open a new session in {run_location}, then run:

```text
/<next-skill> @<artifact_file>
```
````

Running the next phase records approval in a manual chain. To revise first, start a new session with the appropriate `iterate-*` skill and feedback. A terminal reply has no command fence. Atomic uses the same artifacts and supplies controller context in its stage prompt; the standalone human invocation contract remains unchanged.