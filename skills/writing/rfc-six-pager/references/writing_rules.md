# Writing rules for a technical RFC

## Contents

- The reader
- Bottom line first
- Give the decider what they need
- Take a position
- Leave out what nobody needs
- One point in a paragraph
- Say what a risk is
- Close what can be closed
- Show the mechanism
- Numbers and their sources
- Sentences and words
- What a machine-written draft looks like
- Before and after

The technical-writing skill owns sentences and words. These rules add what this format needs. Most of them come from what reviewers said about real RFCs.

## The reader

The readers are engineers on the team, and one of them decides. They know the stack. They were not in the investigation. They read the RFC once, in silence, at the start of the review meeting, and they must be able to decide from it without asking the author.

1. Do not teach how standard technology works: SQLite, CI, a mutex. Do say, in a clause where it first appears, what a component does for this product: "a service worker, a browser script that keeps the app's files for offline use". Readers outside the team read the RFC too.
2. Explain a name this project coined, once, where it first appears. Use the same name every time after that.
3. Internal names, module names, file paths, type names and units are welcome. They are what the reader will search for.
4. Link a third-party library, tool or service to its repository or home page where it first appears, so a reviewer can check it: "[Litestream](https://github.com/benbjohnson/litestream) replicates the database". Use the address a source gives or the project's own, never a guessed one.
5. Explain how the affected part of the system works today, briefly, when the proposal changes it. A reader who knows the stack does not always know this part of it, and cannot judge a change to a flow they have not seen.

## Bottom line first

1. The RFC opens with the Decision section: what the team will do, why in a sentence, and the main cost, in at most 250 words. It asks for nothing. No background comes before it.
2. Each section and each paragraph opens with its claim. The evidence follows. A reader who stops after any first sentence has the point.
3. A heading the author writes names the part or states the claim: "Retries and dead letter" or "Retry for 24 hours, then dead-letter", not "Details".
4. Lead with the consequence, not the mechanism, when describing the problem: "We lose events: 1.8% of webhooks were dropped in 90 days" before how they were dropped.

## Give the decider what they need

A short RFC that leaves out what the decider needs is worse than a longer one that has it. Before cutting anything, check that the body holds each of these:

1. What goes wrong today, as consequences with numbers, and who notices.
2. How the affected part works today, when the proposal changes it.
3. The load, the sizes and the limits the design must handle.
4. Every option that was weighed, compared on the same goals, with the reason each loses.
5. How each part of the design works, exactly enough to object to.
6. Each cost the decider accepts, stated where it arises, including costs other teams or customers pay.
7. What happens when the design fails, and the response to each failure.
8. The outcomes: what changes, for whom, and how the team will know, with today's value and the target.
9. What is not known yet, who finds out, and by when.

Connect the facts. A number on its own is a fact; the sentence that says what follows from it is the reason the decider reads the number. "9 events a second at the month-end peak, against 200 a second of claim capacity" carries the conclusion that "polling is cheap" only claims.

## Take a position

1. Recommend one option, and say why it beats each other one.
2. State each trade-off as a choice with its price: "We accept that later events for a failing invoice wait up to 24 hours, so that customers get events for one invoice in order."
3. Give a rejected option its strongest case before the reason it loses. A reviewer who favors it is looking for that.
4. When the design swaps a component the system uses today for another, say why today's component cannot carry over and what the swap costs, such as a second file format or a second library to patch. "The worker keeps Postgres" is the obvious question; answer it where the swap appears.
5. When a cost is a product decision as much as an engineering one, say so, and state it as a cost in the Decision section.
6. When two goals can conflict, say which wins, as priorities under the goals: "A kill switch acts within 10 seconds, over lower latency." A priority nobody could disagree with, such as "we care about quality", settles nothing: cut it.
7. Mark what is the writer's own. A position, a rejected option or a default that the sources do not state is allowed when the format needs one, and the reply to the author lists it, so that the author can confirm or change it.

