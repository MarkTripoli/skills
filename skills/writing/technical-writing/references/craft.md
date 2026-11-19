# Craft

Two parts. The editing questions apply the collection writing guide to a technical reader's use of a document. The craft notes after them decide whether a sentence deserves to exist and how sentences join. Neither is a compliance standard.

## Contents

- Editing questions: locate the answer, earned precision, actors, relationships, changed claims, tone, limits
- Orwell's six rules
- Tone don'ts
- How sentences connect
- Rhythm
- Warmth without chattiness
- Weasel words, fillers, cliches, plain words
- Label register
- Writing for a reader who lands mid-document
- Gloss every label
- Structure: lead with the point, paragraphs, limits once, precision budget

## Editing questions

### Can the reader locate the answer?

Read the opening without the rest of the document. Does it answer the stated question, or merely name the topic? "Exports resume after reconnecting" gives a result. "Export improvements" gives a category.

Inspect the headings as a short outline. A custom heading should help the reader find a result, decision, or action. Preserve required template headings even when a more descriptive heading would read better.

### Does each detail earn its precision?

A file path belongs where the reader must open the file. A complete command belongs where the reader must run it. A long inventory can live in a linked record, but the explanation must still carry the evidence necessary to judge its conclusion.

Retain exact precision in quoted measurements and required evidence. In a new summary, explain any rounding that could affect the decision. Do not silently round an input during a fidelity-preserving edit.

### Can a stranger identify the actors?

Look for "it", "they", "this", "the new flow", and names defined only in chat. Replace an ambiguous reference with its actor or object. Do not repeat a long name when its short form is already unambiguous for this reader.

Define a technical term through what it means here, not only through an expanded acronym. "A checkpoint records the last completed item" is a definition. Expanding an unfamiliar product abbreviation may not be.

### Do the sentences explain a relationship?

A paragraph can contain individually accurate sentences and still leave the reader guessing why they belong together. State the relevant cause, contrast, condition, or sequence explicitly. Do not add a causal relationship the source did not establish.

Read long sequences aloud. Split at a change of actor or a new independent action. Keep a condition with the action it governs. A list is safer than a compact sentence when readers must perform steps in order.

### Did tightening change the claim?

Compare the source and rewrite around these words:

- Negations: not, never, except, unless.
- Scope: only, all, some, this account, this device.
- Confidence: may, might, estimated, observed, untested.
- Obligation: must, should, can, permitted.
- Time: before, after, during, until.

A shorter replacement that changes one of these relationships needs a substantive decision, not editorial approval alone.

### Is the tone helping the reader act?

Remove praise, blame, and narration that contributes no evidence. Describe the failed operation rather than calling the system unreliable. Describe what the reader can now do rather than calling the change seamless.

Address the reader directly in a procedure. Explain a non-obvious prerequisite through its consequence. Do not call a step easy when the document exists because someone needs help completing it.

### Is the limit where it changes the decision?

State each limitation once in the place where it matters. A general limitations section works for shared constraints. A safety warning or a qualification that changes a result's meaning belongs beside the affected action or claim.

Do not move uncertainty away merely to make the opening sound decisive. The result and the evidence must support the same degree of confidence.

## Orwell's six rules

1. Never use a metaphor, simile, or figure of speech you are used to seeing in print.
2. Never use a long word where a short one will do.
3. If it is possible to cut a word out, cut it out.
4. Never use the passive where you can use the active.
5. Never use a foreign phrase, a scientific word, or a jargon word if an everyday English word exists.
6. Break any of these rules sooner than say anything outright barbarous.

Rule 6 is the one people forget. A sentence that obeys every rule and reads badly has failed.

## Tone don'ts

- Not stuffy. Write the way people speak, not the way lawyers write.
- Not hectoring. People who disagree are not stupid. Persuade with evidence, not volume.
- Not pleased with yourself. No victory laps in a changelog or a handoff.
- Not chatty. No "Let's dive in!", no "Awesome!", no exclamation points, no emoji.
- Not didactic. Guide. Do not lecture.
- Get straight in. Cut the paragraph that explains what you are about to explain.

## How sentences connect

Short sentences are easy to parse. Nothing in a length rule says how to join them. Unjoined short sentences read as a fact list, not an argument. Two techniques do most of the work.

### Old information first, new information last

Open each sentence with something the reader already has. End on what you add. The end of one sentence feeds the start of the next.

> Weak: The client retries a failed request. The retry budget is 3. Requests are dropped after the budget is exhausted. Callers see a 503.
>
> Strong: The client retries a failed request up to three times. After that budget is exhausted, it drops the request and the caller sees a 503.

Same facts, same rules obeyed. The first restarts every sentence. The second hands each sentence to the next.

Warning: old-before-new is not a license for the passive. "A 503 is returned to the caller" hides the actor. Reorder the sentence instead of demoting the verb.

### The stress position

