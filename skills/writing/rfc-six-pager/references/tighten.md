# Tighten an RFC

A draft that passes the checker can still say each thing in twice the words it needs, or say things nobody decides on. Tightening is a loop: a fresh reader marks what to cut and what to say shorter, the writer applies it, and the loop repeats until a round finds nothing. Commands below run from `<skill-dir>`.

## The round

1. List the blocks: `node <skill-dir>/scripts/tighten.mjs <working copy> --list > blocks.json`, outside the repository. Each block is a paragraph, a list item or a table of the body, with an id such as `P7`.
2. Give a fresh child worker only the working copy, `blocks.json` and the section "The reader's task" below. Use a new worker each round, so that it reads the current text cold. Without child workers, do the task yourself from `blocks.json` alone, one block at a time.
3. Check the findings: `node <skill-dir>/scripts/tighten.mjs <working copy> --check <findings.json>`. For each problem, either restore the number or citation in the rewrite, or confirm the fact is not needed and add it to that finding's `drops`. Then check again until it reports no problems.
4. Apply each finding. A finding you reject gets a one-line reason in the reply: it would remove a cost, a reason, a failure response, the hard part of an open question, or a fact a comprehension question needs.
5. Run `check-rfc.mjs` and `check-links.mjs`; both pass before the round ends.
6. Log the round: `node <skill-dir>/scripts/tighten.mjs <working copy> --record <findings.json>`. It prints `continue` or `stop: <reason>`. Leave `tighten-log.json` beside the working copy: it is the record of the rounds. On `continue`, start the next round at step 1.

The loop stops when a round finds nothing, or when two rounds in a row each cut under 2% of the body. Report each round's body words and findings, and the stop reason.

## The reader's task

Read the whole RFC once. Then, for each block in `blocks.json`, ask three questions in order:

1. **Would the decider or a reviewer lose anything they need if this block were gone?** If not, the verdict is `cut`. Cut a block that:
   - repeats a fact already stated where it is used;
   - tells how the idea came up, who suggested it, or how the work was done;
   - explains a term these readers already know;
   - states what is not known, not claimed or not measured;
   - gives a fix copied from a risk register without what goes wrong without it;
   - covers a topic nobody would argue about.
2. **Can it say the same facts in fewer words?** If so, the verdict is `shorter`, with the rewrite. Shorten by:
   - one sentence for a simple point and its reasons, not one sentence for each item;
   - the product's name and what happens to it, not the platform's terms;
   - the claim first, then only the support a reviewer would check;
   - merging two blocks that say one thing, keeping the first and cutting the second.
3. **Would an engineer outside the team understand it on the first reading?** If it names a platform mechanism instead of what happens to the product, the verdict is `plain`, with a rewrite that says what the product does and why. Keep a platform term only where a reviewer needs it, after the effect. "The worker takes an advisory lock and drains the outbox through a CDC tail" becomes "Only one worker sends queued emails at a time, and it reads each new email as the database records it." A `plain` rewrite may be longer.

Keep every number, citation, name and date the decision needs; the check lists each one a rewrite drops. Keep the reason in each "because": the reason is what a reviewer argues with. Do not cut or shorten away a rejected option's strongest case, a cost, a failure's response that says what it does, an open question's hard part, what continues if nothing changes, the evidence for a goal (such as "the native code moved unchanged" for a goal that mobile stays unchanged), the line that introduces a diagram, or a sentence the author asked to keep word for word. A response that names a fix without its effect, such as "the team adds monitoring", gets `plain`: say what the fix does, from the sources, or cut it and name what is missing in `why`. Leave a block alone when no question applies; most blocks of a good draft need nothing.

Write the findings as a JSON array, one object for each block that needs a change:

```json
[
  { "id": "P7", "verdict": "cut", "why": "Restates the cost from the Decision section." },
  { "id": "P9", "verdict": "plain", "why": "Names the mechanism, not what happens.", "rewrite": "Only one worker sends queued emails at a time." },
  { "id": "P12", "verdict": "shorter", "why": "Three sentences make one point.", "rewrite": "The app does not work in private windows: two browsers give them no file storage [4, 5], and the third deletes their data when they close [6]." }
]
```

An empty array means the round found nothing.
