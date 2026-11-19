---
name: technical-writing
description: Writes, edits, reviews, and scores technical prose around one reader's task while preserving every source fact, number, hedge, and literal string. Use when the user runs /technical-writing or asks to tighten this, do a style pass, make this clearer, proofread, disambiguate, score this text, or write a doc, report, handoff, error message, prompt, PR description, or commit message so nobody can misread it; not for removing machine-sounding patterns alone (deslop), writing a decision RFC (rfc-six-pager), or changing code and literal strings.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Technical writing

A useful technical document lets its reader understand a result, make a decision, or complete an action without recovering the author's conversation. This skill owns the sentence-level rules other skills cite. It needs no sibling skill and no external service. When the optional `deslop` skill is installed, it removes machine-sounding patterns; this skill does not repeat that catalog.

`<skill-dir>` below means the directory holding this SKILL.md.

## Name the reader and the question

Before any sentence, answer two questions: who reads this, and what question do they hold? The document has one job, to answer that question. When a rule further down conflicts with these principles, the principle wins.

1. **One reader, one question.** Open with the answer: the result for a report, the people and the problem for a brief, what broke for an incident, the decision for a design record. A second reader gets a second document or a section at the end.
2. **The reader was not in the room.** No chat context, no history of how you got here, no term coined during the job. Gloss the term or drop it. A person who never saw the conversation reads it cold and gets what they came for.
3. **Inform, do not defend.** A finding and its limit are both facts. Lead with the finding. State each limit once, where it changes the decision. A sentence that carries its own disclaimer was written for an imagined auditor.
4. **A concrete scene before the mechanism.** For an unfamiliar behavior, show one realistic situation first: named people, one ordinary action, one condition, and what each person sees. Then give the cause in about three steps. Mark invented values as invented.
5. **The why before the how.** A request opens with the goal and the reason, and leaves the method to its owner unless the method is itself a requirement.
6. **Choose, do not compress.** Shorten by leaving out facts the reader does not need, not by cutting the words that make a sentence readable. Detail one reader in ten needs goes to a linked record.
7. **Precision serves a decision.** A number, hash, timestamp, or file name appears where the reader acts on it, at the precision the action needs.
8. **One current document per deliverable.** When the state changes, rewrite from the top. A log is a different document with a different reader.
9. **Pass the reader when you delegate.** Name the reader and these principles in a worker's prompt. Read the draft as that reader before forwarding it.

## Establish the writing contract

Read the supplied text and applicable repository instructions first. Infer the reader, what they already know, and the output location from the request and sources. Ask only when a missing choice would change the deliverable.

Choose the operation:

