---
name: deslop
description: Removes machine-sounding patterns from any text, such as stock vocabulary, filler, forced triples, decorative formatting and chatbot residue, while keeping every fact, number, hedge and literal string. Use when the user runs /deslop or asks to deslop, unslop, de-AI or humanize a text, or says a draft "sounds like AI"; not for restructuring a document or fitting it to a reader (use technical-writing).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Deslop

Edit text so it stops reading as machine-written, without changing what it says. The catalog below adds to the writing guide's Delete-on-sight table; it does not replace it.

## Steps

1. Read the whole text. Note what cannot change: facts, numbers, names, conditions, hedges that carry real uncertainty, quotations, code, commands, paths and error strings.
2. Scan for the patterns in the catalog.
3. Rewrite each hit as the fact it hides. Delete it when it hides none.
4. Read the result against the original. Every item from step 1 is still there and says the same thing. A fix that costs a fact is not made.
5. Reply with the rewritten text first and nothing before it. Add one line after it only for a claim that needs a fact the text does not give, such as a source or a number. When asked what changed, list pattern ids with counts.

Text with no hits is returned unchanged with one line saying so. Match the tone the author chose: a casual note stays casual.

## Catalog

Ids are stable so other skills and reviews can cite them. A retired pattern leaves a gap.

Words

- D1. Stock vocabulary: additionally, crucial, delve, enhance, foster, landscape, pivotal, showcase, testament, underscore, vibrant. Use the plain word or cut the sentence.
- D2. Inflated verbs. Write "is" or "has", not "serves as", "stands as", "boasts", "features".
- D3. Long word for a short one. Write "use", not "utilize" or "leverage".
- D4. Abstract metaphor nouns: substrate, wedge, vector, nexus, primitive, harness, surface, scaffolding, paradigm, ratchet, north star, flywheel. Name the concrete thing.
- D5. Adverbs standing in for a measurement. Give the number or a stronger verb.
- D6. Stacked hedges. One hedge per claim, and only when the uncertainty is real.

Sentences

- D7. "Not just X, but Y." State Y.
- D8. Ideas forced into threes.
- D9. A trailing "-ing" phrase that adds no fact ("highlighting the need for...", "ensuring reliability").
- D10. "From X to Y" where X and Y are not ends of one scale.
- D11. Vague attribution ("experts believe", "studies show"). Name the source or delete the claim.
- D12. Two ideas in one sentence the reader has to reread. Split it.
- D13. Passive voice hiding a known actor.
- D14. Metaphor, aphorism or personified code where a literal phrase exists ("the service happily accepts").
- D15. Telegraphic fragments: dropped articles and verbs, arrows and invented abbreviations in prose.
- D16. A sentence that says how something feels, not what it does. Test: could it appear unchanged in another project's README? Then name the mechanism or the number, or cut it.
- D17. Synonym rotation. One name per thing, repeated.
- D18. A generic closing sentence. End on the specific plan or fact.

Punctuation and formatting

- D19. Em dashes, en dashes and spaced hyphens as connectors, and parentheses used in their place. Use a period or a comma.
- D20. A colon mid-sentence as a connector. A colon introduces a list or an example.
- D21. Bold on every proper noun, acronym or key phrase.
- D22. A bold label that restates its own line ("**Performance:** Performance improved..."). A bold lead-in that adds detail is fine.
- D23. Title Case Headings. Use sentence case.
- D24. Decorative emoji.
- D25. Curly quotes in technical text.

Chat residue

- D26. Assistant phrases ("I hope this helps", "Let me know if...", "Here is the...").
- D27. Praise or agreement openers ("Great question").
- D28. Filler: "in order to" for "to", "it is important to note that", "at its core", announcing what the next sentence will say.

## Example

Before:

> **Caching:** Our caching layer serves as a pivotal component, seamlessly enhancing performance — not just for reads, but across the entire request lifecycle, ensuring a robust user experience.

After:

> The cache answers repeat reads from memory. Median read latency fell from 120 ms to 9 ms.

The second sentence is allowed only because the source gave both numbers. Without them the rewrite stops at the first sentence, and the reply adds one line: the original claims better performance and gives no measurement.

## Limits

- Never edit code, identifiers, commands, paths, quotations or strings a program matches.
- Fiction, marketing copy and a personal voice the user asked to keep are not slop; change only what the user points at.
- Reordering sections, changing the audience, or filling factual gaps is the job of the technical-writing skill when it is installed; say so in one line and stop.
