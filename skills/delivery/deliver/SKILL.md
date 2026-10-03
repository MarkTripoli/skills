---
name: deliver
description: Orchestrates one task from request to pull request; plans, delegates each phase to a builder, has a fresh reviewer on the strongest model check it, and stops on a named condition. Use when the user runs /deliver, or resumes a task directory; not for a single phase, where the phase skill such as /implement-plan fits.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

Own decisions, delegation, verification and durable records; builders and reviewers execute.

## Inputs

Take the request verbatim without `/deliver`; empty means ask. Resume an existing task from `task.md` Status/Decisions, plan Progress and `node <skills-dir>/deliver/contract.mjs status <task-dir>`. Indexed `resume` gives completed proofs, `next_phase` and `next_action`: `review-plan` requires current approval, `build` selects the first incomplete phase, `final` starts final checks. Rerun the Status unblock check. Resolve missing paths through `git worktree list`; never duplicate tasks.

`gates` is `plan` (default: the human approves the plan, and any design discussion, PRD or TDD the workflow produces) or `none` (unattended). Old `all` reads as `plan`. `none` needs an explicit request that says not to ask; it covers implementation choices, commits, pushes, PR creation, pipeline repairs and review replies inside the task, never merging, deployment or Jira changes. An explicit workflow or gate in the request wins.

## Setup

Read [task setup](references/task_setup.md) and open the task: worktree, `task.md` with `## Delivery brief`, `## Status` and `## Decisions`, Jira refinement, one Slack run, workflow choice. Read [tool approvals](references/tool_approval.md) only when unattended work is requested or a permission prompt appears.

Decide from code, tests and guidance; ask only for unrecoverable information or access. Record material assumptions.

## Plan

Delegate read-only research to child workers (`agent-codebase-locator`, `-analyzer`, `-pattern-finder`, `-web-search-researcher`), then plan at the workflow's depth (task setup table; phases sized by `shared/SLICING.md`). Every plan artifact, including a oneshot plan written on request, gets a fresh read-only plan reviewer (checkpoint `plan`) who checks it against the request and writes its record; run the review check on it. Under `gates=plan`, stop `needs-human` with the plan for approval; on resume, continue only when `## Decisions` holds the owner's dated approval line. Size again after research; an oversized PR becomes an epic.

## Build

For each plan phase:

1. A builder (`agent-implementer`, or `implement-plan` standalone) implements it, runs targeted checks and commits with explicit paths.
2. A fresh read-only slice reviewer gets `task.md`, current plan phase/digest, acceptance criteria and `<phase-base>..HEAD`, never the builder's transcript or your summary.
3. Run `node <skills-dir>/deliver/contract.mjs review-next <task-dir> <review-type> <checkpoint>` before review. Assign its round, prior record and blockers; require full-template native path/content `write`, otherwise portable writing. Publish unchanged and run `contract.mjs review <task-dir> <record>`. Preserve rejected receipts; a fresh reviewer gets recomputed inputs and exact errors, never rewritten history.
4. `approve`: run `node <skills-dir>/deliver/contract.mjs phase-complete <task-dir> <phase-N> <record>` for indexed plans. It publishes a phase/Progress successor from the bound approval, not new test execution; reapprove that exact successor using `review-next`. Legacy tasks retain manual checkboxes/Progress. `changes`: a builder answers findings `fixed` or `disputed: <evidence>` in a new commit; review earlier valid blockers, dispositions and `git diff <previous reviewed_commit>..HEAD`.

Blocking: unmet acceptance criterion, wrong behavior, security, data loss, broken check; all else `follow-up`.
5. After a failed evidence inspection, reserve one attempt with `contract.mjs repair-begin <task-dir> <attempt-id>`, pass that id to the builder (which must not reserve again), and call `repair-complete` after.

Invalid attempts consume no rounds and erase no blockers. Receipt rounds remain contiguous across plan successors; only valid approval closes a blocking episode. Actual failed checks prohibit approval. Plan review is read-only: cite retained baseline failures without rerunning them.

## Final

1. On HEAD, run the repository checks.
2. Assign `verify-implementation` and `review-code` to two fresh parallel final reviewers on the strongest model. Each reads its complete installed `<skills-dir>/<skill>/SKILL.md`, using continuations when needed; paths, templates or truncated reads prove no load. Require native artifacts of the assigned type at checkpoint `final` and passing `review` checks. Route findings through `fix-code-review`.
3. Per [the evidence commands](../record-evidence/references/delivery_contract.md), save the evidence policy and, for existing behavior, a baseline from a temporary worktree at the base commit.
4. Run `record-evidence`.
5. Inspect with `iterate-evidence`.
6. Record the requested policy-scoped UI devices with real video and screenshots; unavailable surfaces are `untested` with reasons.

## Publish

Require status with only `Hosted PR description` missing and no problems/stop. Run installed `describe-pr`; retain its complete GitHub hosted-proof, comment/body readback and optional-hook gate. Never merge.

## Follow-up

Watch current-head checks and threads. Repair failures through the same builder/reviewer pairs and `resolve-pr-reviews`; refresh evidence after behavior changes. Stop when required checks pass and no actionable threads remain.

## Stop conditions

Stop on exactly one, write it to `## Status`, and reply with [the answer template](references/deliver_answer.md):

- `done`: acceptance criteria met, checks green, PR published and followed up.
- `needs-human: <question>`: a gate, a requirement only the human can settle, `limit_reached` from an owner `review-round-limit: N` line in `## Decisions` (copy a request's cap), or a `disputed` answer that the next reviewer, who judges it first, keeps blocking; the owner may then record `accepted-limit` in `## Decisions`.
- `blocked: <prerequisite>; unblock check: <command>`: clear environmental blockers within the task's authority first; then `/deliver <task-dir>` reruns the check and continues.
- `no-progress: <evidence>`: `progress: false` from the review check, or the same failure repeats after a fix.

No file holds a terminal flag. The owner extends an exhausted evidence-repair allowance with `repair-extension +N: <reason>` in `## Decisions`.

## Model roles

Read an existing model profile with route-model; never create one implicitly. Use its strongest candidate for orchestration and reviews and economy for builders, unless the owner names another model. Start builders per [model enforcement](references/model_enforcement.md). Record observed reviewer models or unobserved: <requested>; never claim an unobserved model. With no profile, say no model was enforced; independence rests on fresh context.

## Fallbacks

Without subagents, build inline and print a fresh-session handoff for each review: the worktree, the reviewer role, its assignment and `/deliver <task-dir>` to resume. Only the orchestrator sends Slack `run event` and `run check`. Without `node`, say review and evidence checks did not run; only a claim of sealed evidence is then blocked.