## Leave out what nobody needs

1. Leave out a topic no reviewer would argue about or ask about. A change that someone proposed or asked for, and that a reader would assume this RFC makes, goes in Out of scope, one line with the reason it waits. A capability that a draft lists and nobody asked for is cut, not listed as out of scope.
2. State each fact once, where it is used. The Decision section may repeat the main cost; a third statement is padding.
3. State the result and leave out how it was obtained. Revision numbers, job names, tool versions and who checked what belong in an appendix.
4. Say what is true, not what is not claimed or not known. "This is not a forecast" and "not audited for this memo" defend the author and inform nobody; so does a statement of absence, a sentence whose content is that a fact is missing. Before: "The cost of the failed exports is not measured." After: nothing, or, when the decision needs the figure, a row in Open questions: "How many customers does the outage cost each month?" with what makes it hard to count. Any other missing fact is left out, and the reply to the author lists it. State a real limit once, as a cost accepted or an open question. The cost of doing nothing is what continues if nothing changes ("Support keeps opening a ticket for each failed export"), with its number when a source gives one.
5. Do not announce what follows ("This section describes…"), and do not list items only for completeness.
6. Do not send the reader to another document for an answer the decision needs. One RFC carries the decision.
7. Do not argue from precedent. "Two large payment companies run this queue in production" tells the reader that others did it, not what this design gains or risks. Cite another product only for a fact the decision uses, such as the bundle size it measured or a failure it hit.

## One point in a paragraph

A list of true facts is not an explanation. A reader who meets six sentences about six different things cannot tell what to do with any of them.

1. A paragraph makes one point. Its first sentence states the point and each later sentence supports it.
2. Each sentence starts from something the sentence before it gave the reader. A sentence that starts on a new subject starts a new paragraph, becomes a list item, or goes.
3. Parallel facts about different parts are a list or a table, not a paragraph.
4. Keep the states apart. The design subsections describe the design as it will be. What exists today goes in Problem and goals, what is undecided in Open questions, and what the system does when something fails in Failure modes and risks, as a row. A paragraph of error handling inside a design subsection breaks the subsection's point; a guard that only test builds relax is detail for the tickets.

Before, one paragraph with five subjects and three states:

```markdown
Segments are 64 MB, compress with zstd, and stay on disk for seven days. The reader rejects a segment with a bad checksum. A repair tool does not exist yet. Other regions get a nightly copy. The retention for audit segments is not chosen.
```

After, in a subsection about how a segment is written:

```markdown
A reader never sees a half-written segment. The writer fills a temporary file, records its checksum, and renames the file into place. The reader refuses a segment whose checksum differs.
```

The repair tool that does not exist yet is left out of the design. The retention that is not chosen becomes an open question. The nightly copy belongs to another subsection.

## Say what a risk is

A risk has three parts: the trigger, the effect, and the response. "A gateway restart may cause problems" has none of them. Write "When the gateway restarts, open sessions lose their socket and reconnect within 5 seconds. No data is lost, because the client queues writes." If the three parts cannot be written, find them out or delete the sentence.

Write the effect as what the user sees and what happens to their data, not as a system state: "the user cannot tell whether the change saved", not "the outcome stays uncertain". Say which cases are already protected, and how. "Not built" is not a response: name the fix the design commits to, or put the gap in Open questions. A response copied from a risk register without its effect, such as "old devices need a cleanup rule", leaves the reader asking why: write what goes wrong without it, or cut it.

Do not hint. Words such as "may cause issues", "could be problematic", "needs care", and "non-trivial" tell the reader that the author is worried and not why.

Do not reassure either. "Nothing breaks while the database fails over" claims an outcome without saying what happens. Write what the system does: "While the database fails over, writes queue in the client and replay when it returns."

## Close what can be closed

