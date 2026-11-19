# Report shapes

Starting points for the documents an agent writes most often. Each shape names the reader, the question they hold, what the opening answers, the order of what follows, and what belongs in a linked record.

## Contents

- Choose a structure by reader use
- How to use a shape
- Handoff, verification report, review, feasibility study, cost summary, status update
- Behavior explanation, ticket, ticket comment, request to colleagues
- A worked opening
- Separate the current answer from its history
- Translate engineering detail for another reader
- Keep a request distinct from a specification
- Summarize without concealing evidence

## Choose a structure by reader use

Use these starting points only for a new document without a required template. They apply the collection writing guide to common reader tasks. Do not add empty sections to match an outline.

| Reader's task | Start with | Supporting material | End with |
|---|---|---|---|
| Decide whether to proceed | Recommendation and deciding constraint | Evidence, alternatives, costs, and consequences | The decision still needed and its owner |
| Resume someone else's work | Completed outcome and present state | Relevant decisions, remaining work, and locations of inputs | One executable next action or exact blocker |
| Trust a verification result | Result and the tested boundary | Requirement-to-observation mapping and reproducible receipts | Untested boundaries and how to obtain missing proof |
| Repair a defect found in review | User-visible failure and location | Trigger, evidence, and affected behavior | Required correction, distinct from optional polish |
| Understand a behavior | A concrete situation and its observable result | States or causes in the order they occur | The conditions where the explanation does not apply |
| Carry out a procedure | Goal, target, and prerequisites | Ordered actions, warnings, and observable outcomes | Success condition and supported recovery path |
| Pick up a ticket | Required outcome for the affected person | Acceptance criteria and scope boundary | Unresolved dependency or decision, if any |
| Answer a request | The requested outcome and why it matters | Inputs, constraints, and the requested recipient's part | Where the recipient should return the answer |

## How to use a shape

- When the deliverable matches a shape, use it. Name the shape in one line under the title only when the next reader benefits, for example `Shape: handoff`.
- A template that another skill owns wins over these shapes, such as a product brief or a PR description template. A ticket template another skill owns keeps its structure, and its words follow the Ticket or Ticket comment shape.
- When nothing fits, choose a structure yourself. Name the reader, open with the answer to their question, state each limit once, and keep receipts in a linked record.
- Most shapes end the same way: shared limits once, then a linked record for logs, hashes, and file lists.
- Headings carry the claim, not the topic. "Ten signups produced ten emails", not "Results".

## Handoff

- Reader: the owner who decides what happens next, and the next agent who picks the work up.
- Question: what is done, what do I have to decide, and what is still open?
- Opening: three sentences at most. What was built, the state it is in (committed, reviewed, pushed, merged), and the one thing the reader must decide.
- Order: decisions for the owner, then what was proved with one line per result, then limits, then where everything lives.
- Linked record: the evidence index, the review record, the cost record, the cleanup record, every file name and hash.
- The handoff is rewritten at the end. It is not the last entry of a log.

## Verification report

- Reader: a reviewer or an owner who has to trust the work without rerunning it.
- Question: does the change do what the plan said, and how do I know?
- Opening: the grade (passed, failed, blocked) and the one finding that most affects that grade.
- Order: a table of requirement, result, and one receipt per row, then the failures with cause and fix, then what was not tested, then how to rerun.
- Linked record: logs, screenshots, captured output, command transcripts. A row names one receipt. It does not quote it.
- Keep a failed attempt visible as one line in the failures section, not as a paragraph beside each result it later passed.

## Review

- Reader: the author, then whoever merges.
- Question: can this merge, and if not, what has to change?
- Opening: the verdict (approve, changes needed, blocked) and the count of findings by severity.
- Order: blocking findings, each with the location, what goes wrong, and the fix, then required findings, then suggestions, then what was checked and how.
- Linked record: the diff range, the hashes, the commands run.
- A finding is a defect the author can locate and act on. A note that something was inspected and found fine goes in the "what was checked" section, in one line.

