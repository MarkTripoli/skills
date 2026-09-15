# Delivery workflow

A task moves from request to merged pull request through phases. Each phase is one skill, runs in a fresh context, reads only `task.md` and the artifacts it selects, writes one artifact into `.agents/tasks/<slug>/`, and ends with one command fence naming the next phase. Human gates stop the chain until the user approves by running the next command. The file and reply contracts are in [shared/CONVENTIONS.md](../shared/CONVENTIONS.md).

## Workflow types

`workflow` in `task.md` selects the chain.

| Type | Chain | Use when |
|---|---|---|
| `full` | create-research-questions, create-research, create-design-discussion, create-plan, setup-worktree, implement-plan, describe-pr, resolve-pr-reviews | The change needs research and a design decision before planning. Default. |
| `lean` | create-research-questions, create-research, create-structure-outline, implement-outline, describe-pr, resolve-pr-reviews | The change is bounded; a phased outline is enough structure. |
| `prd` | create-research, create-prd, create-tdd, create-plan, setup-worktree, implement-plan, describe-pr, resolve-pr-reviews | Product and technical decisions need interactive sessions with the user. |
| `oneshot` | one session: implement, verify, commit, then describe-pr, resolve-pr-reviews | The request is a fully specified change; no artifacts are required before implementing. |

`setup-worktree` is skipped when the project already runs inside a worktree or `.agents/workspace.json` has `disabled: true`; the plan and outline skills detect this with the conventions' Worktree probe and hand off straight to the implementation skill.

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
| iterate-implementation | implementation | the source implementation command between phases, then /describe-pr | yes | yes |
| review-code | code-review | /fix-code-review while findings remain, otherwise /describe-pr | no | no |
| fix-code-review | code-review-fixes | /review-code | no | no |
| describe-pr | pr-description | /resolve-pr-reviews | yes | no |
| resolve-pr-reviews | pr-review | /resolve-pr-reviews until the pull request is approved | yes | no |
| ci-commit | commit | /describe-pr | no | no |
| review-artifact-comments | comment-review | /iterate-implementation | no | yes |
| show-me | show-me | none | no | no |
| run-task | none | drives the table above | n/a | n/a |

Artifact type is the frontmatter `type` of the artifact the skill writes. `describe-pr` writes an unnumbered `pr-description.md` without frontmatter, because the file is published verbatim as the pull request body; its type is `pr-description`. A file with no frontmatter otherwise takes its type from the name segment between `NN-` and the slug.

## Human gates

Gates stop at design-discussion, design-prd, design-tdd, structure-outline, plan, epic-plan, epic-delivery, workspace-config, implementation, pr-description, and pr-review. The gate reply links the artifact, copies its `### Verify` checks, and names the iteration skill; running the next command records approval. Pull request approval stays external: `resolve-pr-reviews` repeats until reviewers approve.

## Review loop

`review-code` reviews the diff against the merge target and writes a `code-review` artifact. With findings, `fix-code-review` repairs them, writes `code-review-fixes`, and hands back to `review-code`. A clean review hands off to `describe-pr`. Run the loop between implementation and the pull request when the change is large or the reviewer is a different person.

## Epics

`create-epic-plan` splits a large request into children with their own `workflow` and dependencies. `start-epic-delivery` creates one task directory per child and lists the wave-1 start commands. Each child then runs its own chain, one fresh context per phase, with `/run-task @.agents/tasks/<child slug>` or by hand.

## Utilities

- `ci-commit`: commit implementation work with explicit paths, excluding `.agents/tasks/`, and hand off to `describe-pr`.
- `show-me`: a focused diagram, code-shape sketch, or HTML artifact for the current explanation.
- `configure-workspaces`: write `.agents/workspace.json` and `.agents/workspace.local.json`, which `setup-worktree` uses to create task worktrees.
- `review-artifact-comments`: apply the user's feedback to an artifact one item at a time, then hand off to `iterate-implementation`.
- `run-task`: drive a task through this table one fresh-context phase at a time; see [docs/context-management.md](../docs/context-management.md).
