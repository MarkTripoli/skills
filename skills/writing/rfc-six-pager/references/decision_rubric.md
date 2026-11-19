# Decision rubric

`check-rfc.mjs --score` counts faults a script can find. This rubric holds the fourteen questions that a reviewing engineer's reading answers. Use it when the checker and the comprehension test pass, before the RFC goes to its readers. Whether the decider gets the facts is not asked here: the comprehension test in `comprehension_test.md` checks that question by question.

## The questions

Each answer is `yes` or `no`, with one sentence quoted exactly from the RFC as evidence. For question 12, quote the clearest sentence of the part that could go. A `yes` whose quote is not in the RFC counts as `no`.

Decision. An RFC that fails any of these four is not ready, whatever else it does well:

1. Does the Decision section alone give the decider, the date, the recommendation, why, and the main cost, and ask for nothing?
2. Does the Options section compare every real option on the same goals, and say why the recommended one wins?
3. Does each rejected option get its strongest case and the reason it loses, and does the RFC state what continues if nothing changes, in the units used for the proposal when a source gives them?
4. Can the decider decide from this document alone, with no second document?

Technical substance:

5. For every part of the proposed design, could an engineer on the team object to the mechanism from its subsection alone: does it say what is stored or sent, where, in what form, and what enforces it?
6. Is each question a reviewer would argue about answered in the body or listed as an open question? Think of where data lives, how it is protected, how identity works, what is supported, what a failure costs, and what it costs to run, as far as each applies.
7. Does every failure mode have its trigger, its effect, and the response?
8. Does every open question name what makes it hard, and the team's proposal where it has one?
9. Can the reader tell a measured fact from an assumption, and does the RFC say what would change the recommendation?
10. Does each claim a decision uses, whether a number, a comparison or a cause, have its unit and period where it has them, and cite an entry of Sources that says what the source is and when, or say that it is an estimate and what it rests on?
11. Do the numbers agree with each other?

Economy. Here `yes` is the fault:

12. Does a section or several paragraphs cover a topic that nobody in the review would argue about or ask about?

Context:

13. Does the RFC explain how the affected part of the system works today, and state each cost where it arises, so that a reader who was not in the investigation can follow the change?

Readability. Here `yes` is the fault:

14. Is there a paragraph a reader must read twice: its point is not in its first sentence, a sentence starts on a new subject that the one before did not set up, a term the project coined appears with no explanation, or a number does not say what it counts? Quote the paragraph's first sentence.

## How to judge

1. Give a fresh child worker only the working copy and these questions. The worker has not seen the drafting or the sources. Use a different model from the one that wrote the RFC when the runtime offers one: a model rates its own style too high.
2. Run three workers. Each worker replies with only this JSON, one entry for each question:

```json
{"answers": [
  {"question": 1, "answer": "yes", "quote": "<one sentence copied exactly from the text>"},
  {"question": 2, "answer": "no", "quote": "", "fix": "<what to write or cut, and where>", "needs": "<a fact only the author has, or empty>"}
]}
```

   When an answer means the question fails, the worker adds `fix`: one sentence that names the place and says what to write there or what to cut. When the fix needs a fact that is not in the text, such as a name, a date, or a measurement, the worker puts that fact in `needs` and does not invent it.

3. Save each reply to its own file outside the repository, then run the checker with them:

   ```sh
   node <skill-dir>/scripts/check-rfc.mjs <working copy> --judge <votes-1.json> <votes-2.json> <votes-3.json>
   ```

   It checks each quote against the working copy, takes the answer that most workers gave, and prints `combined: <n>/100 (script <n>, judged <n>)`, a `not ready` line when a must-pass question failed, and each failed question and each quote it could not find. Then it lists the fixes in the order to make them: must-pass questions first, then the largest gain. Each fix shows the points it adds to the combined score, what the workers proposed, and any fact it needs from the author. The last number in that heading is the score with every fix made. Add `--template <path>` for a team template.
4. Sort the fixes. A fix that needs no new fact is yours to make. A fix with a `needs from the author` line waits: give the user those fixes as choices, each with its gain and the fact it needs, and do not invent the fact. When the user supplies facts, make those fixes and run the workers again.
5. Without child workers, reread the working copy from the top, answer the questions yourself into one votes file, and run the same command with it. Report that the writer judged its own text.

## Scoring key

The checker reads this block. Change it together with the questions.

```text
questions: 14
yes is the fault: 12 14
must pass: 1 2 3 4
n/a allowed: no
```

The judged score is the share of the fourteen questions that pass. The combined score is 0.6 of the script score plus 0.4 of the judged score. When any of questions 1 to 4 fails, the second line of the output is `not ready: must-pass questions <numbers> failed`. That verdict stands beside the number and does not lower it, so two versions can still be ranked. Report the script score, the judged score, the combined score, the verdict, and each failed question.

## Limits

The weights and the choice of the four must-pass questions are judgment calls. No published rubric exists for this format, and these numbers have not been compared with RFCs that people ranked. Use the score to compare two versions of one RFC and to find its weakest part. A high score does not show that the proposal is right.

Fix what a failed question names: write the missing mechanism, find the trigger of the failure, cut the topic nobody would argue about. Do not rewrite sentences to move the number. Stop after three rewrite rounds for the score, and report the questions that still fail.
