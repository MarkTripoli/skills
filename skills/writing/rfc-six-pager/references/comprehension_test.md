# Comprehension test

An RFC is good when its decider, reading it once, knows what to decide, why, and what it costs. This test asks that directly. Questions a decider would ask are written from the sources before the RFC exists. Fresh readers answer them from the RFC alone, and a script checks each answer against the facts it must hold.

The test does not reward a short RFC or a long one. It fails an RFC that leaves out what the decider needs, and one that states it so that readers come away with the wrong answer.

## Contents

- Write the questions
- Run the test
- The reader's task
- Limits

## Write the questions

Write `questions.json` in Draft step 1, from the sources, before any section of the RFC is written. Do not change a question after drafting starts, except to add one for a fact the user supplies later. A question written after the draft tests the draft against itself.

Write 10 to 15 questions, each one that the decider or a reviewer would ask in the meeting. Cover each of these that the sources can answer:

1. What does the team recommend, and by when is the decision needed?
2. Which option is recommended?
3. What does the recommended option cost, or what does the team accept for it?
4. For each rejected option: why does it lose?
5. What goes wrong today, with its number?
6. What does doing nothing cost?
7. How does the key part of the design work, with its limit as a number?
8. What happens when the failure that started the RFC happens again?
9. What is the response when the design fails, and how is the change undone?
10. What outcomes does the team expect, and how will it know?
11. What is still open, and who finds out?

For each question, `expect` lists the facts a right answer holds, as case-insensitive regular expressions, all of which must match. Use the facts that cannot be paraphrased: a number, a name, a date, a product, a limit. Give the spellings a reader might use as alternatives in one pattern:

```json
{"questions": [
  {"id": 1, "ask": "What does the team recommend, and by when is the decision needed?", "expect": ["outbox", "Dec(ember)?\\.? 4|2026-12-04|12/4"]},
  {"id": 2, "ask": "Why is publishing to Kafka after commit rejected?", "expect": ["dual write|between (the )?commit and (the )?publish"]}
]}
```

A question whose answer is a judgment, such as "is the design sound?", has no pattern and does not belong here: the reader critique asks it.

## Run the test

1. Write the readers' sheet, and see which facts the RFC does not state at all:

   ```sh
   node <skill-dir>/scripts/comprehension.mjs <working copy> --questions <questions.json> --sheet <sheet.txt>
   ```

   Each `does not state` line is a fact the decider needs that the RFC leaves out. Write it in where the reader needs it, then run this again.
2. Start two fresh child workers, on two different models when the runtime offers them. Give each only the working copy, the sheet, and the text of "The reader's task" below. Neither has seen the sources, the questions file, or the drafting.
3. Save each reply to its own file outside the repository, then count them:

   ```sh
   node <skill-dir>/scripts/comprehension.mjs <working copy> --questions <questions.json> --answers <answers-1.json> <answers-2.json>
   ```

   The first line is `comprehension: pass` or `comprehension: fail`. A question counts as answered right when more than half of the readers' answers hold all its facts: with two readers, both. The test passes at 90%.
4. Fix in the order printed. A fact the RFC does not state is written in. A fact the RFC states but readers missed is made easier to find: move it to the section whose question it answers, open the paragraph with it, or say what follows from it. Do not repeat it in a second place.
5. Run `check-rfc.mjs` again, then test again with new readers. Stop after three rounds and report the share answered right and each question still missed.
6. Without child workers, run step 1 only, and report that no reader answered the questions.

## The reader's task

You are a senior engineer who must approve or reject the design in this RFC. You know the stack. You were not part of the work.

Read the RFC once, from the top. Then answer each question on the sheet from the RFC alone, in at most 30 words. Copy numbers, names and dates as the RFC writes them. When the RFC does not answer a question, write `not in the RFC`. Do not guess and do not use what you know from elsewhere.

Write only a JSON file of this shape, with an entry for every question:

```json
{"answers": [{"id": 1, "answer": "<at most 30 words, or not in the RFC>"}]}
```

## Limits

The questions decide what the test measures. A writer who leaves out a question about a cost the RFC hides will pass an RFC that hides it, which is why the questions come from the sources and before the draft. Patterns miss a right answer phrased in a way the writer did not foresee; read the answers listed under a missed question before rewriting. Model readers keep the whole RFC in view, so the test finds missing and misleading facts more reliably than facts that are only hard to find. The 90% limit is a first setting: it allows one miss in ten questions.
