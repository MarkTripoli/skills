# Delivery workflow

A task moves from request to merged pull request through phases. Each phase is one skill, runs in a fresh context, reads only `task.md` and the artifacts it selects, writes one artifact into `.agents/tasks/<slug>/`, and ends with one command fence naming the next phase. Human gates stop the chain until the user approves by running the next command. The file and reply contracts are in [shared/CONVENTIONS.md](../shared/CONVENTIONS.md).

## Workflow types

`workflow` in `task.md` selects the chain.

| Type | Chain | Use when |
|---|---|---|
| `full` | create-research-questions, create-research, create-design-discussion, create-plan, setup-worktree, implement-plan, describe-pr, resolve-pr-reviews | The change needs research and a design decision before planning. Default. |
| `lean` | create-research-questions, create-research, create-structure-outline, setup-worktree, implement-outline, describe-pr, resolve-pr-reviews | The change is bounded; a phased outline is enough structure. |
| `prd` | create-research, create-prd, create-tdd, create-plan, setup-worktree, implement-plan, describe-pr, resolve-pr-reviews | Product and technical decisions need interactive sessions with the user. |
| `oneshot` | one session: implement, verify, commit, then describe-pr, resolve-pr-reviews | The request is a fully specified change; no artifacts are required before implementing. |

`setup-worktree` is skipped when the project already runs inside a worktree or `.agents/workspace.json` has `disabled: true`; the plan and outline skills detect this with the conventions' Worktree probe and hand off straight to the implementation skill.

### Choosing a type

`/start-task <request>` picks the type for you, or asks up to three questions when the request leaves it open, then creates the task and hands off to `/run-task @<task dir>`. Its routes, first match wins:

| Route | When | Result |
|---|---|---|
| direct | a question, or a single edit whose location and content are already known | no task; ask for the change in the session |
| `oneshot` | a bug fix or small change with a stated expected behavior and a way to verify it, no design choice | one session implements and commits, then `describe-pr` |
| `lean` | the shape is clear but several files and an ordering are involved | the lean chain |
| `full` | competing approaches, cross-module impact, migrations, changed interfaces | the full chain |
| `prd` | the requirement itself is open, or the work is product-facing | the prd chain |
| epic | several independently mergeable deliverables, or more than about eight plan phases | a parent task and `/create-epic-plan` |

A type named in the request wins over the table. A request that names a code review or video proof gets `with: [review-loop]`, `with: [record-evidence]`, or both; `with: [review-loop]` accepts an optional `--max-depth <n>` (or `max_depth: <n>` in `task.md`) to cap the loop's iterations.

## Phase table

`run-task` uses this table to find the next command from the newest artifact and to decide where to stop. "Interactive" phases need the user in the loop for the whole session and never run in a subagent.

| Skill | Artifact type | Next command | Human gate | Interactive |
|---|---|---|---|---|
| create-research-questions | research-questions | /create-research | no | no |
| iterate-research-questions | research-questions | /create-research | no | yes |
| create-research | research | /create-design-discussion (`full`), /create-structure-outline (`lean`), /create-prd (`prd`) | no | no |
| iterate-research | research | /create-design-discussion (`full`), /create-structure-outline (`lean`), /create-prd (`prd`) | no | yes |
| create-design-discussion | design-discussion | /create-plan | yes | no |
| iterate-design-discussion | design-discussion | /create-plan | yes | yes |
| create-prd | design-prd | /create-tdd | yes | yes |
| iterate-prd | design-prd | /create-tdd | yes | yes |
| create-tdd | design-tdd | /create-plan | yes | yes |
| iterate-tdd | design-tdd | /create-plan | yes | yes |
| create-structure-outline | structure-outline | /implement-outline, or /setup-worktree per the Worktree probe | yes | no |
| iterate-structure-outline | structure-outline | /implement-outline, or /setup-worktree per the Worktree probe | yes | yes |
| create-plan | plan | /setup-worktree, or /implement-plan per the Worktree probe | yes | no |
| iterate-plan | plan | /setup-worktree, or /implement-plan per the Worktree probe | yes | yes |
| create-epic-plan | epic-plan | /start-epic-delivery | yes | no |
| start-epic-delivery | epic-delivery | one start command per wave-1 child | yes | no |
| configure-workspaces | workspace-config | /setup-worktree | yes | yes |
| setup-worktree | worktree-setup | /implement-plan (`full`, `prd`) or /implement-outline (`lean`) | no | no |
| implement-plan | implementation | /implement-plan between phases, then /describe-pr | yes | no |
| implement-outline | implementation | /implement-outline between phases, then /describe-pr | yes | no |
| iterate-implementation | implementation | /implement-plan or /implement-outline between phases, then /describe-pr | yes | yes |
| review-loop | review-loop | /describe-pr on a clean review; stops and reports on the depth cap or a blocked gate | no | no |
| review-code | code-review | /fix-code-review while findings remain, otherwise /describe-pr | no | no |
| fix-code-review | code-review-fixes | /review-code | no | no |
| record-evidence | evidence | /describe-pr when every test passed or is untested, /iterate-implementation when one failed | no | no |
| describe-pr | pr-description | /resolve-pr-reviews | yes | no |
| resolve-pr-reviews | pr-review | /resolve-pr-reviews until the pull request is approved | yes | no |
| ci-commit | commit | /describe-pr | no | no |
| review-artifact-comments | comment-review | /iterate-implementation | no | yes |
| show-me | show-me | none | no | no |
| run-task | none | drives the table above | n/a | n/a |

