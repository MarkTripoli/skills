---
task: [task slug]
type: reproduction
summary: "[Two to four sentences: whether the bug reproduced, the cause or the missing input, and what the fix session needs from this file.]"
status: reproduced | not-reproduced
---

# [Bug] Reproduction

## Observed and expected

- Observed: [Exact error text, exit code, output, or screen state from the report, quoted.]
- Expected: [One sentence: the behavior the report or the path's documented and tested behavior requires.]
- Source: [Report, ticket, or issue reference.]

## Reproduction

- Test or command: [`path/to/test_file` with the test name, left uncommitted; or the exact command.]
- Run: [`<command that runs the test or reproduction>`]
- Result today: [Fails; the decisive output lines, quoted.]

## Cause

[Reproduced only; remove this section when `status: not-reproduced`. Why observed differs from expected, with `path:line` pointers to the code that produces it.]

## Fix

[Reproduced only; remove this section when `status: not-reproduced`. Two to six ordered steps a fixer applies without further research.]

1. [`path/to/file` `functionName`: what changes. Proves it: the reproduction above, plus `<narrowest existing check>`.]
2. [Next step.]

## Attempted

[Not reproduced only; remove this section when `status: reproduced`. One entry per attempt, at least three.]

1. Command: [`<command>`]. Environment: [versions, OS, data, configuration]. Result: [passed, or output that differs from the report].
2. [Next attempt.]

## Missing

[Not reproduced only; remove this section when `status: reproduced`. Exactly what would let the bug reproduce, one item per line.]

- [Steps, data, version, environment, or logs needed.]

## Human Review

### Review targets

- [The reproduction, then the cause and fix steps, or the missing list.]

### Verify

- [ ] [Run `<command>`; it fails with `<decisive output>`.]
- [ ] [Further exact check the reviewer performs before approving.]

### Known limits

- [Environment not tried, an alternative reading of expected behavior, or `None.`]
