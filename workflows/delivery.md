# Delivery workflow

Atomic run skill for you with optional `delivery` workflow. Each step run one skill in new session, save task doc — call **artifact**. You can run every skill by hand, no Atomic.

Pick fixed `workflow` for known sequence, or `workflow=auto` so JEV pick next step. JEV be TypeSafe service that read request and saved docs. Source: `atomic/workflows/delivery.ts` and `atomic/lib/`; skills: `skills/delivery/<name>/`. Portable `route-model` skill own candidate validation and JEV model pick for every harness; Atomic hand off to it.

## Install and launch

Install Atomic with [official guide](https://docs.bastani.ai/getting-started/installation), set provider creds, then install this optional integration:

```sh
npx github:MarkTripoli/skills portable --atomic --yes
# Or install skills and workflow only in this repository:
npx github:MarkTripoli/skills portable --atomic --project --yes
```

`--atomic` install all skills and workflow. Without it, installer put in skills and runtime worker defs only. Pick single skills — never add Atomic dependency.

Workflow stuff live under `<Atomic agentDir>/workflows/skills-delivery/` (default `~/.atomic/agent/workflows/skills-delivery/`, respect `ATOMIC_CODING_AGENT_DIR`) or project `.atomic/workflows/skills-delivery/`, with discovery entry beside them. Workflow read complete portable skill install: `~/.agents/skills`, `.agents/skills`, or explicit `skills_dir` input.

Start Atomic from target repo. These be **Atomic chat commands**, not shell args to tack after `atomic`:

```text
/workflow reload
/workflow list
/workflow inputs delivery
/workflow delivery request="Add a --verbose flag to the CLI" workflow=oneshot gates=all branch=verbose-flag
```

See [Atomic workflow operations](https://docs.bastani.ai/workflows/operations) and [Atomic authoring](https://docs.bastani.ai/workflows/authoring). Find workflow not prove live delivery run happen.

## Inputs

Use bare `key=value` tokens, not shell `--input` flags. Atomic parse JSON, so `verify=false` be boolean and `max_steps=40` be number.

| Input | Type/default | Meaning |
|---|---|---|
| `request` | required string | Wanted outcome; keep creds out |
| `task_dir` | optional string | Reuse existing task; keep its `task.md`, `slug`, `workflow`, `base`, branch, artifacts |
| `skills_dir` | optional string | Complete portable skill root; see install paths above |
| `workflow` | string, `auto` | `auto`, `oneshot`, `lean`, `full`, `prd`, `bugfix`, `epic`, `program`, `resolve-reviews`, or `epic-wave` |
| `gates` | string, `all` | `all`, `none`, `plan`, or `pr`; no comma list |
| `model` | string, `openai-codex/gpt-5.6-luna-fast` | Ordinary model; must have for code-writing and unknown phases |
| `model_routing` | string, `auto` | `auto` ask JEV if eligible non-writing phase need `reasoning_model`; `fixed` pick `model`, no JEV call |
| `reasoning_model` | string, `openai-codex/gpt-5.6-sol` | Stronger candidate for eligible phases in `model_routing=auto` |
| `app_test` | string, `none` | `none`, `web`, `ios`, or `android` |
| `app_target` | optional string | URL, bundle id, package, or app path for UI test |
| `verify` | boolean, `true` | Run own implementation verify before review |
| `max_steps` | number, `40` | Cap fresh skill sessions, revisions and repairs too |
| `branch` | optional string | Branch for new task worktree |
| `base` | optional string | Base branch for task worktree and pull request |

## Workflow choices and manual chains

Pick sequence below. `auto` pick again after each saved result. Explicit workflow not turn off auto model pick; also set `model_routing=fixed` to dodge JEV routing. Code-writing and unknown steps always use `model`. Only `verify=false` turn off own verify; ask for app test apart with `app_test`.

| Choice | Chain | Use when |
|---|---|---|
| `auto` | Judge next phase at artifact edges, then run it in fresh stage | Evidence should pick research, design, planning |
| `oneshot` | Small implementation, verify-implementation, review loop, describe-pr | Change fully spelled out |
| `lean` | create-research-questions → create-research → create-structure-outline → implement-outline → verify-implementation → review loop → describe-pr | Shape known; many files need ordered work |
| `full` | create-research-questions → create-research → create-design-discussion → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Designs fight or modules cross lines |
| `prd` | create-research → create-prd → create-tdd → create-structure-outline → create-plan → implement-plan → verify-implementation → review loop → describe-pr | Need product and technical design |
| `bugfix` | reproduce-bug → fix-bug → verify-implementation → review loop → describe-pr | Seen behavior differ from wanted behavior |
| `epic` | Research → create-epic-plan → start-epic-delivery → ready children | Deliverables merge on own and have deps |
| `program` | Research → create-prd → create-tdd → create-epic-plan → start-epic-delivery → ready children | Needs span initiative of child pull requests |
| `resolve-reviews` | resolve-pr-reviews | Existing task and PR need review feedback handled |
| `epic-wave` | Recheck existing epic deps and run ready children | Next wave come after prereq merges |

Run `gather-sources` first when request name outside material. Run `record-evidence` when need narrated video proof. Neither need Atomic.

## Gates and native controls

- `all`: review artifact and implementation edges.
- `plan`: review design discussion, PRD, TDD, plan, structure outline, epic plan, reproduction edges.
- `pr`: review only pull request description.
- `none`: show no human UI prompts. Only headless mode that work.

A **gate** be approval step. Connect to run, read saved doc and its checks and limits, then answer prompt. Ask for changes start new revision session. Only person can approve.

```text
/workflow status
/workflow status <run-id>
/workflow connect <run-id>
/workflow pause <run-id>
/workflow quit <run-id>
/workflow resume <run-id>
```

`connect` open graph and waiting prompts. `pause` hold resumable work. `quit` pause nice and keep durable progress; it not delete task. `resume` use Atomic saved run state when there. Use exact run id Atomic show. Do not make up shell `approve`, `reject`, `wait`, or `connect` commands.

Headless dispatch cannot answer human prompt, `ctx.ui` not there. Set `gates=none` before launch. Missing JEV creds and blocked artifacts stay errors or blockers; they not skip required checks.

## Controller decisions and JEV

Controller use `skills/delivery/typed-judgment/judge.mjs` through its System One/`ask` integration. Cred order be `TYPESAFE_API_KEY`, then file named by `TYPESAFE_API_KEY_FILE`, then `~/.config/typesafe/api_key`. Keep key outside repo. The [typed-judgment skill](../skills/delivery/typed-judgment/SKILL.md) write down timeout, retry, evidence rules.

`workflow=auto` need JEV for phase pick. `model_routing=auto` stand apart and be default too, so pick explicit workflow not make run JEV-free. `model_routing=fixed` pick caller `model` straight and skip JEV for stage-model pick; missing creds or service being down cannot touch that fixed model path. Single skills keep their written deterministic fallback when own judgment be optional. Atomic write down picked model, and native stages write down real `modelAttempts`.

`NN-execution-plan-<slug>.md` write down controller phase decisions. Research and design artifacts stay boss; stage talk not cross-stage memory. `max_steps` cap all skill sessions, failing review or revision loops too. Blocked phase report its missing prereq and be not successful completion.

## Verification, app testing, and review

Implementation run one plan phase or outline step per fresh stage. Controller read saved artifacts, not stage prose claim. Every skill and revision use `context: "fresh"`.

If current plan or outline cannot be read, workflow write down error and run `iterate-plan` or `iterate-structure-outline`. It not use older doc or restart planning. Revision must bring back numbered phases and usable checklists.

If implementation step save new report but not move checklist, workflow write down stalled work instead of taking success:

- Before/after compare decide this, not report wording.
- Record hold report, source filenames and hashes, reason. Next choices be only `iterate-plan`, `iterate-implementation`, or `blocked`.
- Revised plan may clear record even if remaining item count stay same. Implementation repair that still make no progress cannot.

Code changes need new verify and review. Completion need truthful implementation report to swap out stalled-work report.

Unless `verify=false`, `verify-implementation` run repo checks and promised acceptance items on own. Turned-on `test-app` work real app. Failures go to `iterate-implementation`, then new verify or app-test stage. `review-code` and `fix-code-review` repeat till clean, blocked, or capped by `max_steps`. These checks come before pull request description. See [verification](../docs/verification.md) and [app testing](../docs/app-testing.md).

## Task, artifact, and worktree ownership

Task be `.agents/tasks/<slug>/task.md` plus numbered artifacts. `.agents/tasks/` be committed project history, not throwaway controller state. Revisions edit their existing artifact; new phases take next number. `pr-description.md` have no number and no frontmatter, because it be PR body. [Collection conventions](../shared/CONVENTIONS.md) set exact formats and commit ownership.

New task get own lasting worktree and branch. Explicit existing `task_dir` reuse its task and artifacts. Keep manual sessions going in checkout and branch printed in handoff. Code commits stage explicit code paths; artifact commits stage only task files. Workflow operation never allow committing unrelated staged work.

Atomic own run state. User own task branches, artifacts, worktrees. Pausing, quitting, uninstalling skills, or swapping controller not allow deleting task records or cancelled-run worktrees. Old engine checkpoints be not Atomic checkpoints; keep going from kept artifacts in new `delivery` run when need.

## Epics

An **epic** split work into child tasks that each merge apart. Each child need `workflow`, `depends_on`, acceptance criteria, prompt. `start-epic-delivery` make their task dirs and GitHub issues when access there. See [task-sizing rules](../shared/SLICING.md).

Ready children run in separate worktrees. Prereq branches must have merged; pull request description be no proof. Workflow not merge pull requests. Merge them apart, then run `workflow=epic-wave` with same epic `task_dir`.

```text
/workflow delivery request="Build usage billing" workflow=program branch=epic-billing gates=plan
/workflow delivery request="Run the next ready wave" workflow=epic-wave task_dir=.agents/tasks/billing gates=none
/workflow delivery request="Address the PR feedback" workflow=resolve-reviews task_dir=.agents/tasks/billing-client branch=billing-client
```

## Phase table

Artifact type be template frontmatter `type`. Human gates count only when turned on; every skill work by hand too. Worker-role skills sit apart in source tree.

| Skill | Artifact type | Human gate | Runs in |
|---|---|---|---|
| gather-sources | sources | no | By hand before chain; outside source digest |
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
| create-epic-plan | epic-plan | yes | Epic or program; revise its plan too |
| start-epic-delivery | epic-delivery | no | Epic or program child prep |
| implement-plan | implementation | yes | One plan phase per stage |
| implement-outline | implementation | yes | One outline step per stage |
| iterate-implementation | implementation | yes | Implementation feedback and repairs |
| review-code | code-review | no | Review loop |
| fix-code-review | code-review-fixes | no | Repair review findings |
| reproduce-bug | reproduction | yes | Bugfix before product edits |
| fix-bug | fix | no | Bugfix after reproduction |
| record-evidence | evidence | no | By hand; narrated video proof |
| iterate-evidence | evidence-iteration | no | Own authorized capture, inspect, repair loop |
| deliver | none | no | Own entry point; optional Atomic handoff |
| configure-model-routing | none | no | By hand or model-invoked; make and check shared candidate profile |
| herd-next | none | no | By hand inside Herdr; stage next session |
| verify-implementation | verification | no | Before review unless `verify=false`; by hand too |
| test-app | app-test | no | When `app_test` turned on; by hand too |
| typed-judgment | none | no | Optional skill judgments and controller JEV routing |
| jev-ui | none | no | By hand; capped browser and Android control |
| describe-pr | pr-description | yes | Final PR description and its revisions |
| resolve-pr-reviews | pr-review | no | Existing PR review round |
| ci-commit | commit | no | By hand; explicit-path commit conventions |
| review-artifact-comments | comment-review | no | By hand; artifact feedback |
| show-me | show-me | no | By hand; visual explanation |
| safety-dance | none | no | By hand |
| slack-coordinator | none | no | By hand; one Slack thread per run |

## Running skills by hand

Call `/<skill> @<artifact or task directory>` in Claude Code, OMP, Pi, or other compatible host; use `$<skill>` in Codex. Single skill need no Atomic install, no running controller. Unless exception hit, task conventions open worktree for new task. Later phases use that checkout and branch.

`iterate-evidence` on own put together `record-evidence` for explicitly authorized, capped repair loop. It save one append-only receipt and look at newly recorded pixels before settling findings. Atomic controller not schedule it. Install it with [repository installer](../docs/getting-started.md#inspect-and-repair-recorded-behavior) so recorder dependency come along; record-only requests still use `record-evidence`.

Use phase table as guide, not demand to install every phase. Manual handoff name saved artifact and end with:

````markdown
Next action:
Open a new session in {run_location}, then run:

```text
/<next-skill> @<artifact_file>
```
````

Running next phase write down approval in manual chain. To revise first, start new session with right `iterate-*` skill and feedback. Terminal reply have no command fence. Atomic use same artifacts and give controller context in its stage prompt; standalone human invocation contract stay same.