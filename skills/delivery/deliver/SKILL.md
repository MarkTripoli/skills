---
name: deliver
description: Run for /deliver requests, or /deliver <task-dir> to resume. One orchestrator session plans, delegates each unit of work to a builder, has a fresh reviewer on the strongest model check it, and stops on a named condition.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

Orchestrate decisions, delegation, verification and records; builders and reviewers execute. Report decisions and results. Phase skills also work standalone.

## Inputs

Take the request verbatim without `/deliver`; empty means ask. Resume an existing task from `task.md` Status/Decisions, plan Progress and `node <skills-dir>/deliver/contract.mjs status <task-dir>`. Indexed `resume` gives completed proofs, `next_phase` and `next_action`: `review-plan` requires current approval, `build` selects the first incomplete phase, `final` starts final checks. Rerun the Status unblock check. Resolve missing paths through `git worktree list`; never duplicate tasks.

`gates` is `plan` (default: the human approves the plan, and any design discussion, PRD or TDD the workflow produces) or `none` (unattended). Old `all` and `mr` read as `plan`. `none` needs an explicit request that says not to ask; it covers implementation choices, commits, pushes, PR creation, pipeline repairs and review replies inside the task, never merging, deployment or Jira changes. An explicit workflow or gate in the request wins.

## Setup

Read [task setup](references/task_setup.md) and open the task: worktree, `task.md` with `## Delivery brief`, `## Status` and `## Decisions`, Jira refinement, one Slack run, workflow choice. Task files are local and ignored; never stage them. Read [tool approvals](references/tool_approval.md) only when unattended work is requested or a permission prompt appears.

Decide from repository evidence; ask only for unreachable information or access. Record material assumptions.

## Plan

Delegate read-only research to `agent-codebase-locator`, `agent-codebase-analyzer`, `agent-codebase-pattern-finder` and `agent-web-search-researcher`, then plan at the workflow's depth (task setup table; `shared/SLICING.md`). Every plan, including a requested oneshot, needs a fresh read-only reviewer against the request and a passing contract review. Under `gates=plan`, stop `needs-human`; resume only with dated owner approval in Decisions. Resize after research; oversized PRs become epics.

## Build

For each plan phase:

1. A builder (`agent-implementer`, or `implement-plan` standalone) implements it, runs targeted checks and commits with explicit paths.
2. A fresh read-only slice reviewer gets `task.md`, current plan phase/digest, acceptance criteria and `<phase-base>..HEAD`, never the builder's transcript or your summary.
3. Before every review run `node <skills-dir>/deliver/contract.mjs review-next <task-dir> <review-type> <checkpoint>`; assign its next round, previous record and blockers. Use the review template, then run `node <skills-dir>/deliver/contract.mjs review <task-dir> <record>`. Rejection: preserve the receipt, recompute `review-next`, and give a fresh reviewer the exact error, next round and normal inputs. Never rewrite history.
4. `approve`: run `node <skills-dir>/deliver/contract.mjs phase-complete <task-dir> <phase-N> <record>` for indexed plans. It publishes a phase/Progress successor from the bound approval, not new test execution; reapprove that exact successor using `review-next`. Legacy tasks retain manual checkboxes/Progress. `changes`: a builder answers findings `fixed` or `disputed: <evidence>` in a new commit; review earlier valid blockers, dispositions and `git diff <previous reviewed_commit>..HEAD`.

Blocking means unmet acceptance, wrong behavior, security, data loss or broken checks; otherwise `follow-up`. Stop on `progress: false` or `limit_reached`: three valid `changes` per blocking episode. Only valid approval closes an episode; successful progress reapprovals consume no repairs. Disputes go to the owner only if the next reviewer retains them; the owner may record `accepted-limit` in Decisions.

Invalid attempts do not consume rounds or erase blockers; new plan digests never reset history. Retain every command's actual exit; failed current checks prohibit approval. At plan checkpoint inspect read-only, citing retained baseline failures as unproven context without rerunning the known failing suite.

After a failed evidence inspection, reserve one attempt with `contract.mjs repair-begin <task-dir> <attempt-id>`, pass that id to the builder (which must not reserve again), and call `repair-complete` after.

## Final

On HEAD, run repository checks; prove acceptance with fresh strongest-model `verify-implementation` and `review-code` reviewers in parallel (checkpoint `final`). Their records pass `review`; builders repair findings through `fix-code-review`. Follow [evidence commands](../record-evidence/references/delivery_contract.md): policy, existing-behavior baseline from a base-commit worktree, `record-evidence`, then `iterate-evidence`. Record only requested policy-scoped UI devices; unavailable surfaces are `untested` with reasons.

## Publish

Publication needs status missing only `Hosted PR description`, with no problems or stop. Run `describe-pr` to create/update GitHub. Preserve current-head hosted capture bytes, recorded passing tests/cues, same-PR evidence comment, full-body readback and configured hooks. Status never bypasses that gate. Never merge.

## Follow-up

Watch the current-head pipeline and review threads. Repair failures and actionable comments with the same builder and reviewer pairs, and `resolve-pr-reviews` for threads; refresh evidence when the UI changed. Stop when required checks are green and no actionable thread remains; report approval separately.

## Stop conditions

Stop on exactly one, write it to `## Status`, and reply with [the answer template](references/deliver_answer.md):

- `done`: acceptance criteria met, checks green, PR published and followed up.
- `needs-human: <question>`: a gate, a disputed finding, or a requirement only the human can settle.
- `blocked: <prerequisite>; unblock check: <command>`: clear environmental blockers within the task's authority first. `/deliver <task-dir>` reruns the check and continues.
- `no-progress: <evidence>`: the review check reports it, or the same failure repeats after a fix.

No file holds a terminal flag. The owner extends an exhausted evidence-repair allowance with `repair-extension +N: <reason>` in `## Decisions`.

## Model roles

Read an existing model profile with route-model; never create one implicitly. Use its strongest candidate for orchestration and reviews and economy for builders, unless the owner names another model. Start builders per [model enforcement](references/model_enforcement.md). Record observed reviewer models or unobserved: <requested>; never claim an unobserved model. With no profile, say no model was enforced; independence rests on fresh context.

## Fallbacks

Without subagents, build inline and print a fresh-session handoff for each review: the worktree, the reviewer role, its assignment and `/deliver <task-dir>` to resume. Only the orchestrator sends Slack `run event` and `run check`. Without `node`, say review and evidence checks did not run; only a claim of sealed evidence is then blocked.

## References

Read from the skill directory: `references/task_setup.md`, `references/tool_approval.md`, `references/model_enforcement.md`, `references/deliver_answer.md`.
