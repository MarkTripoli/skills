---
name: rfc-six-pager
description: Writes, revises, condenses, critiques and runs the review of a technical RFC as a six-pager for engineers, a checked Markdown file that opens with the recommendation, compares the options in one table, shows how each part of the design works and what it costs, and cites a source for each claim. Use when the user runs /rfc-six-pager or asks to write, draft, convert, shorten or critique an RFC, a six-pager or 6-pager, or to prepare or record an RFC review meeting; not for the delivery workflow's technical design (use /create-tdd) or a brief for builders (use /product-brief).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# RFC six-pager

A technical RFC gives one named person, the decider, what they need to decide on a design. Engineers who know the stack read it in silence at the start of the review meeting, so it stands alone, in the fewest words the decision allows.

The body has eight sections, then the numbered Sources it cites, then an optional FAQ and appendices. Load each file at the step that names it:

- [references/rfc_template.md](references/rfc_template.md): the base template.
- [references/rfc_outline.md](references/rfc_outline.md): what each section answers, the word budget, and how a team extends the template.
- [references/writing_rules.md](references/writing_rules.md): the writing rules, with a before and after.
- [references/condense.md](references/condense.md): cutting several documents down to one RFC.
- [references/comprehension_test.md](references/comprehension_test.md): fresh readers answer the decider's questions from the RFC alone.
- [references/decision_rubric.md](references/decision_rubric.md): fourteen questions a reviewing engineer answers, and the score.

`<skill-dir>` is the directory holding this SKILL.md. The working copy is the Markdown file this skill checks.

Required: the technical-writing skill, installed beside this one at `<skill-dir>/../technical-writing/`. It owns sentences and words, and `check-rfc.mjs` loads its word list and scorer; when it is missing the checker exits 2 and says to install it. Optional: the show-me skill for diagrams; when it is missing, say so once and continue.

## Pick the job

