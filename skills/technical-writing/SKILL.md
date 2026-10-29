---
name: technical-writing
description: Writes and revises technical prose around a reader's task while preserving source facts, uncertainty, and exact technical strings. Use when the user runs /technical-writing, asks to tighten text, clarify a procedure, proofread documentation, or rewrite a report for another audience; not for inventing product requirements, changing code, or certifying regulated documentation.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Technical writing

A useful technical document lets its reader understand a result, make a decision, or complete an action without recovering the author's conversation. This skill applies the collection writing guide to that reader's task. It has no sibling dependency or external service requirement.

## 1. Establish the writing contract

Read the supplied text and applicable repository instructions before editing. Identify the reader, what the reader already knows, the question or action the text must serve, and the requested output location. Infer these from the request and sources. Ask only when a missing choice would change the deliverable.

Choose the requested operation:

- Draft: create prose from the supplied facts and decisions. Label assumptions instead of presenting them as source facts.
- Edit: improve the given prose without changing its meaning or scope. Preserve required sections, evidence, and decision records. Propose substantive reorganization separately unless the user authorized it.
- Review: report problems and their effects on the reader without changing the text.

A project's explicit writing rules and the active deliverable's required structure take precedence. Existing inconsistent prose is not itself a style instruction. Default to US English when no dialect is specified, but preserve quotations, names, identifiers, commands, and literal strings exactly.

Honor the requested output path. For an indexed task artifact, validate the task's index and create an immutable successor through its artifact contract. Never edit a recorded iteration or assume a fixed task root. An ordinary source-controlled document can be edited in place when requested.

## 2. Separate evidence from expression

Before a rewrite, identify the statements whose meaning cannot change:

| Statement | Source or authority | Meaning to preserve |
|---|---|---|
| A result or measurement | Supplied record, observation, or cited source | Value, unit, population, and comparison |
| A requirement | Approved specification or owner decision | Actor, condition, permission, obligation, and exception |
| An uncertain claim | Source wording and available evidence | What is known, suspected, or still untested |
| An instruction | Supported procedure and its prerequisites | Order, target, consequence, and recovery path |

Keep this inventory internal for a short edit. Save or include it only when a reader needs an audit trail.

Do not supply a number because a phrase such as "several teams" sounds vague. Keep the source's quantity and flag the missing count when it matters. Likewise, "may have failed" does not mean "failed", and "not tested" does not mean "does not work". A wording improvement that changes one of these claims is a factual change, not copyediting.

Keep exact errors, flags, paths, symbols, and quoted output intact. Remove surrounding filler, not characters within a literal. If sources disagree, identify the conflicting claims and their authority. Do not resolve the disagreement through confident wording.

## 3. Organize for the reader's next use

Use the smallest structure that answers the reader's question. Existing required templates win. For a new document, choose the relevant starting point in [references/report-shapes.md](references/report-shapes.md), then keep only sections with a job.

Put the result, decision, failure, or user problem first, according to the document's purpose. Put supporting evidence beside the claim when the reader needs it to act. Link large logs and inventories rather than embedding them in the main explanation. Do not hide a material limitation in a footer or separate it from a decision it changes.

For an unfamiliar behavior, start with one concrete example before naming internal mechanisms. Distinguish the example's invented values from measured results. Explain a term where the intended reader first needs it. A reader arriving at a deep link should not need the original chat to understand the section.

Give each paragraph one topic. Use numbered lists for order, bullets for independent choices, and a table when readers must compare the same attributes. A diagram is useful only when its states, ownership, or message order explains something the prose cannot show as directly.

## 4. Rewrite without erasing the author's claim

Apply the collection writing guide, then use [references/craft.md](references/craft.md) for reader-focused editing questions.

- Name the actor when the source establishes one. If the actor is unknown, preserve that uncertainty rather than inventing ownership to obtain active voice.
- Prefer a concrete action to a vague label. "The client retries three times" tells a reader more than "resilient delivery".
- Remove repetitions and empty introductions. Keep a qualification that changes when a statement is true.
- Use one technical name for one concept. Match repository terminology and define unfamiliar terms for this reader.
- Split a sentence when its conditions or actions are hard to follow. Keep the words that establish sequence and causality.
- Replace unsupported praise with an observed behavior or remove it. Never invent a benchmark to rescue an adjective.
- Keep ordinary connective words when they explain why the next fact follows. Shorter text is not an improvement if the reader must reconstruct the relationship.

Sentence length is a diagnostic, not a fixed quota. Read a difficult passage as the intended reader and simplify the actual obstacle. Do not force a longer, accurate sentence into fragments that lose its conditions.

## 5. Make procedures safe to follow

A procedure needs an observed target and enough information to distinguish success from failure. Use only supported steps from the source or repository. Missing commands, destructive consequences, and recovery behavior are gaps to flag, not opportunities to guess.

1. State the prerequisites before the first action that needs them.
2. Put a warning before the action that can cause its consequence. Say what can be lost or disrupted.
3. Give each step one bounded action. Separate alternatives with explicit conditions.
4. Preserve exact commands and identify the working directory or environment when it matters.
5. Describe the observable result and the next action if it differs, when the source provides those facts.

For an agent-facing instruction, make the input, allowed changes, stop condition, and required output explicit. Do not rely on a pronoun or a chat-local nickname to identify a file or owner.

## 6. Compare meaning and deliver

Read the rewrite against the source, checking numbers, units, named actors, negations, permissions, conditions, chronology, and meaningful uncertainty. Check that each source link still supports its claim. This is an editorial comparison, not permission to run product commands or claim software verification.

Then read only the title, headings, opening, and last action as the intended reader. Fix any mismatch between what those lines promise and what the document establishes. Keep unresolved factual gaps visible.

Return the requested format. Otherwise:

- A draft or rewrite appears first, without an announcement. Follow it with only the factual questions or important editorial choices the reader needs.
- An in-place edit reports what changed, where it changed, and any fact intentionally left unresolved. Use a change table only when requested or genuinely useful.
- A review gives the location, the likely misreading or failed action, and a concrete revision. Distinguish factual gaps from stylistic preferences.

When nothing needs changing, say so rather than manufacturing edits. Never claim a writing pass established facts that its sources did not.