1. Answer every question the author can answer, and write the answer as the proposal.
2. Every open item is in Open questions: a question that names the hard part, and our proposal when the team has one. With no proposal, leave the cell blank. No owner and no date. "Account recovery remains open" fails. This passes:

   ```markdown
   1. **Account recovery.** How is an account recovered when a browser has no secure hardware to hold the recovery key? We propose a printed recovery code.
   ```
3. No instruction to the author survives in the text. A line such as "Keep these questions explicit:" or "Consider adding a diagram here" is a note from a prompt or a reviewer. Do what it asks, then delete it.

## Show the mechanism

A design subsection shows how the part works, in enough detail that an engineer could object to it: what is stored or sent, where, in what form, what enforces it, and its limits as numbers. "Invoices are stored securely" gives a reviewer nothing to check. "Each invoice is a row in Postgres, encrypted with AES-256-GCM under a per-tenant key that the cloud key service wraps" does.

Pick the form from the table in the outline. Draw a diagram when three or more parts pass data, and also when the reader must picture a structure: which code goes into which build, which process owns what, what calls what. A diagram replaces the prose that walked through the same parts, and its labels do not count against the word limit. Introduce each diagram, table and list with one line that says what the reader should see in it. Use the show-me skill to make a diagram, as Mermaid in a code fence.

The mechanism comes from the sources. Do not design a part the sources leave out: a data structure, a script, or a protocol that nobody proposed is an invented fact. State what the sources give, and add the missing part to Open questions as "How does <part> work?".

Sketch an interface; do not paste it. The fields and the signature that the decision turns on stay in the subsection. The full schema goes to an appendix.

## Numbers and their sources

A reader who cannot tell a measurement from a guess must trust the author, and a review is the place where trust is not enough. Every claim says where it comes from.

1. Give each number its unit, its period, and a comparison.
2. Cite each claim at the claim, as [n], and list the source once in `## Sources`: what it is, where it lives, and its date or period, or `undated` when the source gives none. A claim is any number, size or comparison about the world, in a sentence, a list item or a table cell. Read each sentence and ask what a doubting reviewer would ask: where does that come from?
3. Label an estimate as an estimate and say what it rests on: "about $1,900 a month, the team's estimate for 2 instances [5]". Label an assumption as an assumption. Before writing "we infer" or "we assume", check whether a spec, a compatibility table or the library's own docs settle it, and when one does, state the fact with that source. An inference that "X cannot work" is the claim a reviewer tests first.
4. A number, name or date the sources do not hold is never made up, and neither is a source. Leave it out and ask the author; when a decision needs it, ask it as a question in Open questions. Never write a sentence that says it is missing.
5. Give the sizes readers will ask about before they ask: volume, latency, cost a month, and who pays it.
6. Check the numbers against each other. A 6-second load target beside an 8 MB download on a 10 Mbit/s link does not hold, and a reader will do that sum in the room.

## Sentences and words

Apply the Tier 2 rules of the technical-writing skill.

1. Sentences of at most 25 words, in the active voice, with a verb that does the work: "we analyzed", not "we conducted an analysis".
2. Short is not the same as clear. A row of short sentences on different subjects reads worse than one sentence that joins two facts with "because" or "so". Keep the words that connect.
3. Prose carries the reasoning. Tables, lists, code and diagrams carry the facts. A table cell holds one short claim.
4. List items and table rows are parallel: the same kind of thing in the same grammatical form.
5. Bold is for the label that opens a list item or an option's paragraph, such as `**B. Kafka after commit.**`. No bold inside a sentence.
6. No word from the word list of the technical-writing skill: no weasel words, hedges, jargon, metaphors, filler, or signposts. The checker names each one with what to write instead.
7. A hedge stays only with its condition: "fails when the tab is closed during the write", not "may fail".
8. No sentence built as "not only X but also Y" or "it is not X, it is Y". State Y.
9. No rhetorical questions, no emoji, and at most one dash-separated aside in a paragraph.
10. Names for people and teams, dates for times, and "we" for the team that proposes.
11. State where a product runs today as a fact, not as a label for the product: "Today the field app runs only on mobile", not "The field app is a phone product".
12. Say what happens to the product, in the product's name, not in the platform's terms: "the browser deletes the app's data, keys included", not "the origin's script-writable storage is cleared". A platform term stays only when a reviewer needs it, after the effect.
13. A simple point gets one sentence: "The app does not work in private windows: two browsers give them no file storage [4, 5], and the third deletes their data when they close [6]." Do not spread one claim and its reasons over a sentence for each browser.
14. State a gap against the product the reader knows by naming what that product does: "The mobile app locks behind biometrics; the web app has no lock", not "The app has no lock".
15. Write a limit as what the user cannot do today, then why: "Today the app cannot start without a network once the browser has closed, because its code sits in a cache the browser may clear", not "Cold offline start does not work yet".

