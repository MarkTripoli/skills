# RFC outline

## Contents

- The template and how to extend it
- What each section answers
- Options
- Proposed design
- Sources
- Word budget
- FAQ and appendices

## The template and how to extend it

The base template is `rfc_template.md`. Copy it to start a working copy. `check-rfc.mjs` reads the same file: its metadata lines are required, its headings up to `## Open questions` are the body in order, and its placeholders in angle brackets must be gone from a finished RFC.

`Status` is one of Draft, In review, Accepted, Accepted with changes, Rejected, Superseded. `## Sources` comes after the body whenever the body cites one. `## FAQ`, an appendix and `## Review record` are optional and come after it.

A team that needs more makes its own template:

1. Copy `rfc_template.md` into the team's repository, for example as `docs/rfcs/TEMPLATE.md`.
2. Add what the team requires: a metadata line such as `Ticket:`, or a body section such as `## Security and privacy`.
3. Keep the eight base sections, in order, with `## Open questions` last in the body. An added body section counts toward the 3,000-word limit.
4. Check with `--template <path>`. The checker stops with the reason when the template drops or reorders a base section.

## What each section answers

The body is what the meeting reads. A reader who stops after `## Decision` knows the recommendation, why, and its cost. A reader who reads the whole body can decide without asking the author anything.

| Section | The reader's question | Holds |
|---|---|---|
| Title | What is proposed? | The proposal as a claim: "Deliver webhooks from a Postgres outbox", not "Webhook RFC". |
| Decision | What will the team do, why, and what does it cost? | At most 250 words. Two or three sentences: what the team will do, why in a sentence, the main cost. It asks for nothing. A guarantee that becomes a promise to customers, or a cost another team pays, is stated as a cost. |
| Problem and goals | Why do anything, and what must the design do? | What goes wrong today, as consequences with numbers: what is lost, what breaks, who notices. How the system works today, as numbered steps, when the proposal changes it. The load and the sizes the design must handle. What continues if nothing changes, with its number when a source gives one. A missing figure goes to Open questions when the decision needs it, and is otherwise left out. Then the goals as a numbered list, each one a reader could check. Then, when two goals can conflict, the priorities: a numbered list of what wins over what, such as "A kill switch acts within 10 seconds, over lower latency". A priority nobody would disagree with settles nothing: cut it. Last, `### Out of scope`. |
| Options | What else was weighed, and why does the recommendation win? | A table that compares every real option on the goals, with a verdict column. Then one paragraph for each option: what it is and the reason it wins or loses, with the number. Doing nothing is an option when the decider could choose it. See the next section. |
| Proposed design | How does it work, exactly enough to object to? | One `###` subsection for each part: what is stored or sent, where, in what form, what enforces it, with limits as numbers. A diagram when three or more parts pass data. Each choice inside a part that a reviewer would argue about says what it costs and the option it beat. |
| Cost | What does it cost to run, and what do we accept? | A table a manager can budget from: the total a month, and each item in it, today and after, or at each scale the usage drives (users, requests, data), using one usage assumption stated above the table. A price per unit or per user is not a budget: multiply it out. Name what the total leaves out. Then each cost the team accepts, as a trade-off with its price, such as work another team does or a limit customers meet. Each figure cites its source or says it is an estimate and what it rests on. |
| Failure modes and risks | What goes wrong, and what happens then? | A table: trigger, effect, response. A risk column may replace trigger and a mitigation column may replace response. Include the failures the new design adds, and how the design handles the failure that started the RFC. How to undo the change is a row, with its response. |
| Outcomes | What changes, for whom, and how will we know? | A table: outcome, measure, today's value, target. One row for each outcome. Each outcome follows from a goal. A number the sources measured is a target only when a goal or the owner sets it. Each measure cites its source, or says it is an estimate or a target. No phases, stages, milestones, order of delivery or dates of delivery: implementation planning goes to the tickets. |
| Open questions | What is not known? | Each question with what makes it hard and our proposal when the team has one; with no proposal, the cell is blank, not "None". A table with the columns Question, Our proposal, or a numbered list. `None.` when nothing is open. Every open item in the RFC lives here and nowhere else. No owner and no date. |
| Out of scope | What will a reader expect here that is not? | `### Out of scope` at the end of Problem and goals, so the reader knows the edges before reading the options. Optional. A list of the changes that a reader would otherwise assume this RFC makes, and that someone proposed or asked for, each with the reason it waits. A capability that a draft lists and nobody asked for is not out of scope: cut it, and name it in the reply. |
| Sources | Where does each fact come from? | After the body. A numbered list, one entry for each source the body cites: what it is, where it lives, and its date or period. An internal page, such as a Notion page, a Slack thread or a private draft, gets its title and "internal", never its URL; only an external, public source gets a URL, or `undated` when the source gives none, such as `1. Metrics export, flag service dashboard, last 30 days, pulled monthly`. The body cites an entry as [1] at the claim it backs. See the section on sources below. |

