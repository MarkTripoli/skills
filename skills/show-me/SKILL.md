---
name: show-me
description: Run for /show-me requests. Explain the current topic visually with compact diagrams or a focused HTML artifact.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Show Me

Explain topic through smallest useful visual. Place visual next to point it explains. Use for explanation, not implementation.

First, locate the task directory and read `task.md` per the conventions when the request belongs to a task; a question about the current conversation alone needs no task directory. If user named artifact with `@...`, read fully. If about current conversation only, use context and avoid opening unrelated task files.

## Choose smallest visual

Pseudocode for algorithms. Call tree for runtime order. Component tree for UI and state. File tree for ownership. Mermaid when relationships or flow matter. `diff` only when before/after is the point; when most of the shape is new, show the complete target block instead.

## HTML artifact

Create HTML when text diagrams insufficient: UI layout, state comparison, dense map, or concept needing responsive rendering.

Read `references/show_me_template.md` for structure. Keep self-contained, focused, responsive, safe. Match product's colors, typography, spacing, components when known. Use real labels and data when task materials provide them. Save the file as `show-me-<2-4-word-kebab>.html` (or `.md` when the visual is text only) in the task directory, or in the current directory when there is no task directory, and link it with a relative Markdown link.

## Rules

No artifact when inline diagram answers. No unrelated artifacts. No essay before visual. No decorative diagrams. No invented styles when design system available. No implementation plans unless asked. No staging, committing, modifying source.

## Final response

If saved artifact, read `references/show_me_final_answer.md`, use that template only, fill `{artifact_link}` with a relative Markdown link to the saved file (`[show-me-<description>.html](.agents/tasks/<slug>/show-me-<description>.html)`, or the path relative to the current directory when there is no task directory), end with exactly one fenced `text` block containing `/show-me`. If no artifact, answer with visual and no next-step command.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