English puts emphasis at the end of a sentence. Put the words that matter there.

| Weaker | Stronger |
|---|---|
| Restart the service after editing this file. | After editing this file, restart the service. |
| A 503 goes to the caller once the budget is exhausted. | Once the budget is exhausted, the caller gets a 503. |
| Data loss can occur if you skip the drain step. | Skip the drain step and you can lose data. |

### Connect with words, not punctuation

Semicolons and em dashes do not belong in machine-read text or documentation. Join with words: but, so, because, then, instead, after, when, until, yet. Short words doing structural work, cheaper than the punctuation they replace. Not "once": it is ambiguous between "after" and "one time".

## Rhythm

Sentence length is a diagnostic, not a target. Prose that hits 24 words every time tires a reader as fast as prose that runs to 40.

- Never three consecutive sentences of the same length and shape.
- A short sentence after two long ones lands. Spend it on the point that matters.
- Vary the opening. A clause of time, condition, or contrast up front changes the shape and usually improves the stress position.
- Read it aloud. Out of breath: split. Flat: vary.

Rhythm also settles the complaint against one name per concept. One word per concept means writing "the widget" ten times, and that is correct. Vary the sentence shape, not the noun. A repeated key term reads as precision. A repeated sentence pattern reads as a machine.

## Warmth without chattiness

Dry is not neutral. Neutral means no spin. Dry means no reader. Four moves buy readability in documentation at no cost in precision:

1. Address the reader as "you". "Run the migration", not "the user should run the migration".
2. Give the reason once. "Drain the queue first, because a restart drops in-flight jobs."
3. Name the consequence, not the rule. "Skip this and the migration fails halfway" beats "this step is required".
4. Stay concrete. A real path, a real value, a real error string.

Warmth means the reader is present in the text. It does not mean the author is performing.

## Weasel words

Claims that commit to nothing checkable.

- Vague quantifiers: many, few, several, numerous, various, some, a number of. Give the number or the share.
- Vague qualifiers: significant, substantial, considerable, notable, dramatic. Quantify or cut.
- Unsourced authority: "studies show", "experts say", "best practice suggests", "it is widely believed". Name the source or drop the claim.

| Weak | Strong |
|---|---|
| The project saw significant delays | The project finished four months late |
| Performance improved | p99 latency fell from 840 ms to 210 ms |
| The service is used widely | 12 internal teams call the service |
| Sales increased considerably | Sales rose 23% to $4.2 million |

Vague time and place too: recently (last month, on October 15), soon (by March, within 30 days), in the near future (by year end), in many countries (in the US, Germany, and Japan).

## Fillers

Delete on sight.

- Redundant openings: it should be noted that, it is important to realize that, the fact of the matter is, for all intents and purposes, at this point in time (now), in this day and age (today).
- Dead intensifiers: very unique (unique), completely finish (finish), absolutely essential (essential), extremely critical (critical).
- Empty phrases: in terms of, in the process of, for the purpose of (to), when it comes to, the ability to.
- Tautologies: advance planning, past history, end result, final outcome, collaborate together, new innovation, added bonus, close proximity, general consensus.
- Redundant pairs: each and every, first and foremost, null and void. Keep one.

## Cliches and dead metaphors

A cliche signals a writer who stopped thinking. Replace it with the plain meaning.

| Cliche | Say instead |
|---|---|
| at the end of the day | ultimately, or cut |
| game-changer | say what changes |
| low-hanging fruit | the easiest gains |
| move the needle | say how much it changes |
| paradigm shift, sea change | say what kind of change |
| perfect storm | name the factors that coincided |
| silver bullet, holy grail | a simple fix, the ultimate goal |
| think outside the box | describe the idea |
| tip of the iceberg | say what is hidden, and how much |
| double-edged sword | say both effects |
| deep dive | a close look, or cut |
| best-in-class, industry-leading | give the benchmark |

Test: if the phrase could appear in any company's press release, it does no work in yours.

## Plain words

Business-speak and long words, with the plain replacement:

| Instead of | Write |
|---|---|
| utilize, leverage | use |
| facilitate | help, enable |
| implement | build, add, start |
| going forward | from now on |
| learnings | lessons |
| surface (verb) | show, report |
| approximately | about |
| commence | begin, start |
| terminate | end, stop |
| obtain | get |
| ascertain | find out |
| demonstrate | show |
| sufficient | enough |
| additional | more |
| numerous | many |
| regarding, with regard to | about |
| prior to | before |
| subsequent to | after |
| in order to | to |
| in the event that | if |
| due to the fact that | because |
| a majority of | most |
| at this time | now |
| provenance | source, origin, where it came from |
| disposition | decision, outcome |
| parity | the same, equal, matches |
| attributed (a cause) | explained, traced to |
| immutable | unchanged, frozen, fixed |
| retained | kept |
| genuine, actual | real, or cut. Say "measured" when that is the claim |
| artifact (a file) | the file, the report, the record. Name the thing |