## Feasibility study

- Reader: the owner choosing whether to start the work.
- Question: can we do this, how, and what would it cost?
- Opening: the recommendation in one sentence, with the deciding constraint.
- Order: what was verified and how (source, documentation, device), the options with their cost and their risk, the recommendation again with its reason, then the next narrow step.
- Linked record: the commands run, the sources read, the exact spans inspected.
- Say "verified in source" or "inferred" at each claim where the difference matters. Say it once per claim, not once per sentence.

## Cost summary

- Reader: the owner managing the budget.
- Question: what did this cost, against what target, and what should change next time?
- Opening: the total, the target, and whether the run stayed under it.
- Order: what the evidence suggests for next time, then one table by the dimension the reader controls (stage, usually), then method in three lines, then what the figure excludes.
- Linked record: the usage export, the per-request ledger, the alternative views by model or by thread.
- Dollars to cents. One table in the body. A figure described as an estimate once, in the opening, not after every number.

## Status update

- Reader: the owner or the team, skimming.
- Question: where does each stream stand, and what needs me?
- Opening: a TL;DR grouped by workstream, not a flat list in priority order. A marker and a legend per item: done, in progress, next, blocked, needs a decision.
- Order: one group per workstream with a one-line summary at its end, then decisions needed, then risks.
- Every pull request number and ticket key carries a short title beside it. Nobody should have to click to learn what #1893 is.
- Every line was re-checked at the moment of writing. A status line is never carried forward from an earlier update.

## Behavior explanation

- Reader: anyone who has to understand what the system does, including people who do not read code.
- Question: what happens, and why?
- Opening: a short story. Named people, one ordinary action, one realistic condition such as being offline, two devices side by side, and what each one ends up showing. About five sentences.
- Order: the story, then the cause in about three plain steps in time order, with the design intent stated before the flaw, then the engineering detail for those who need it.
- Plain words for internal states: "marks it not allowed", not "quarantined".
- Use this shape for sync, ordering, and permission behavior, and for any bug a product owner will read.

## Ticket

- Reader: QA, design, and the developer or agent who picks the ticket up later. None of them saw the planning conversation.
- Question: what do I build, how do I test it, and what is not a defect?
- Language: the machine-read register. One idea in each sentence. Active voice. One word for one meaning. QA, design, and development then read the ticket the same way, and QA writes test cases from it directly.
- Order for a Story or a Task. Leave out a section that has nothing in it.
  1. **User story**: the user-visible outcome in present tense. A Task says what it delivers.
  2. **Scope: in**: one bullet for each behavior.
  3. **Scope: out**: one bullet for each excluded behavior, with the ticket that covers it when one exists.
  4. **Preconditions**: feature flags and their state, and the personas.
  5. **Test data**: who sets it up, and how.
  6. **Acceptance criteria**: numbered `AC-1:`, `AC-2:` through the whole ticket. Each one is one short sentence that QA can test. When several personas act, group the criteria under a line that names the persona.
  7. **Platforms**.
  8. **Expected behavior (not defects)**: behavior that QA could report, but that is correct.
- Order for a Bug: **Steps to reproduce** (numbered, one action in each step), **Actual result**, **Expected result**, **Platforms**, then **Acceptance criteria** that prove the fix.
- Acceptance criteria are never Given/When/Then scenarios and never EARS `shall` sentences. EARS stays in task artifacts that only agents read, such as a `/deliver` task's acceptance, in its five shapes:

  ```text
  The <system> shall <response>.
  WHEN <trigger>, the <system> shall <response>.
  WHILE <state>, the <system> shall <response>.
  WHERE <feature is enabled>, the <system> shall <response>.
  IF <condition>, THEN the <system> shall <response>.
  ```
