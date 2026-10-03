---
name: implement-outline
description: Orchestrates phased implementation from a structure outline; starts one agent-outline-implementer per phase, verifies its validation, ticks the outline, commits, and writes a receipt. Use when the user runs /implement-outline or the task has an approved structure outline but no plan; not for a plan (/implement-plan).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Outline Implementation Orchestrator

Coordinate phased implementation from a structure outline in `<task-root>/<slug>/`. Start the outline implementer directly. Do not redirect to `/implement-plan` or `/create-plan`.

## Workflow

Copy this checklist for each phase:

```text
- [ ] locate outline and phase
- [ ] dispatch agent-outline-implementer
- [ ] verify its report
- [ ] tick the outline
- [ ] commit
- [ ] write receipt
- [ ] reply or start next phase
```

### 1. Discover documents

Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.

If the user supplied a specific outline path or `@file`, use it as input. Otherwise use current `planning.structure` from `index.json`.

Read the selected outline completely. Work from the implementation overview, shared constraints, the first incomplete phase, and that phase's validation. Companion documents (research, design discussion, PRD, TDD, `task.md` or `ticket.md`): pass their paths in the assignment; read only their `summary` fields and the sections the phase names.

The current phase is the first phase whose checkboxes are not all checked. The receipt you write at the end of the phase is the review artifact for that phase; the newest existing artifact of type `implementation` is its predecessor. When artifacts disagree, the structure outline wins; mention the conflict.

When the task's evidence policy needs a baseline and none is sealed, run `/record-evidence --baseline`; once implementation has begun it captures from a temporary `git worktree add <tmp> <base-sha>`. It never blocks dispatching an implementer. Give the outline implementer the policy and baseline paths when they exist. `node <skills-dir>/deliver/contract.mjs status <task-dir>` prints artifact currency and what publication lacks; optional for manual work.

### 2. Start the outline implementer

Start a child worker for role `agent-outline-implementer` with the assignment for the current phase: the phase number and the paths to the outline and companion documents, not their contents (see the conventions' Child workers section); wait for it; read its final message. The assignment does not ask the outline implementer to commit; step 4 commits. Model roles follow `deliver`'s Model roles; record the observed worker model or that selection was unavailable.

The final message is the deliverable. Compare it to the outline before reporting success, and use only findings verified against the repository. If the outline implementer cannot follow the outline, stop and present the issue as in Handling Issues. If automated checks failed, report the failure and either fix it or ask for direction when the outline no longer matches the repository.

### 3. Tick the outline

The outline implementer never writes task artifacts. Its final message ends with a `## Progress Markers Earned` section listing each validation checkbox or phase marker earned by an automated check that ran and passed, with the passing command. Apply those updates to the outline file yourself, updating a staged immutable successor:

- Validation checkboxes move from open to checked only when a recorded passing command backs them.
- A phase title is marked complete only after all automated validation passes.
- Every other checkbox and marker stays open. Continue phase resolution from the updated file.

### 4. Commit

When every automated validation checkbox in the phase is checked with a recorded passing result, create a focused code commit with a Conventional Commits subject (conventions, Commits section). Use explicit `git add <path>` commands for code paths; exclude the configured task root from every code commit. Record the updated outline successor locally; never stage, commit, or push task artifacts. When commits are explicitly forbidden, leave code unstaged and record that actual state. `/ci-commit` stays the manual fallback for work outside this flow.

### 5. Write the receipt, then reply or continue

After the commit and recording the outline successor, allocate the next immutable `implementation.receipt` iteration from `references/implementation_template.md` at every numeric phase boundary, including when later phases remain. Set `completed_phase` to the highest outline phase the receipt proves complete. Populate `Human Review` with exact review targets, checks, and known limits. Record policy and baseline paths, actual phase, remaining verification, review and evidence, first incomplete action, and the source revision; later source changes invalidate the revision.

Then take the first case that applies:

1. The assignment names one phase, or the phase block has `human-gated: true`: reply and stop. Use `references/implementation_phase_final_answer.md` when another phase remains, and the terminal answer in case 2 when none does.
2. No phase remains (every phase complete, and any `human-gated: true` phase confirmed): reply with `references/implementation_final_answer.md`, with `{next_command}` set to `/verify-implementation`.
3. Otherwise: start the next phase at step 2 with a different outline implementer, and send no reply.

Fill `{artifact_link}` with the canonical receipt link and `{source_file}` with the selected outline's worktree-relative path; populate `Check` from the receipt's `Human Review` section, and keep the command fence last. Deferred human evidence is reported with pointers and never marked executed.

## Special Instructions

### Resuming Work

Trust completed phases unless current evidence contradicts them. Ask the outline implementer to resume the remaining phase work.

### Handling Issues

If the outline implementer cannot follow the outline, stop and present:

```markdown
Issue in Phase [N]

Expected: [outline requirement]
Found: [repository reality]
Why it matters: [impact]

How should I proceed?
```

Do not silently rewrite the outline's intent.