- **Draft**: create prose from supplied facts and decisions. Label assumptions instead of presenting them as source facts.
- **Edit**: improve the given prose without changing its meaning or scope. Follow [Scope limits when editing](#scope-limits-when-editing).
- **Review**: report problems and their effect on the reader without changing the text.
- **Score**: follow [Score a text](#score-a-text).

Honor the requested output path. For an indexed task artifact, validate the task's index and create an immutable successor through its artifact contract; never edit a recorded iteration or assume a fixed task root. An ordinary source-controlled document can be edited in place.

## Pick the register by where the text lands

| Register | Text | Shape |
|---|---|---|
| Chat | Replies, status, findings, handoffs to the engineer | Answer first, then evidence. Fragments are fine when each one states a checkable fact. |
| Machine-read | Error messages, tool and function descriptions, prompts, inter-agent instructions, runbooks, procedures, tickets, safety text | One word per concept, imperative instructions, no semicolons or em dashes. Review any sentence over about 20 words. |
| Documentation | Docs, READMEs, specs, decision records, PR descriptions, commit bodies, release notes, code comments | "You" and imperatives, the reason given once, technical terms locked. Review sentences over about 25 words. |
| Prose | Incident write-ups, design rationale, memos | Chosen on purpose. Dry, varied rhythm, technical terms still locked. |

When two registers fit, the stricter one wins: stricter costs some voice, looser costs a misread. A reader who cannot ask a follow-up (a parser, a stranger, a translator, an on-call engineer at 3 a.m.) gets the stricter one. A README with a procedure inside uses machine-read for the procedure and documentation for the rest. Never pick a register to license a sentence you want to keep.

Sentence length is a diagnostic, not a quota. Read a difficult passage as the intended reader and simplify the actual obstacle. Do not force an accurate sentence into fragments that lose its conditions.

## Pick the mode

A document has one mode. When a draft mixes them, split it and link the parts.

- **Tutorial**: the learner builds one named thing. Every step produces a visible result, and the text says what the learner should see. Explanation gets one clause and a link.
- **How-to**: steps to the reader's goal, for a competent reader. Action only, forks allowed, titled by the task.
- **Reference**: facts for lookup. Describe only, completely, in the structure of the thing described.
- **Explanation**: one bounded topic and its why: design decisions, constraints, alternatives. Opinion belongs here and nowhere else.

For reports, handoffs, reviews, tickets, and requests, start from [references/report-shapes.md](references/report-shapes.md): a table of reader tasks plus a default shape per document, with what goes in the opening and what goes to a linked record. A template another skill owns wins over these shapes.

PR descriptions and commit messages are writing too. A PR body is a briefing a reviewer can read in under a minute: what changed and why first, then anything the reviewer must check. Link logs and metric tables instead of pasting them.

## Separate evidence from expression

Before a rewrite, identify the statements whose meaning cannot change: results and measurements (value, unit, population, comparison), requirements (actor, condition, obligation, exception), uncertain claims (what is known, suspected, untested), and instructions (order, target, consequence, recovery). Keep this inventory internal unless a reader needs an audit trail.

Do not supply a number because "several teams" sounds vague. Keep the source's quantity and flag the missing count. "May have failed" does not mean "failed", and "not tested" does not mean "does not work". A wording change that alters one of these is a factual change, not copyediting.

Keep exact errors, flags, paths, symbols, and quoted output intact. Remove filler around a literal, never characters inside it. When sources disagree, name the conflicting claims and their authority instead of resolving them through confident wording.

## Sentence rules

These hold in every register. [references/craft.md](references/craft.md) explains them with examples; load it for a substantial rewrite or when a fix is not obvious.

**Build the sentence**

1. Active voice with the actor named. When the source does not establish the actor, keep that uncertainty instead of inventing ownership.
2. Old information first, new information last, so each sentence hands off to the next.
3. A finite verb in every sentence of running prose. Verbless labels belong in headings, table cells, captions, and chat fragments.
4. One idea per sentence, and one instruction per step.
5. Keep the connective words (because, so, but, after) that explain why the next fact follows.

**Leave no sentence open to two readings**

6. Keep "only" and "not" next to the word they modify.
7. Break noun strings longer than three words: "the evidence target, a frozen profile build", not "frozen custom profile evidence target".
8. Make every "it", "they", and "this" point at one nearby noun. Never let "this" or "which" point at a whole clause.
9. Keep "that" and the other small words that show structure.
10. Say what "and" or "or" joins, and repeat the article when a series could misread. No slash-lists in prose ("org, group, and team", not "org/group/team"); fixed names such as CI/CD stay.
11. One name per thing, everywhere. Vary the sentence shape, never the noun.

**Cut**

12. Phrasal verbs (start, not spin up), nominalizations (analyze, not perform an analysis of), and long words where short ones exist (use, not utilize).
13. Marketing adjectives and unsupported praise: replace with the observed behavior or delete. Never invent a benchmark to rescue an adjective.
14. Weasel words with no number (many, several, significant): give the number from the source, or flag that it is missing.
15. Filler, pleasantries, self-reference, and tool-call narration. Report results, not the steps that produced them, unless the steps are the finding.
16. Invented abbreviations (cfg, impl) and arrows as connectives in prose.

**Mechanics**

17. Sentence-case headings. No sentence starts with a numeral.
18. Errors quoted exactly, shortest decisive line. Code, identifiers, paths, and commands in code formatting and untouched.

[references/word-list.md](references/word-list.md) holds the listed words the scorer reports, each with what to write instead. [references/ste-structure.md](references/ste-structure.md) gives the structural rules from Simplified Technical English in full; load it for machine-read text that a translator or a parser will read.

## Settled rulings

Do not relitigate these mid-edit.

- **US English**: -ize, color, center, gray, canceled, judgment. Convert the text; do not match the existing dialect.
- **Serial comma**: always.
- **Dates**: April 5, 1999 in prose; 1999-04-05 in logs, file names, tables, and machine strings; never 4/5/99.
- **Numbers**: one to ten in words, 11 and up in figures. Always figures for steps, versions, ports, exit codes, measurements, percentages, and machine-read quantities. A space before a unit: 250 ms.
- **Precision**: what the reader acts on. Dollars to cents, seconds to one decimal, a nine-character hash in prose with the full hash once in a footer. In an edit, never round a source value silently.

**The hedge rule.** Cut throat-clearing (arguably, it is important to note, somewhat, fairly, quite). Keep epistemic modality (may, might, is likely to, we estimate, about). Test: delete the word. If the claim's truth conditions do not change, it was throat-clearing. If they change, it was content, and cutting it makes a new claim. This is the most common way a tightening pass goes wrong.

The remaining rulings live in two references. [references/us-conventions.md](references/us-conventions.md) covers spelling conversions, punctuation, quotation marks, dates, numbers, money, and capitalization; load it for a dialect conversion or a punctuation question. [references/word-rulings.md](references/word-rulings.md) is an A to Z of commonly misused words; load it when a word choice is in doubt.

## When to drop compression

Chat compression yields to full sentences, with articles and connectives, when a misread costs more than the words:

- Security warnings.
- Confirmations of irreversible or destructive actions.
- Ordered steps where fragment order or a dropped conjunction changes the meaning. Write them as a numbered list.
- Any place where compression creates a technical ambiguity, or the engineer asks again.

Resume compression when the clear part is done.

## Make procedures safe to follow

Use only steps supported by the source or repository. A missing command, destructive consequence, or recovery path is a gap to flag, not to guess.

1. State prerequisites before the first action that needs them.
2. Put a warning before the action that causes its consequence, and say what can be lost.
3. Give each step one bounded action. Put the condition before the instruction and the common case first.
4. Preserve exact commands and name the working directory or environment when it matters.
5. Describe the observable result and the next action when it differs, when the source provides them.

For an agent-facing instruction, make the input, allowed changes, stop condition, and required output explicit. Never rely on a pronoun or a chat-local nickname to identify a file or owner.

## Scope limits when editing

Edit the prose you were given and nothing else.

- Cutting words is in scope. Cutting content is not.
- Do not delete, merge, or reorder sections. Say in one line that it needs restructuring; the author decides. The one structural move in scope is lifting a buried claim to the front of its paragraph.
- Do not cut a weak paragraph. Flag it.
- Do not add sections, examples, caveats, or background. A sentence you add to make an instruction usable is called out as added.
- If the text shrinks by more than about a third, say so and name what went.

## Project precedence

A project's own prose rules outrank this skill, rule by rule. They count when they come from `STYLE.md`, a style section in `CONTRIBUTING.md`, prose rules in `AGENTS.md`, a configured prose linter, or the user. Existing prose does not count: a repository full of British spelling is a habit, not an instruction. Where the project is silent, this skill applies in full. Report each displacement on an `Overruled by project style:` line.

## When not to apply

- Direct quotations, third-party names, and code, identifiers, flags, API fields, paths, and error strings you do not own. `colour` stays `colour` if that is the flag.
- Creative or persuasive copy where voice is the point, product UI strings governed by a product's copy guidelines, and legal text where "shall" and the passive are load-bearing.
- Weak content. These rules fix form, not substance. Say the content is thin rather than polishing it.

## Score a text

Run this when the user asks how good a text is, and before handing over a document longer than a page.

1. Run `node <skill-dir>/scripts/score-prose.mjs <file>`. It prints `score: <n>/100`, the cost of each kind of fault, and each hit by line; add `--json` for the same as JSON.
2. Rewrite the sentences behind the largest cost. Do not swap a listed word for a synonym or split a sentence only to move the number.
3. Rerun until the score reaches 90 or after three rounds, then report what is left.

The score checks form, not whether the text answers its reader. For a text that matters, three fresh readers answer [references/rubric.md](references/rubric.md), which holds the fifteen questions, the votes format, and the scoring key. Then run `node <skill-dir>/scripts/judge-tally.mjs <file> <votes-1.json> <votes-2.json> <votes-3.json>`; it prints `combined: <n>/100` with each failed question and the fixes ranked by gain. Report the script, judged, and combined numbers together.

## Compare meaning and deliver

Read the result against the source: numbers, units, actors, negations, permissions, conditions, chronology, and hedges. Check that each link still supports its claim. Then read only the title, headings, opening, and last action as the reader, and fix any mismatch between what they promise and what the text establishes.

Return the requested format. Otherwise:

- A draft or rewrite comes first, without an announcement, followed only by the factual questions or editorial choices the reader needs.
- An in-place edit reports what changed, where, and each fact left unresolved, on lines such as `Kept as-is:` (a longer phrasing kept on purpose) and `Flagged, not fixed:` (a fact, number, or restructure you must not supply). Give a change table only on request.
- A review gives the location, the likely misreading or failed action, and a concrete revision, and separates factual gaps from style preferences.

When nothing needs changing, say so. Never claim a writing pass established facts its sources did not. [examples/before-after.md](examples/before-after.md) shows one worked rewrite per register and the two traps (a hedge that carried content, a label with no verb); read it before a first edit in an unfamiliar register.

[references/sources.md](references/sources.md) records where these rules came from and what the skill does not claim; read it only for attribution questions.