Test: would you use this word talking to a colleague at lunch? If not, do not write it.

Inclusive language where it reads naturally: artificial not man-made, staff not manpower, chair not chairman for a generic role. Use they/them when pronouns are unknown.

## Label register

Block language (headlines, captions, table cells, slide titles) drops the verb and hangs modifiers off a noun phrase:

> Four worked examples, one per register plus the two traps that catch most rewrites.

Correct on a label. In running prose it fails twice.

- It collides with the reader's expectation. Prose sets up a speaker addressing a reader. A verbless fragment opens a slot for a predicate that never arrives.
- It has no truth conditions. "One per register" is a tag, not a claim. Nothing predicates it, so nothing checks it. Written as a claim, "one example per register", the arithmetic is visible and an error surfaces at once.

Brevity rules push hard toward this register. A length target and "cut every spare word" both reward dropping the verb, and neither notices the claim left with it. A length target is never a reason to drop a predicate. If a sentence is too long with its verb intact, split it.

| Version | Problem |
|---|---|
| "Four worked examples, one per register plus the two traps." | No verb, so no checkable claim |
| "This document shows four worked examples. One example is given per register." | Self-reference, agentless passive |
| "Four examples follow: two machine-read strings, one documentation paragraph, and one prose opening." | Finite verb, no announcement, glossed labels |

Keep the verb. Drop the announcement. Chat fragments are the one exception, and only where the fact is checkable without the verb: "Parity OK (54 pairs)."

## Writing for a reader who lands mid-document

Readers arrive from a search result, a deep link, a diff, a chat message, or a log line. Write so that landing works.

- Define a term where it first appears. A glossary is a backstop, not a mechanism.
- Cut backward references that carry meaning: "as mentioned above", "the aforementioned approach". Repeat the three words.
- Cut forward references that gate comprehension. If this paragraph needs the next section, the sections are in the wrong order.
- Keep a pronoun near its antecedent: same sentence or the one before, no competing noun between. Otherwise repeat the noun.
- Name what a link points to. "See the retry policy", never "see here".
- Budget acronyms. Past about three distinct acronyms in a paragraph, the reader is substituting symbols.

Test: could someone who landed on this heading from a search read the section and get what they came for?

## Gloss every label

A label points at a meaning. It does not carry one.

| Bare | Glossed |
|---|---|
| phase 2 | phase 2 (the migration) |
| ADR-0075 | ADR-0075 (store-only remote snapshots) |
| PROJ-123 | PROJ-123 (the lost shift signups) |
| the amber state | the amber state (degraded, still serving) |

Gloss at first use in each place a reader can land: first use in the document, first use in each major section, any heading or list item read out of order, and every machine-read string every time. Do not gloss when the name already carries the meaning, when you glossed it in the same paragraph, or when the label is universal to the audience (HTTP 404, exit 1, `main`). In a dense table, use a one-line legend instead of glossing every cell.

## Structure

### Lead with the point

The first sentence answers the question the reader came with. What that is depends on the document's job, not on a fixed rule.

- Error message: what failed, then why, then what to do.
- Incident write-up: what broke, who it hit, for how long. Timeline after.
- PR description and commit body: what changed and why, first line. Implementation notes after.
- Design doc: the recommendation first, then alternatives and reasoning.
- Design brief: the people and the problem first, because the builder needs the why before any how.
- Handoff: what is done and the one decision the owner must make. Hashes and file lists in a footer or a linked record.
- Release note: what the reader can now do that they could not before.
- Chat reply: the answer, then the evidence, then the risk, then the next step.

### Paragraphs

- One topic each. Six sentences maximum, three to five is the norm.
- Open with the topic sentence. Evidence follows.
- Every paragraph advances the argument. One that only restates the last is deleted.

### Limits once

A result and its limit are both facts, and both belong in the document. Write each limit once. Shared constraints go in one Limits section near the end. A qualification that changes what one result means, or a warning before an action, stays beside that result or action.

| Weak | Strong |
|---|---|
| Ten signups produced ten confirmation emails, although this does not prove exactly-once delivery, and the mail server was a local stub, and no real inbox was tested. | Ten signups produced ten confirmation emails. (Limits: local mail stub only. Exactly-once delivery is not proven.) |

A document that repeats "this is not an invoice" four times was written for an imagined auditor. The real reader reads the first result, meets the first disclaimer, and skims the rest.

### Precision budget

Precision is a cost the reader pays. Spend it where the reader acts.

- A dollar figure to cents. Four decimals on $31.1016 inform nobody and signal that the writer did not choose.
- A duration to one decimal unless the decision turns on less.
- A commit hash to nine characters in prose, and in full once in a footer.
- A file name only where the reader has to open that file. A list of 40 file names is an inventory. Put it in a manifest and link it.
- A timestamp to the minute in prose. Microseconds belong in the log that produced them.