## Options

The decider chooses one option over the others, so the RFC compares them in one place:

1. Every option that someone in the sources proposed and weighed is a row, with a letter. An option the sources only name, with no design, cost or result to compare, is not a row: leave it out, and name it in the reply. Add the strongest option a reviewer would raise when the sources weighed only one, and name it in the reply as supplied by the writer.
2. The columns are the goals, or the attributes the goals turn on, and the last column is the verdict: `Recommended`, `Rejected`, or `Rejected for now` when a named condition would change it.
3. Each cell holds a short fact, not a grade: "No, publish after commit is a dual write", not "Poor".
4. The paragraph for each option states the deciding reason first, then the evidence. A rejected option gets its strongest case before the reason it loses, because a reviewer who favors it will look for that.
5. The recommended option's paragraph says what the team takes on by choosing it.

## Proposed design

Each subsection describes one part of the design as it will be, in the present tense. A reader should be able to object to the mechanism from the subsection alone.

Use the form that fits the content:

| Content | Form |
|---|---|
| Three or more parts with directed relationships | A diagram, as Mermaid in a code fence |
| A schema, a signature, a wire format, a configuration key | A code block; the text says only what the code does not show |
| Three or more items compared on two or more attributes | A table, each cell one claim |
| A sequence | A numbered list |
| Why the choice holds, and what it costs | Sentences |

The mechanism comes from the sources. A part the sources do not describe is an open question, not something to design while writing. What is not decided belongs in Open questions.

State a cost where it arises, plainly enough that the decider could refuse it: "If an event for an invoice keeps failing, later events for that invoice wait behind it for up to 24 hours." Where the cost is a product decision as much as an engineering one, say so, and state it as a cost in the Decision section.

## Sources

Each fact a decision uses can be traced to where it came from, so a reviewer can check it without asking the author.

1. A claim is a sentence, list item or table row that gives a number, or a size or comparison in words: "71% of working hours", "cheaper", "most teams". Each claim cites the entry of `## Sources` that holds it, as [n] at the end of the sentence or in the table cell.
2. An estimate says so and names what it rests on: "about $1,900 a month, the team's estimate for 2 instances". An assumption says so too. A goal, a limit the design sets, and a position the team takes are not claims about the world and cite nothing.
3. One entry for each source, not for each fact. A meeting, a metrics export, a thread, an incident report, a benchmark: what it is, where it lives, and its date or period. A source that gives no date says `undated`; never infer one.
4. A claim with no source in the material is not backed by inventing one. Ask the author for the source, label the claim an estimate when it is one, or cut it. List each in the reply.
5. Names and dates are facts too. One the sources do not give is asked for, not supplied, and the reply lists it.

`check-rfc.mjs` checks the claims in Problem and goals, Options, Cost, Outcomes, and Failure modes and risks: each must cite an entry, or be marked as an estimate, an assumption, a goal or a limit. `--claims` prints every claim it found with what backs it. A claim in the design that rests on a measurement cites it too; the reader critique checks those.

## Word budget

The body holds at most 3,000 words, which is six printed pages. Tables and code count. An RFC with four options and five parts to its design is usually 1,800 to 2,500 words. The Decision section holds at most 250 words. Other sections have no fixed share: give the words to what the decider needs to decide, which is usually the options and the design.

Over the limit: move what an implementer needs and the decider does not, such as full schemas and complete data tables, to an appendix. Then delete a topic nobody would argue about. Do not cut the account of how the system works today, the comparison of options, or the costs to get under it.

## FAQ and appendices

The FAQ is optional and sits after the body. It holds a question a skeptical reader will ask that the body does not need to answer, written as the reader would say it, with the answer in the first sentence. A question the decision turns on belongs in the body.

An appendix holds what an implementer or an auditor needs: full schemas, complete data tables, benchmark records, the history of earlier attempts. The body cites an appendix by its letter once, at the sentence that depends on it.
