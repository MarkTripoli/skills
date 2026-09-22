# Slicing guide

One unit of work is one pull request. This guide is the test for whether a child task, an outline phase, or a stated behavior is already that small, and the split to apply when it is not. `create-epic-plan`, `create-structure-outline`, `create-plan`, and `create-prd` follow it.
`start-epic-delivery` re-validates the slices materialized from an approved plan against this guide
without re-sizing them.

## The unit

A child task produces one pull request a reviewer reads in one sitting and merges the day it starts. Work that cannot merge that day is not one unit; it is a wave of units that has not been split yet.

## Size signal (advisory)

Before running the four tests, estimate the unit's likely changed lines (generated code and
lockfiles excluded). A candidate that would change roughly more than 200-400 lines is a signal to
look for a split now, using the table below. The four tests remain the only binding gate; this
signal only surfaces oversize early, when a split is cheap, instead of at review time.

## Four tests

A candidate unit passes all four, or it gets split.

1. **One obligation.** The unit names one actor, one obligation, and one measurable pass criterion. "and also", "as well as", and a second unconditional "shall" each name a second unit.
2. **One vertical slice.** The unit crosses every layer its behavior needs (storage, service, contract, client) and ends at behavior a user or a caller can exercise. A unit that stops at a layer boundary is an enabler; it ships only when a sibling consumes it in the same wave or the next one.
3. **One day.** One engineer implements it, proves it, and opens the pull request inside a working day. Longer means a split, never a longer-lived branch.
4. **Safe to merge alone.** Merging this unit and nothing else leaves the product working: the new path is additive, unreachable, or held behind a flag whose default keeps today's behavior. A unit that only makes sense after a sibling merges names that sibling in `depends_on`.

These are the INVEST checks decidable from the text alone: independent (test 4), valuable (test 2), small (test 3), testable (the acceptance criteria below).

## Splits that work

| Symptom | Split |
|---|---|
| Several steps of one flow | one unit per step; the first unit is the walking skeleton |
| A rule plus its exceptions | the core rule first; one unit per variation |
| Several accepted input shapes or formats | the first shape first; one unit per further format |
| Happy path mixed with error, permission, and boundary handling | happy path first; one unit per failure class |
| Large because the approach is unknown | one time-boxed research unit ending in a design artifact, then size the rest |
| One layer changed for every feature at once (all migrations, then all endpoints) | regroup by behavior; this is horizontal batching, not slicing |

The slices together deliver what the original stated, with nothing added and nothing dropped.

## Acceptance criteria

Each unit carries criteria a test can decide. Write each one as a single EARS sentence.

| Pattern | Shape |
|---|---|
| Ubiquitous | The `<system>` shall `<response>`. |
| Event-driven | WHEN `<trigger>`, the `<system>` shall `<response>`. |
| State-driven | WHILE `<state>`, the `<system>` shall `<response>`. |
| Optional feature | WHERE `<feature is enabled>`, the `<system>` shall `<response>`. |
| Unwanted behavior | IF `<condition>`, THEN the `<system>` shall `<response>`. |

- One behavior per criterion. A second trigger, or a second outcome that a first failure would hide, is a second criterion.
- Name observable state: status code, stored record, emitted event, exit code, rendered value. Never a CSS selector, a private function, or an internal call.
- Replace "fast", "secure", "user-friendly", and "works correctly" with the number, error code, or command that decides the criterion.
- Cover the failure and boundary paths the unit owns, not the happy path alone.
- Given/When/Then states the same criterion with its precondition; use it when the precondition is what makes the behavior meaningful.

A criterion nobody can check by running something is not finished. Name the command, request, or observation that decides it.

## Dependencies

`depends_on` names the siblings whose merged pull request the unit needs, and nothing else. A shared shape is not a dependency: fix the contract where both siblings can read it and let them build in parallel. Every edge costs a wave, so the unit with fewer edges ships sooner.
