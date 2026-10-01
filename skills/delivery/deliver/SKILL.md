---
name: deliver
description: Run for /deliver requests, or /deliver <task-dir> to resume. One orchestrator session plans, delegates each unit of work to a builder, has a fresh reviewer on the strongest model check it, and stops on a named condition.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deliver

Orchestrate decisions, delegation, verification and records; builders and reviewers execute. Report decisions and results. Phase skills also work standalone.

## Inputs

Take the request verbatim without the leading `/deliver`; empty means ask for it. An existing task directory resumes: read `task.md` (`## Status`, `## Decisions`), the plan's `## Progress`, and `node <skills-dir>/deliver/contract.mjs status <task-dir>`, rerun the `## Status` unblock check, and continue at the first incomplete step. A path missing from this checkout resolves through `git worktree list`; never open a duplicate task.

`gates` is `plan` (default: the human approves the plan, and any design discussion, PRD or TDD the workflow produces) or `none` (unattended). Old `all` and `mr` read as `plan`. `none` needs an explicit request that says not to ask; it covers implementation choices, commits, pushes, PR creation, pipeline repairs and review replies inside the task, never merging, deployment or Jira changes. An explicit workflow or gate in the request wins.

## Setup

Read [task setup](references/task_setup.md) and open the task: worktree, `task.md` with `## Delivery brief`, `## Status` and `## Decisions`, Jira refinement, one Slack run, workflow choice. Task files are local and ignored; never stage them. Read [tool approvals](references/tool_approval.md) only when unattended work is requested or a permission prompt appears.

Decide from repository evidence; ask only for unreachable information or access. Record material assumptions.

## Plan

Delegate read-only research to child workers (`agent-codebase-locator`, `-analyzer`, `-pattern-finder`, `-web-search-researcher`), then plan at the workflow's depth (task setup table; phases sized by `shared/SLICING.md`). Every plan artifact, including a oneshot plan written on request, gets a fresh read-only plan reviewer who checks it against the request; run the review check on its record. Under `gates=plan`, stop `needs-human` with the plan for approval; on resume, continue only when `## Decisions` holds the owner's dated approval line. Size again after research; an oversized PR becomes an epic.

## Build

For each plan phase:

1. A builder (`agent-implementer`, or `implement-plan` standalone) implements it, runs targeted checks and commits with explicit paths.
2. A slice reviewer (`agent-implementation-reviewer`) starts fresh and read-only. Its assignment is `task.md`, the plan phase, the acceptance criteria and `<phase-base>..HEAD`. Never give it the builder's transcript or your summary of it.
3. The reviewer writes a review record from `agent-implementation-reviewer/references/review_record_template.md`. Run `node <skills-dir>/deliver/contract.mjs review <task-dir> <record>`. A failing check means the review does not count: rerun the reviewer, never edit its record.
4. `approve`: record a new immutable plan iteration with the phase checked and append a dated `## Progress` line (phase, commit, verdict). Reapprove the exact successor at plan checkpoint, read-only. `changes`: return the findings to the builder, who answers each `fixed` or `disputed: <evidence>` in a new commit; the next round judges only earlier findings, those answers and `git diff <previous reviewed_commit>..HEAD`.

Blocking means an unmet acceptance criterion, wrong behavior, security, data loss or a broken check. Everything else is `follow-up`. Stop `no-progress` when the check reports `progress: false`, and `needs-human` when it reports `limit_reached` (3 rounds). The next reviewer judges a `disputed` answer first; only a dispute it keeps blocking stops `needs-human`, where the owner may record `accepted-limit` in `## Decisions`.

After a failed evidence inspection, reserve one attempt with `contract.mjs repair-begin <task-dir> <attempt-id>`, pass that id to the builder (which must not reserve again), and call `repair-complete` after.

## Final

On HEAD, run the repository checks and prove the acceptance criteria with `verify-implementation` and `review-code` as two fresh reviewers in parallel, on the strongest model (checkpoint `final`; their `code-review` and `verification` records pass the same `review` check, and findings go to a builder through `fix-code-review`). Record evidence per [the evidence commands](../record-evidence/references/delivery_contract.md): the policy and, for existing behavior, a baseline from a temporary worktree at the base commit, then `record-evidence` and inspection with `iterate-evidence`. UI work records only requested policy-scoped devices; a surface that cannot run is `untested` with a reason.

## Publish

Publication needs `contract.mjs status` to list nothing missing except `Hosted PR description`, report no problems and no `stop`. Run `describe-pr`; it creates or updates the GitHub PR. Preserve strict current-head hosted capture bytes, recorded passing tests/cues, same-PR evidence comment and full-body readback, plus configured publication hooks. Contract status never bypasses that gate. Never merge.

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
