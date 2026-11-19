# STE structure

The structural layer, from ASD-STE100 (Simplified Technical English). This file paraphrases rule categories. It does not reproduce the standard's text or its dictionary. For the authoritative document, request the free download at the [official site](https://www.asd-ste100.org/STE_downloads.html).

## What it is

A controlled language, first released in 1986 by what is now ASD, the European aerospace industry association. European airlines, mostly staffed by non-native English speakers, needed maintenance documentation that could not be misread, because a misread instruction on an aircraft can kill people. Current edition: Issue 9. 53 writing rules in 9 sections, plus a dictionary of about 900 approved words (one meaning, one part of speech each) and about 1,200 words to avoid.

Why an agent skill borrows it: STE was built for a reader who cannot ask a follow-up question. A parser, a downstream agent, a translator, or an on-call engineer at 3 a.m. is in the same position.

## Structural rules: applied in full

These describe sentence shape. You can apply them from the description alone.

**Sentence**

- One instruction per sentence.
- Procedures and instructions: 20 words maximum. Descriptive text: 25 words maximum.
- Do not omit sentence parts (verb, subject, article) only to shorten the sentence. The standard warns that this creates ambiguity, not clarity. Fragments in chat replies are a deliberate departure, bounded by the rules in `SKILL.md` for when to drop compression.
- Noun clusters cap at three words. "High pressure fuel pump inlet valve assembly" becomes "the inlet valve on the fuel pump".
- No semicolons (Rule 8.1). Every other standard mark is permitted. Write separate sentences instead.

**Verb**

- Permitted forms: infinitive, imperative, simple present, simple past, simple future, and the past participle as an adjective.
- No present perfect, past perfect, or other compound tenses. "We received", not "we have received". `SKILL.md` keeps two exceptions: current relevance and hedges.
- -ing forms only as a technical noun or part of one, not as a verb form.
- Use a verb for an action, not a noun derived from it (Rule 3.7). "Analyze", not "perform an analysis".
- No phrasal verbs (Rule 9.3). Their meaning is not predictable from the parts. Non-native readers and translation systems both mishandle them.

**Voice**

- Active voice for procedures and instructions.
- Passive only in descriptive text, and only when the actor is unknown or irrelevant.

**Paragraph and document**

- One topic per paragraph. Six sentences maximum.
- Vertical lists (numbered or bulleted) for sequences, conditions, and enumerations. Never buried in prose.
- Safety instructions open with the command or condition. Never mid-sentence.

## Lexical rules: direction of travel only

These are defined by the official dictionary, which this skill does not reproduce. Without it they degrade from a checkable standard to a preference for plain words. Apply the principle: pick the plainest, most common word, and use it the same way every time.

- Approved words only, in their approved meaning and part of speech.
- One word, one meaning. Do not rely on context to disambiguate a word with several senses.
- Prefer the plainer, shorter, more common word over a formal or rare synonym.
- An organization may define its own approved technical nouns and verbs. A project keeps that vocabulary in its `CONTEXT.md` or `AGENTS.md` files. Use it verbatim.

## The six-point scan

Run before any structural edit:

1. Sentences over the length to review for the register (about 20 words in machine-read text, 25 in documentation).
2. More than one instruction in a sentence.
3. Passive voice in a procedure.
4. Compound tenses.
5. Phrasal verbs and nominalizations.
6. Sequences or conditions buried in prose instead of a list.

## What this skill does not claim

It is not a certified STE authoring tool and cannot produce a guaranteed STE-compliant document. For regulated aircraft maintenance documentation, get the standard and check word by word against the dictionary.

## Sources

- [ASD-STE100 official site](https://www.asd-ste100.org/)
- [ASD-STE100: about STE](https://www.asd-ste100.org/about_STE.html)
- [ASD Europe: Simplified Technical English](https://www.asd-europe.org/standards-specifications/simplified-technical-english/)
- [Simplified Technical English on Wikipedia](https://en.wikipedia.org/wiki/Simplified_Technical_English)
- [TechScribe: ASD-STE100 Simplified Technical English](https://www.techscribe.co.uk/techw/asd-simplified-technical-english.htm)
- [SKYbrary: Simplified Technical English](https://skybrary.aero/articles/simplified-technical-english-ste)
