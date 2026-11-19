# Condense several documents into one RFC

Use this when the material is larger than six pages: an RFC with a technical reference, research pages, a spike report, meeting preparation, or any set of documents about one decision. The result is one RFC. A fact the decision needs lives in its body, and no reader has to open a second document to decide.

Six pages is a limit, not a target. Reaching it from a large pile means choosing whole topics to keep and to drop; trimming sentences is not enough, and cutting what the decider needs is worse than going long. Follow the steps in order.

## 1. Build the ledger

Read every document completely. Write a ledger with one row for each topic, not each section:

```text
Topic | Where it appears | Words | Disposition | Reason
Where data is stored | reference "Storage" | 400 | Proposed design | the decision turns on it; missing from the RFC
Session timeout rule | RFC 5, reference x2, prep sheet x2 | 310 | body, once | stated five times
CI job names | reference "Checks" | 120 | cut | nobody decides on these
```

A topic that appears in three documents is one row. The ledger is working state: keep it out of the RFC and give its cut and appendix rows to the user in the reply.

## 2. Name what the decision turns on

Write the recommendation, the options it chooses between, and the parts of the design a reviewer would argue about. Test each part: if the answer changed, would the design change? The options and those parts get most of the body. Look for their answers in the supporting documents first. The most common fault in a document set is that the summary document holds the recommendation and a side document holds the mechanism. The mechanism belongs in Proposed design.

Check the recommendation itself. It names one specific choice that is still open. Do not present something already decided as a choice, and do not write "direction" where a specific choice is needed.

## 3. Give every topic a disposition

Take the first that applies:

1. The same fact appears elsewhere in the ledger: merge the rows. It is stated once, where it is used.
2. It records how the evidence was gathered (revision numbers, who checked what, what was not rerun, job names, tool versions): cut, or one appendix when a reader may audit it. The body states the result.
3. It is how the system works today, or a number about the problem: Problem and goals.
4. It is an option or the reason one loses: Options.
5. It belongs to a part from step 2: that part's subsection of Proposed design, with its mechanism and its cost.
6. Nobody asked for it and the decision does not change with it: cut. This holds for an exclusion too: a capability the draft rules out, such as a device or a platform, that no source shows anyone requesting is cut, not moved to Out of scope.
7. It is a change that someone in the sources proposed or asked for, that a reader may expect, and that this RFC does not make: one line in Out of scope, with the reason it waits.
8. A skeptical reader will ask it, and no decision needs it: FAQ.
9. It is detail that an implementer or auditor needs: appendix.
10. It is implementation planning (phases, a work list, an effort estimate in people or weeks): out of the RFC, to the tickets.
11. It is preparation for the meeting (a script, talking points, how to handle objections): out of the RFC. Any fact it holds that the RFC lacks goes through this list as its own row.
12. Otherwise: cut.

## 4. Budget, then write new text

Set a word budget for each section from the outline before writing, giving most of it to Options and Proposed design. Then write the body as new text from the ledger. Do not paste the old sections and trim them: old structure carries old padding with it.

## 5. Cut in passes

When the body is over its budget, cut in this order and count the words after each pass with `check-rfc.mjs`:

1. Repeated claims and repeated caveats. Keep the one at the point of use.
2. Statements of what is not claimed. Keep a real limit, once, as a cost accepted or an open question.
3. Narration of the investigation. Keep the result.
4. Lists of everything. Keep the items the decision turns on.
5. Options with no choice. Choose, and state the price.
6. Explanations of terms that a reader in the room already has. Keep the account of how the affected part works today.
7. Paragraphs that walk through parts or compare options. Draw the diagram or write the table.

Stop cutting words inside sentences when the sentences start to lose their verbs, or the words that say what follows from a number. Cut a whole topic.

## 6. Retire the supporting documents

List each source document with what happened to it: absorbed into the body, kept as Appendix A, or no longer needed. The author decides whether to archive a document; do not delete or edit the sources. Leave at most the appendices of the RFC itself as further reading. The body and the FAQ never name a source document or say that an answer is in one: they state the fact, and cite an appendix by its letter when a reader may want the detail. When a source gives a number without its period or its source, leave the number out, or keep it without a period only when the decision needs it, and list it in the reply, without naming the document.

## 7. Report the cuts

The reply lists what was cut and why, in a few lines per kind, so that the author can restore a topic they need. It names each source document with its disposition from step 6. Include the body word count against the limit, each part from step 2 that the documents could not settle, and each position or rejected option that the writer supplied.
