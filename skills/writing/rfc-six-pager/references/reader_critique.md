# Reader critique

Read the RFC once from the top, as an engineer on the team who will decide on it, with nothing but the document. Do not read the sources, the conversation, or the author's notes first: a reader in the review meeting has none of them.

## The seven passes

Make each pass over the whole body.

1. Decision. After the Decision section alone, write down what is recommended, by when the decision is needed, and what it costs. Each one that is missing is a finding. After the last body section, write the decision you would make. If it is "I cannot decide", name the one fact that is missing.
2. Scan. Read only the headings and the first sentence of each paragraph, and write each paragraph's point in one line from that sentence alone. A paragraph whose point you cannot write is a finding. Then read each paragraph whole and report, quoting it: each sentence that starts on another part, option or state (what exists today, what is not built, what is undecided) that the sentence before did not set up; each term the project coined that appears with no explanation; and each number that does not say what it counts. A paragraph you had to read twice is an `[M]` finding even when you cannot name why.
3. Mechanism. For each part of the proposed design, try to object as an engineer. Mark each part that does not say what is stored or sent, where, in what form, and what enforces it. Mark each limit or size given as an adjective. Mark where a diagram, a signature, or a table would replace a paragraph.
4. Claims. Read every sentence, list item and table row of the body, and label each claim it makes about the world: `measured` when it cites an entry of Sources that could hold it, `estimate` or `assumption` when it says so and names what it rests on, `unsupported` otherwise. A claim is a number, a size or comparison in words ("most", "faster", "cheaper"), a cause ("because the queue backs up"), or a statement of what someone wants or decided. Check that each cited entry says what it is, where it lives, and when. Report each unsupported claim the decision turns on as `[H]` and the rest as `[M]`, each with the source that would back it, such as "the incident report" or "a load test at 4,100 a second". Check that doing nothing is weighed: what continues if nothing changes, in the units used for the proposal. What continues if nothing changes is enough; a sentence that says the cost is unknown or not measured is a finding to cut. When the RFC does not mention it, report an `[H]` finding named "doing nothing is not weighed". Check the numbers against each other: a target that the document's own figures contradict is an `[H]` finding.
5. Options and costs. Check that the Options section compares every real option on the same goals, and gives each rejected option its strongest case and the reason it loses. Look for the strongest option the RFC leaves out. Mark each cost the design carries that the text does not state where it arises, and each cost to customers or another team that the Decision section does not state. Mark each failure mode that lacks a trigger, an effect, or a response, and each open question that lacks its hard part. Mark each priority, tenet or principle nobody could disagree with, each topic nobody would argue about, each explanation of a term the team knows, each fact stated more than twice, each statement of what is not claimed, each record of how the work was done, and each place where the body sends the reader to another document.
6. Questions. List each question you had while reading that the body does not answer. These are the questions the meeting will spend its time on.
7. Small faults. Before writing the findings, reread the body once more for the faults passes 1 to 6 found least of: a size given as a word, a statement of absence ("not measured", "unknown", "nobody has counted"), a hinted risk, a priority or tenet that settles nothing. Report each one, even when larger findings exist.

## Findings

Report each finding in this shape, most serious first:

```text
[H] Proposed design, Relay, paragraph 2: "polling is cheap" has no number. How many queries a second, against what peak?
[M] Problem and goals, paragraph 1: "212 engineers changed a flag" is unsupported. Cite the metrics export it comes from.
```

- `[H]` blocks a decision: a missing recommendation, a missing or wrong number a decision turns on, a part with no mechanism, an option missing from the comparison, no cost for doing nothing, a contradiction, a question a reviewer would argue about that the body does not answer.
- `[M]` weakens the case: an unsupported claim off the main line, a source with no date, a cost stated far from where it arises, a sentence off its paragraph's point, a first sentence that hides its point.
- `[L]` costs reading time: order, repetition, an explanation of a term the team knows.

Quote the words, say what is wrong, and say what would fix it. When the fix is a fact only the author has, ask for the fact; never supply a number. End with the unanswered questions from pass 6 as a list, each marked with the section where its answer belongs.

A critique with no `[H]` findings says so in its first line.
