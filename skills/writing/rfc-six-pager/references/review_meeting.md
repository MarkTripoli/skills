# Review meeting

The meeting exists to reach the decision the Decision section recommends. People read the RFC in the room, in silence, then discuss it. Nobody presents.

## Before the meeting

1. Confirm the RFC is ready: `check-rfc.mjs` passes and a reader critique has no `[H]` findings. An RFC that is not ready wastes the room; tell the author what blocks it.
2. Write the invitation for the author to send. It names the decision, the decider, the date, and the RFC link, and says that reading happens in the meeting. Invite the decider, the people who must carry out the decision, and the people who can say it is wrong. Leave out people who only need the outcome; they get the review record.
3. Name a note-taker who is not the author.
4. Print this agenda in the invitation, for a 60-minute slot:

| Minutes | What happens |
|---|---|
| 0 to 20 | Silent reading. Everyone reads the body and writes questions on the document. |
| 20 to 30 | Clarification, not debate. Questions of fact only. |
| 30 to 55 | Discussion of the recommendation, the alternatives, the risks, and the trade-offs, in the order below. |
| 55 to 60 | The decider states the decision. The note-taker reads back the decision, the open questions, the owners, and the dates. |

A facilitator who wants a preparation sheet gets one page: this agenda, the names, and the recommendation from the Decision section. It holds no fact about the proposal. An answer to a likely question goes into the FAQ of the RFC, so that every reader has it. If preparing the sheet turns up a fact the RFC lacks, the RFC is not ready.

## During the discussion

- Take the comments in this order: anything that changes the decision, then the options, then the design part by part. Skip wording comments; the author fixes those from the document afterward.
- The most senior person speaks last, so that their view does not set everyone else's.
- The author answers questions of fact and does not defend the proposal. An answer that takes more than a minute becomes an action item.
- When the discussion overturns a choice, change the Decision section and the Options verdicts first, then see which parts of the design depend on it.

## After the meeting

Collect every comment: when a hosted document exists, read its comment threads with the `<docs>` tools. Add the notes the note-taker or the user gives. Sort each one:

- Answered by the text as it stands: reply with the section that answers it. If two or more readers asked it, the text was not clear; fix the text.
- A fact or objection the body needs: change the body, and keep the body within the word limit.
- A fair question no decision needs: add it to the FAQ with its answer.
- Not yet answerable: add the question to Open questions, with what makes it hard and no owner or date. Who finds the answer, and by when, is an action item in the review record. An action item, such as updating a guide, is never an open question.
- Rejected: say why in the reply, in one sentence.

Change only what a comment or a decision requires. A defect that nobody raised in the meeting, such as a design part with no mechanism or a checker problem, is reported in the reply and left for the author. A wording comment with no location is reported the same way.

Then write the review record at the end of the RFC and set `Status`. The record holds the four blocks below and nothing else. How each comment was sorted goes in the reply:

```markdown
## Review record

### March 12, 2027

Present: Ines (decider), Kofi (author), Mara, Jun. Notes: Mara.

Outcome: Accepted with changes.

Decisions:
1. Adopt the managed remote build cache for all pipelines. Ines.
2. Keep one uncached pipeline a night as the control. Ines.

Changes agreed:
1. Add the cache-miss fallback to Proposed design. Kofi, by March 19, 2027.

Action items:
1. Measure cache hit rate on the mobile pipelines. Jun, by March 26, 2027.
```

After the review record is written, draft a summary of at most half a page for the user to post: the decision, who made it, the changes agreed, and each action item with its owner and date. Do not post it.

Outcome is one of Accepted, Accepted with changes, Rejected, or Another review, and `Status` follows it; Another review keeps `Status: In review`. Each decision names who made it. Each change and action item names one owner and a date. A second meeting adds a second dated entry below the first and never rewrites it.

Reply to comment threads, resolve them, or change `Status` on the hosted document only after the user confirms the outcome. Record only decisions that the user or the meeting notes state; never infer approval from silence or from a comment that agrees.