- No RFC exists: [Draft](#draft).
- An RFC, a design document or several documents exist, and the user asks to convert, shorten, condense or apply feedback: [Revise](#revise).
- The user asks to tighten it, or say it in fewer words: [Tighten](references/tighten.md).
- The user asks for a review, a critique, or what a reader will ask: [Critique](#critique). Change nothing.
- The user asks to prepare, run or record the review meeting: [Conduct the review](#conduct-the-review).
- Two jobs: in this order.

In every job:

1. Invent no fact. A number, date, owner, source or mechanism that the sources do not give is asked for, goes to Open questions when the decision needs it, or is left out and listed in the reply. No sentence says a fact is missing. A position, rejected option or default the format needs may be supplied, and the reply lists it as supplied by the writer.
2. A later decision by the decider replaces an earlier proposal. Write the current state, not the history.
3. Edit and check the working copy, then update the hosted document from it.

## Draft

```
Draft progress:
- [ ] 1. Sources read; questions written
- [ ] 2. Decision section written
- [ ] 3. Options compared
- [ ] 4. Body drafted
- [ ] 5. check-rfc.mjs passes; score 90 or more; no dead links
- [ ] 6. Comprehension test passes
- [ ] 7. Critique has no [H] findings
- [ ] 8. Tighten loop stopped
- [ ] 9. Rubric answered
- [ ] 10. Published and reported
```

1. Gather. Read every source. Note the recommendation, author, decider, date, each number with its source and period, each option, each decision made, and each missing fact. Ask the user one round of questions, each with a recommended answer. When told to ask nothing, leave the placeholder; report it. Then read [references/comprehension_test.md](references/comprehension_test.md) and write `questions.json` outside the repository: 10 to 15 questions the decider would ask, each with the facts a right answer holds.
2. Write the Decision section: what the team will do, why in a sentence, and the main cost, in two or three sentences and at most 250 words. Ask for nothing. A promise to customers or a cost another team pays is stated as a cost. If a part cannot be written, return to step 1.
3. Compare the options the sources weighed, adding the strongest one a reviewer would raise when they weighed only one, in one table on the goals. When it does not favor the recommendation, tell the user before drafting.
4. Draft. Read technical-writing, [references/rfc_outline.md](references/rfc_outline.md) and [references/writing_rules.md](references/writing_rules.md). Copy the template, or the user's team template, and fill it from the outline. The body holds at most 3,000 words, mostly on the options and design. Cite each claim as [n] with its entry in `## Sources`, dated or `undated`, or label it an estimate and say what it rests on. Draw a diagram with show-me when three or more parts pass data.
5. Check. Run `node <skill-dir>/scripts/check-rfc.mjs <working copy>` (add `--template <path>` for a team template), fix the first problem until it passes. Fix the sentence; label a claim no source holds an estimate only if it is one, otherwise cut it or ask the author. `--claims` lists every claim with what backs it. Then run `--score`: under 90, rewrite the sentences behind the largest cost, for at most three rounds. Do not change words only to raise the score; a placeholder left in step 1 holds it at 70. Run `node <skill-dir>/scripts/check-links.mjs <working copy>`; replace dead links; open sign-in links yourself.
6. Test comprehension. Follow "Run the test" in the comprehension reference with two fresh readers and `node <skill-dir>/scripts/comprehension.mjs <working copy> --questions <questions.json> --answers <answers files>`. Add each fact the RFC lacks, make each missed fact easier to find, rerun step 5, and retest, for at most three rounds.
7. Critique. Give a fresh child worker only the working copy and [references/reader_critique.md](references/reader_critique.md); without child workers, reread from the top and critique it yourself. Fix each `[H]` finding, rerun step 5, and repeat until none remain.
8. Tighten. Follow [references/tighten.md](references/tighten.md) until it prints `stop`.
9. Judge. Follow "How to judge" in [references/decision_rubric.md](references/decision_rubric.md), which ends with `check-rfc.mjs <working copy> --judge <votes files>`. Fix what each failed question names, rerun step 5, and judge again, for at most three rounds. A failed question among the first four means the RFC is not ready.
10. [Publish](#publish), then report: the link or path, the recommendation, the body word count and each tighten round, the comprehension result, the script, judged and combined scores, each failed rubric question, each claim cut or left as an estimate, each item supplied by the writer, and the `[M]` findings left open.

## Revise

1. Read the whole document and the feedback. Save a hosted document as the working copy.
2. List every number, date, name, decision, constraint and commitment it holds. The revision must not lose them.
3. Pick the branch:
   - Several documents, or over 3,000 words: write the comprehension questions from the documents, then follow [references/condense.md](references/condense.md).
   - Not in the format, or machine-written: write the comprehension questions, start a new working copy from the template, do Draft steps 2 and 3, and place each fact in the section whose question it answers. The table of signs in the writing rules shows what to fix. Write what is missing, usually the options compared, how things work today, and the cost of each choice. A claim with no number in the source gets none.
   - In the format, with feedback: apply each item or say why not, a change to a goal or a decision first.
4. Run Draft steps 5 to 9.
5. Check each fact from step 2 is in the body, an appendix or the FAQ, or is reported as removed with the reason.
6. Publish, then report each score as `<n>/100`, before and after, what changed by section, what moved or was removed, what the writer supplied, and each fact needed from the author.

## Critique

Read [references/reader_critique.md](references/reader_critique.md) and the writing rules, follow the critique, and run `check-rfc.mjs <working copy> --score`. Put the score on the first line, and report each problem it prints as its own finding, quoting the words it names. When the user asks whether readers get what they need, run the comprehension test; when asked to be one reader, do only "The reader's task" in it. When asked for a score, also follow the rubric and report the three scores, the `not ready` line and the fixes with their gains. Reply with findings, most serious first, then the unanswered questions.

## Conduct the review

Read [references/review_meeting.md](references/review_meeting.md) and follow the part the user is at: before the meeting, confirm the RFC is ready, write the invitation and agenda, and set `Status: In review`; after it, sort each comment, change only what the comments require, and write the review record with the decision, its owner and dated actions.

## Publish

Save the working copy at the path the user names, or as `rfc-<slug>.md` in the current directory (kebab-case slug). Commit it only when asked.

Publish a hosted document only when the user asks or the RFC already has one, with the tools of the document server the runtime registered, as `<docs>`:

- The user names a host the runtime lists: create or update the document there, visible only to the user. Link each [n] to its Sources entry, or, where the host cannot link within a page, to its URL: `node <skill-dir>/scripts/link-citations.mjs <working copy>`.
- No host named: use the one server listed; with several, ask.
- No server for the host: say so and give the working copy path.

Share, invite reviewers, comment, or set `Status` to an outcome only on the user's say-so.

## Hand off

When the user asks what comes next: `/create-tdd` for a technical design of an accepted RFC, the jira-issue-hierarchy skill for Epics and Stories when the team uses Jira, `/product-brief` for a brief builders work from, `/explain` once the change shipped, `/show-me` to draw one part.
