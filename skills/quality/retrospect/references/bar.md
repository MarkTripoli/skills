# The bar for a lesson

A candidate is a lesson only when all five hold:

1. **Concrete.** It names an event in the evidence: a command and its output, a commit, a review thread, a transcript line. "The agent was sloppy" is not concrete; "the agent reported done at 14:02 and the user's `npm test -- parse` failed at 14:05" is.
2. **Owned.** Its cause sits in something the user can change: a skill or its script, a check, a test or eval, a repository instruction file such as `AGENTS.md` or `CLAUDE.md`, a review rule, CI configuration. A third-party outage is not owned; the way a skill reacts to one is.
3. **Recurs.** It would happen again in another task or repository. A one-off typo does not recur; a skill that never runs the failing test does.
4. **New.** No rule, check or ledger lesson already covers it. When a rule exists and the run broke it, the lesson is why the rule did not hold (unclear wording, no check), not the rule again.
5. **Worth its cost.** See the cost test.

## The cost test: proposed or watching

Propose on the first occurrence when the evidence shows a real cost: the user had to correct the agent, a review caught a defect the builder should have, a commit was reverted, or an hour or more was lost. Otherwise record it as `watching`; the second occurrence proposes it.

**A kind of bug** is stricter: one bug is never enough, however cheap the missed check. Propose only when the same kind recurs (a second ledger occurrence, or two fix commits for the same kind in the same area) and the rule covers a class of change ("every user-supplied string rendered in a fixed-width row wraps"). A rule that fits one screen or endpoint stays `watching`. Name these lessons `bug-<kind>-<area>`, such as `bug-layout-signup-form`.

## Not lessons

- One bug's fix on its own. The fix is that run's product.
- A handoff working as designed: a stop for the user's approval, a question only the user could answer.
- A flaky job that passed on its one retry, unless it is the second time for the same job.
- A reviewer's preference with no defect behind it.
- Anything only about this conversation's wording.

## Where a lesson belongs

| The cause | Target | Product |
|---|---|---|
| A skill did the wrong thing or missed a case | `skill:<name>` | Draft PR to the skill collection changing that skill, with a test or eval that fails without the change |
| A defect any code review should have caught | `skill:review-code` | Draft PR to the skill collection |
| A repository convention the agent did not know or ignored | `repo:<repo>` | Draft PR to that repository's `AGENTS.md`, `CLAUDE.md` or review rules, plus a check where one can enforce it |
| A recurring kind of bug one shared piece of code keeps producing | `code:<repo>` | Draft PR fixing the shared piece, with a test |
| CI that is slow, flaky or wrong in its own configuration | `ci:<repo>` | Draft PR to that repository's CI configuration |
| A habit or setting outside any repository | `process` | Draft PR adding `lessons/<slug>/PROPOSAL.md` to the ledger repository |

A lesson has one target. When two fit, pick the one that stops it earliest, and prefer a check, test or eval over a louder rule: a rule restated with more emphasis is not a product.

## Examples

| Evidence | Verdict |
|---|---|
| The agent reported a fix done without running the failing test, and the user corrected it; the ledger has one earlier occurrence | Lesson, `skill:verify-implementation`, proposed: second correction |
| A review on the `notifyctl` PR caught an unhandled empty config file the builder's tests missed | Lesson, `skill:review-code` or `repo:notifyctl`, proposed when no check covers empty inputs |
| A task stopped to ask the user which test runner to use while `package.json` named it | Lesson, `repo:<repo>` if the runner is unusual, else the asking skill: a question the evidence answered |
| The type check took eight minutes once on a cold cache | Not a lesson: one-off, no owner change would help |
| A delivery waited for the user to approve its plan | Not a lesson: the stop is the design |
| A second layout bug in the signup form this month: a long name cut off | Lesson `bug-layout-signup-form`, `code:<repo>`, proposed: the shared row widget clips |
