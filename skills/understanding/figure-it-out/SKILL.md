---
name: figure-it-out
description: Designs and runs an auditable playbook for work that fits no existing skill, such as a large migration or an ambitious multi-part change, scaling rigor to the stakes, running each unit as an experiment, and leaving a decision log a person can review afterwards. Use when the user runs /figure-it-out, says "figure it out", or hands over open-ended work to review after stepping away; not for one scoped feature or bug with a normal path to a pull request (use deliver).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Figure it out

When no playbook fits the task, design one before writing code. The first deliverable is the workflow itself: phases that scale rigor to the stakes, treat each unit of work as an experiment, and leave a trail a person can audit after stepping away.

Copy this checklist and tick it off:

```
Figure-it-out progress:
- [ ] A. Framed: done-predicate, scope, rigor level; framing shown to the user
- [ ] B. Workflow designed: units, order, checks, what fans out; phase list written
- [ ] C. Each unit run as an experiment and verified before the next
- [ ] D. Decision log current
- [ ] E. Whole verified against the done-predicate; handed back
```

## A. Frame

Read enough of the code and its history to ground the plan. Do not start the run until all three are written down:

- **Done**, as a predicate that can fail: a command, query or observation with the value it must show. "The migration is complete" is not one; "`rg -c 'legacyClient' src` prints nothing and the test suite passes" is.
- **Scope**, in numbers: how many files, call sites, tables or services, the rough effort, and the blockers the reading surfaced.
- **Rigor level.** Raise it for anything hard to undo (data migrations, published interfaces, deletions) and for wide reach. Lower it for reversible, local steps. Rigor means gates and saved evidence, not effort.

Show the framing and its tradeoffs to the user before a long run. Reversible work then proceeds without further questions. A step that cannot be undone, or that reaches outside the repository, waits for the user's say-so.

## B. Design the workflow

1. Split the work into units that can each land and be verified alone.
2. Order them so the riskiest unknown comes first, and so the verification harness exists before the work it checks. Capture the baseline from the unchanged system, so every later check reads as old value against new value.
3. For a decision that is hard to reverse, write two or three real alternatives and what each costs before choosing. Skip this for mechanical work whose shape is already settled.
4. Decide what runs in parallel. Fan out only across units that share no state, and give each worker its own worktree or branch. Choose each worker's model for its unit: a cheap one for mechanical edits with a machine check, the strongest for design and for judging.
5. Write the phase list down. That list is what the person reviews.

Start the decision log now (section D), then run the list.

## C. Run each unit as an experiment

For each unit: state the expected result, make the smallest change, measure it against the unit's check on the real artifact, keep the change when it advanced the work, and revert it when it did not. Verify each unit before starting the next; never batch the checks at the end.

- Verify by inspecting the artifact, never from a worker's report of itself. When something passes too easily, suspect the check before trusting the result.
- Pair delegated work with a separate judge. When a worker satisfies the check without doing the work, reset the unit and tighten its contract. When the check itself is wrong, fix the check in its own change; do not route around it.
- A verdict is `verified`, `not verified` or `inconclusive`. Inconclusive is not a pass. Report negative results.

## D. Keep the decision log

Keep one Markdown file, `decision-log.md`, in the task directory when the work belongs to a task (see the collection conventions), otherwise where the user names. Add a row as each unit lands, not at the end:

| When | Unit | Decision or result | Evidence | Verdict |
|---|---|---|---|---|
| 14:05 | Baseline | 212 call sites of `legacyClient` | `rg -c` output saved to `baseline.txt` | verified |

Record rejected alternatives and reverted attempts too; they are what the reviewer cannot reconstruct from the diff. Commit the log with the work only when the user asks for it in the pull request.

## E. Verify and hand back

Check the whole against the done-predicate from A on the real product, not only on the harness. Turn any correction that came up more than once into a check, test or script, so the next run cannot repeat it.

Reply with: the playbook as run, the rigor level and why, the path of the decision log, what is verified against the done-predicate, and what is still open.