## What a machine-written draft looks like

When revising a draft, look for these and fix the cause, not the surface:

| Sign | Cause | Fix |
|---|---|---|
| Sections named Executive summary, Overview, Benefits, Conclusion | A generic document shape | Place each fact under the section whose question it answers; delete the conclusion |
| The recommendation on page two, after the background | Written in the order the author thought | Move the recommendation and the cost to the Decision section |
| Options described in separate places, or only the winner described | The comparison was never made | One Options table on the goals, one paragraph per option |
| Bulleted lists of bold labels with a phrase each | Facts with no claim | Write what follows from them, or drop them |
| Every option described, none chosen | A report | Choose, and state the price |
| Every capability, risk and edge case listed | Coverage in place of judgment | Keep what a reviewer would argue about |
| Numbers with nothing said about them | The conclusion was left to the reader | Say what follows from each number |
| Numbers with no source, or a source invented to fill the gap | The writer filled in what the material lacked | Cite the source, label the estimate, or ask the author |
| "Stored securely", "handled by the sync layer" | The mechanism is missing | Name what is stored, where, in what form, and what enforces it |
| The same claim in three sections | Padding | State it once, where it is used |
| Risks named with no mechanism | A guess | Find the trigger and the effect, or delete |
| "Remains open", "to be determined", questions left for the reader | The thinking was not finished | Answer, or add it to Open questions |
| Praise for the proposal (words from the jargon table) | No measurement | The number, or cut |
| Instructions or questions addressed to the writer | Prompt or review residue | Act on it and delete it |
| "Does not establish", "is not a forecast", "not claimed" on every page | Written to defend, not to inform | State what is true; one limit, once |
| "Is not measured", "unknown", "nobody has counted", "no data" | A gap reported as a finding | Cut it; ask it in Open questions when a decision needs it, and list it in the reply |
| Revision numbers, job names, "reported results" | A log of the investigation | State the result; the log goes to an appendix |
| A work list under a strategy heading, phases, or effort in people and weeks | Planning pasted in | State the outcome; the work list and the estimate go to the tickets, and the reply says they were removed |

## Before and after

Before:

```markdown
## Benefits

- **Scalability:** The new architecture is highly scalable and future-proof.
- **Developer Experience:** Significantly faster iteration cycles.
- **Risk:** Gateway restarts could be problematic. Keep this question explicit: what about recovery?
```

After, as one option's paragraph and one design subsection:

```markdown
**A. Session state in Redis.** A gateway restart then ends no session. Today a restart drops every open session: it happened 14 times in September and logged out about 2,100 people each time [2]. The cost is one more service to operate, at $310 a month [4].

### Sessions across a restart

Each gateway writes session state to Redis on every change and reads it on reconnect. A restarted gateway serves its first reconnect within 5 seconds, and the client queues writes until then.
```

And one open question:

```markdown
1. **Redis failure.** How does a session survive a Redis failure, when the session key exists only in memory? We propose a replica in a second zone.
```