- A ticket template another skill owns can add sections, such as the feature flag, the sources, or the design deviations. It keeps the language and the acceptance criteria form of this shape.
- No rejected options and no history words: removed, renamed, instead of, decided, no longer, as discussed. The ticket states what is, not how the team got there. Keep the history in a research note or a decision log, and link it if the reader might want it.
- Example acceptance criteria, for an invented ticket PROJ-123 in a volunteer signup app:

  ```text
  Coordinator (sender)

  - AC-1: The picker lists each event with its shifts. Each shift shows a volunteer count.
  - AC-2: When the coordinator selects an event, all of its shifts show as selected.

  Volunteer (Saturday shift)

  - AC-10: The message shows in the volunteer inbox without a manual refresh. An unread badge shows.
  ```

## Ticket comment

- Reader: the person the comment names, or the next person who opens the ticket.
- Question: what happened, and what must I do?
- Language: the machine-read register, as for a ticket.
- Opening: what happened or what is needed, in one sentence. A comment that asks a person for something names that person in the first line and asks one question that they can answer.
- Order: the outcome, the evidence (PR, commit, `path:line`), then what the reader does next.
- A comment template another skill owns decides the structure, such as a fixed first line or a "How to verify" list. This shape decides the words.

## Request to colleagues

- Reader: the people being asked.
- Question: what do you need from me, and why?
- Opening: the shared goal in one or two sentences.
- Order: one group per person or team with the what and the why, then timing if it matters, then where to reply.
- The how and the when belong to the owner of the work. Give the outcome and the reason, not the method.
- Written as a person speaking, not as a report. Bullets, plain words, no status dump.

## A worked opening

A handoff before:

> The approved local prototype is implemented, committed, proved against a local gateway, and approved by one fresh independent reviewer. No Blocker or Required finding remains. Source: `ebafe1eda8f44883d53e571b726814fe4556410e`; base: `02523c7b8010307d82afce4993a131ddacbbc60d`; branch: `feat/signup-notifications`. All 73 reviewed file hashes still match.

The reader gets two full hashes and a count before learning what was built or what they have to decide.

After:

> Coordinators now get a phone notification when a volunteer signs up for a shift. The change is committed on `feat/signup-notifications`, reviewed once with no blocking findings, and not pushed. One decision is yours: whether a signup through a shared QR code reads "signed up" or needs its own wording.
>
> `Shape: handoff`

The hashes move to the footer. The decision moves to the first paragraph. The count of matching file hashes moves to the linked verification record, where the one reader in ten who wants it will look.

## Separate the current answer from its history

A handoff should let the next reader act without reconstructing the conversation. Keep decisions that still constrain the work. Put chronological detail in a linked log only when that log is useful.

For an indexed task, the current semantic record identifies the current answer. Older iterations remain immutable history. A fresh summary does not authorize modifying its source receipts or rewriting prior decisions.

## Translate engineering detail for another reader

Choose details by their effect on that reader's decision. A product reader may need the permission boundary and failure behavior, while an engineer also needs the responsible module. Do not remove a material limitation merely because its mechanism is technical. Explain its consequence in plain words.

If one document serves distinct readers, put shared outcomes first and separate the specialized detail. Create separate documents only when the tasks genuinely differ or the user requests them. Do not multiply outputs to satisfy an arbitrary audience count.

## Keep a request distinct from a specification

A request to a colleague identifies the desired outcome, reason, and relevant constraints. It need not dictate an implementation method unless that method is itself a requirement.

A specification needs testable conditions and observable responses. Do not turn an uncertain suggestion into a requirement or imply that editorial cleanup supplies missing product authority. Record the unanswered choice for its owner.

## Summarize without concealing evidence

A status update is a snapshot, not a growing log. Group related work so the reader can distinguish completion, active work, blockers, and decisions. Verify the source of a status before carrying it into a new update. Give each issue or pull request a short descriptive title rather than a bare identifier.

A verification report distinguishes an observed pass, an observed failure, and an unperformed check. Name the tested version and environment when they affect the result. Link the captured output or evidence record. A sentence saying "verified" is not itself proof.

A cost report states the accounting period, included usage, pricing basis, and whether the total is measured or estimated. Compare like-for-like figures. Keep a missing usage source visible rather than treating it as zero.
