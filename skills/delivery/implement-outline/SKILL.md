---
name: implement-outline
description: Run for /implement-outline requests. Orchestrate implementation from a structure outline artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Outline Implementation Orchestrator

Coordinate phased implementation from the current `planning.structure` artifact in the configured task directory. Start the outline implementer child worker directly. Do not redirect to `/implement-plan` or `/create-plan`.

## Getting Started

### 1. Discover documents

Locate the task directory and read `task.md` per the conventions, including the create-when-missing rule.

If the user supplied a specific outline path, use it as input. Otherwise use current `planning.structure` from `index.json`.

Companion documents when present: research, design discussion, PRD, TDD, `task.md` or `ticket.md`.

Read the selected outline completely. Work from the implementation overview, shared constraints, the first incomplete phase, and that phase's validation. Read only the complete companion sections that influence the current phase.

The current phase is the first phase whose checkboxes are not all checked. The receipt you write at the end of the phase is the review artifact for that phase; the newest existing artifact of type `implementation` is its predecessor.

When artifacts disagree, the structure outline wins; mention the conflict in the child assignment or user report.

### Progress tracking

The outline implementer never writes task artifacts. Its final message ends with a `## Progress Markers Earned` section listing each validation checkbox or phase marker earned by an automated check that ran and passed. For an indexed task, this skill copies the current outline into the next `planning.structure` iteration and applies updates there; it never edits a recorded iteration. A legacy task without `index.json` follows the conventions' in-place rule:

- Validation checkboxes move from open to checked only when a recorded passing command backs them.
- A phase title is marked complete only after all automated validation passes and the phase commit exists.
- Every other checkbox and marker stays open. Continue phase resolution from the updated file.

## Workflow

### 1. Start the outline implementer child worker

Start a child worker for role `agent-outline-implementer` with the assignment for the current phase: the phase number and the paths to the outline and companion documents, not their contents (see the conventions' Child workers section); wait for it; read its final message.

The final message is the deliverable. Compare it to the outline before reporting success, and use only findings you have read from the worker's final message, verified against the repository. Then apply its `## Progress Markers Earned` section to the outline per Progress tracking.

### 2. Report to the human

After a numeric phase passes automated verification, record the updated outline iteration first, then record the next immutable `implementation.receipt` from `references/implementation_template.md`. Set `completed_phase` to the highest outline phase the receipt proves complete. Populate `Human Review` with exact review targets, checks, and known limits. Save a receipt at every numeric phase boundary.

Read `references/implementation_phase_final_answer.md` when another numeric phase remains. Fill `{artifact_link}` with the receipt's canonical task-root-relative path; its final command invokes this skill with the current outline path. Read `references/implementation_final_answer.md` only after the terminal phase. In both answers, populate `Check` from the receipt's `Human Review` section and keep the final command fence last.

After the child finishes and automated checks have passed or failed, report the phase:

```markdown
## Phase [N] Complete

**What changed:**
- [brief result]

**Automated verification:**
- [command] -> [result]

**Deferred human evidence (recorded, not executed):**
- [evidence item and pointer, or None]

Automated checks are green, so implementation continues to the next phase.
```

If automated checks failed, report the failure and either fix it or ask for direction when the outline no longer matches the repository.

### 3. Commit and continue

When every automated validation checkbox in the phase is checked with a recorded passing result, create a focused commit with a Conventional Commits subject and start the next phase without waiting. Use explicit `git add <path>` commands for code paths; never mix task artifacts into the code commit. Commit the outline iteration, receipt, and `index.json` separately with explicit paths as `docs(task): implementation artifact`.

### 4. Repeat for the next phase

Repeat the same discovery, child implementation, verification, and commit cycle. A `human-gated: true` line in the executed phase block is the only reason to stop for confirmation; report it with `references/implementation_phase_final_answer.md` and wait.

## Special Instructions

### Resuming Work

When resuming a partially implemented outline:

- Read the outline and identify phase markers, checked validation items, and incomplete sections.
- Trust completed phases unless current evidence contradicts them.
- Continue at the first phase whose checkboxes are not all checked.
- Ask the child to resume the remaining phase work, not to redo completed phases.

### Handling Issues

If the child cannot follow the outline, stop and present:

```markdown
Issue in Phase [N]

Expected: [outline requirement]
Found: [repository reality]
Why it matters: [impact]

How should I proceed?
```

Do not silently rewrite the outline's intent.

### Multiple Phases

Every phase advances on green automated checks. Use a different child worker for each phase and run validation between phases. Deferred human evidence is reported with pointers and never marked executed. A `human-gated: true` line in the executed phase block stops the run for confirmation.

### Artifact and Reference Handling

Read `references/implementation_template.md`, `references/implementation_phase_final_answer.md`, and `references/implementation_final_answer.md` before reporting a phase boundary.

Record the next immutable `implementation.receipt` iteration through the conventions' Recording an artifact flow.

## After Final Phase Completion

When all outline phases are complete, automated checks pass, and any phase with `human-gated: true` received its recorded confirmation:

1. Save any changed task artifacts in the task directory.
2. Commit all remaining repository work before the PR handoff. Use the `/ci-commit` conventions: inspect the diff, stage explicit code paths, keep task artifacts in their own `docs(task): implementation artifact` commit, and write a validated Conventional Commits message.
3. Read `references/implementation_final_answer.md`.
4. Respond using that template only. Fill `{artifact_link}` with the receipt's canonical task-root-relative path and keep the single fenced `text` command for `/describe-pr` last.
