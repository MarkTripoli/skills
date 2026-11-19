# Sources and attribution

This skill is a synthesis written in its own words. Nothing in it reproduces a source whole, and it names no source as an authority in `SKILL.md`.

## Structure and rulings

The registers, the sentence rules, the settled rulings, the hedge rule, the edit workflow, and the scope limits follow the `technical-writing` skill in [connorpower/dotfiles](https://github.com/connorpower/dotfiles/tree/main/skills/technical-writing). That skill has no license file. This skill takes its structure and rulings and rewrites the text.

Changed from that source:

- A chat register is added, so replies to the engineer follow the same rules.
- Compression rules (drop filler, pleasantries, and narration; keep every symbol, number, and exact error string; no invented abbreviations; full sentences for warnings and ordered steps) come from a separate user-level compression skill.
- The reader-and-question principles and `report-shapes.md` come from corrections made to agent-written reports.
- The change table is produced only on request, and sentence length is a diagnostic rather than a cap.

## Craft

Tone, precision, cliches, word rulings, and structure derive, through the source above, from the [economist-style-guide-plugin](https://github.com/TAJD/economist-style-guide-plugin) by Tom Dickson (MIT). That plugin distills *The Economist Style Guide*, a copyrighted work of The Economist Group. Nothing here reproduces the book. Departures: US English everywhere, the serial comma always, US dates and abbreviation points, "$5 million" in prose.

## Sentence structure

The structural rules derive from the [asd-ste100-skill](https://github.com/danyuchn/asd-ste100-skill) by Dustin Yuchen Teng (MIT). The ASD-STE100 standard itself is free to obtain but not free to redistribute, so this skill encodes rule categories, not the standard's text or its dictionary. That is why `ste-structure.md` splits structural rules (applied) from lexical rules (direction only).

## Document modes and unambiguous sentences

The four document modes (tutorial, how-to, reference, explanation) follow the [Diátaxis](https://diataxis.fr/) framework. The rules for sentences that allow only one reading follow common global-English guidance for readers of English as a second language and for machine translation. Both arrived through a third-party technical-writing skill and are rewritten here.

## US conventions

`us-conventions.md` follows mainstream US publishing practice. Where *The Chicago Manual of Style* and AP disagree it follows Chicago, except that headings use sentence case, as modern technical documentation does.

## What this skill does not claim

It is not a certified STE authoring tool. It cannot produce a guaranteed STE-compliant document, and it does not check words against the ASD dictionary. The scores from `scripts/score-prose.mjs` and `scripts/judge-tally.mjs` are judgment calls, not a validated scale; `rubric.md` states their limits.
