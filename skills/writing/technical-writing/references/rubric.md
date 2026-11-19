# Reader rubric

`scripts/score-prose.mjs` counts faults a script can find. It cannot tell whether the text answers its reader. This rubric holds the questions a reader answers. Use it after the script score is high, on a text that matters: a document, a report, a handoff, a prompt.

## The questions

Each answer is `yes`, `no`, or `n/a`, with one sentence quoted exactly from the text as evidence. A `yes` with no quote that appears in the text counts as `no`. Answer `n/a` only where the text has nothing of that kind, such as question 9 for a text with no procedure.

Reader:

1. Do the first two sentences give the reader what they came for: the answer, the result, or the request?
2. Do the first sentences of the paragraphs, read alone, carry the argument?
3. Is every specialist term explained where it first appears, and does each thing keep one name?

Substance:

4. Does each number the reader will use have its unit, its period, and its source?
5. Do the numbers agree with each other?
6. Does each statement about behavior say when it holds: the condition, the scope, the version?
7. Can the reader tell a measured fact from an assumption and from the writer's judgment?
8. Does each rule or abstraction that the reader must apply come with one concrete example?

Action:

9. Is each procedure a numbered sequence, with one action in a step and the exact command or control named?
10. Are identifiers, commands, paths, and error messages exact and in code formatting?
11. Do "must", "should", and "may" each keep one strength through the text?
12. Does the reader know what to do next, or who does what by when?

Economy. Here `yes` is the fault:

13. Could a tenth or more of the text be deleted with no loss to the reader's question? One spare sentence is not a tenth.
14. Is any fact or caveat stated three times or more? A summary that states a result once more does not count.
15. Does a whole section, or several paragraphs, cover a topic that this reader would not ask about? A clause that explains a term is not a topic.

## How to judge

1. Give a fresh child worker only the text, the name of its reader, and the questions. The worker has not seen the drafting. Use a different model from the one that wrote the text when the runtime offers one: a model rates its own style too high.
2. Run three workers. Each worker replies with only this JSON, one entry for each question:

```json
{"answers": [
  {"question": 1, "answer": "yes", "quote": "<one sentence copied exactly from the text>"},
  {"question": 2, "answer": "no", "quote": "", "fix": "<what to write or cut, and where>", "needs": "<a fact only the author has, or empty>"}
]}
```

   When an answer means the question fails, the worker adds `fix`: one sentence that names the place and says what to write there or what to cut. When the fix needs a fact that is not in the text, such as a name, a date, or a measurement, the worker puts that fact in `needs` and does not invent it.

3. Save each reply to its own file outside the repository, then run the tally:

   ```sh
   node <skill-dir>/scripts/judge-tally.mjs <file> <votes-1.json> <votes-2.json> <votes-3.json>
   ```

   It checks each quote against the text, takes the answer that most workers gave, and prints `combined: <n>/100 (script <n>, judged <n>)` with each failed question and each quote it could not find. Then it lists the fixes in the order to make them. Each fix shows the points it adds to the combined score, what the workers proposed, and any fact it needs from the author. The last number in that heading is the score with every fix made.
4. Give the user that list as choices when the text is theirs: each fix with its gain and what it needs. Make the fixes the user picks. A fix that needs a fact waits for the user to supply it; with the fact, run the workers again for a more exact fix.
5. Without child workers, reread the text from the top, answer the questions yourself into one votes file, and run the tally with it. Report that the writer judged its own text.

## Scoring key

The tally reads this block. Change it together with the questions.

```text
questions: 15
yes is the fault: 13 14 15
must pass:
n/a allowed: yes
```

The judged score is the share of the questions that pass, out of those not answered `n/a`. The combined score is 0.6 of the script score plus 0.4 of the judged score. Report the three numbers and each failed question. Do not report the combined number alone.

## Limits

The weights are judgment calls. No published scale exists for technical prose, and these numbers have not been compared with rankings by people. Use the score to compare two versions of one text and to find the weakest part. Do not use it to compare writers, and do not treat 90 as proof of a good text: a text can score high and still be wrong.

Rewrite the sentence that a finding names. Do not swap a listed word for a synonym or split a sentence to move the number: the fault stays and the score stops measuring it. Stop after three rewrite rounds for the score, and report what is left.