Artifact type is the frontmatter `type` of the artifact the skill writes. `describe-pr` writes an unnumbered `pr-description.md` without frontmatter, because the file is published verbatim as the pull request body; its type is `pr-description`. A file with no frontmatter otherwise takes its type from the name segment between `NN-` and the slug.

## Human gates

Gates stop at design-discussion, design-prd, design-tdd, structure-outline, plan, epic-plan, epic-delivery, workspace-config, implementation, pr-description, and pr-review. The gate reply links the artifact, copies its `### Verify` checks, and names the iteration skill; running the next command records approval. Pull request approval stays external: `resolve-pr-reviews` repeats until reviewers approve.

## Optional phases

Two phases run only when the user asks for them, between implementation and the pull request: `review-loop` (the bounded review→fix loop below) and `record-evidence` (narrated video proof of the implemented behavior). Insert one by answering the implementation gate with its command (`/review-loop` or `/record-evidence`), by listing it once in `task.md` (`with: [review-loop, record-evidence]`), or with `/run-task --with <skill,...>`. `run-task` then runs each requested phase whose artifact does not exist yet before `describe-pr`, in that order. `review-loop` hands back to `describe-pr` on a clean review, and stops and reports on the depth cap or a blocked gate; `record-evidence` hands back to `describe-pr` on success, failing evidence hands to `iterate-implementation`.

## Review loop

`review-loop` drives `review-code` and `fix-code-review` through fresh contexts, pass after pass, until the loop ends: `review-code` reviews the diff against the merge target and writes a `code-review` artifact; with findings, `fix-code-review` repairs them, writes `code-review-fixes`, and hands back to `review-code`; `review-loop` counts the pass and repeats. The loop ends on a clean review (hands off to `describe-pr`), an optional `--max-depth <n>` cap reached with findings still open (stops and reports the remaining findings), or a blocked review (stops). `--max-depth <n>` on `run-task` or `max_depth` in `task.md` sets the cap; absent, the loop is endless. `review-code` and `fix-code-review` remain the loop's workers and stay independently runnable. Run `review-loop` between implementation and the pull request when the change is large or the reviewer is a different person.

## Epics

`create-epic-plan` splits a large request into children with their own `workflow` and dependencies. `start-epic-delivery` creates one task directory per child and lists the wave-1 start commands. Each child then runs its own chain, one fresh context per phase, with `/run-task @.agents/tasks/<child slug>` or by hand.

## Utilities

- `ci-commit`: commit implementation work with explicit paths, excluding `.agents/tasks/`, and hand off to `describe-pr`.
- `start-task`: route a request to a workflow type, `direct`, or an epic; create the task; hand off (see Choosing a type).
- `show-me`: a focused diagram, code-shape sketch, or HTML artifact for the current explanation.
- `record-evidence`: record narrated, annotated video proof of behavior on a screen, Android emulator, iOS simulator, or headless browser; compose devices side by side; the report and video are attached to the PR by hand, typically between implementation and `describe-pr`.
- `configure-workspaces`: write `.agents/workspace.json` and `.agents/workspace.local.json`, which `setup-worktree` uses to create task worktrees.
- `review-artifact-comments`: apply the user's feedback to an artifact one item at a time, then hand off to `iterate-implementation`.
- `run-task`: drive a task through this table one fresh-context phase at a time; see [docs/context-management.md](../docs/context-management.md).
