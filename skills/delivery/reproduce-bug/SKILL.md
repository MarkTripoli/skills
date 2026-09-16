---
name: reproduce-bug
description: Run for /reproduce-bug requests. Reproduce a reported bug before anything is edited: record the observed and expected behavior, a reproduction that fails today, the cause, and a short fix plan; or record exactly what is missing when it cannot be reproduced.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Reproduce Bug

Turn a bug report into a reproduction that fails today, then record the cause and a fix plan short enough for one session. The reproduction artifact is the only plan a `bugfix` task has; nothing in the product is edited until it exists.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists; set `workflow: bugfix` in a `task.md` this skill creates. Read `ticket.md` when present and every `@file` argument fully. Read `references/reproduction_template.md`, `references/reproduction_reproduced_answer.md`, `references/reproduction_not_reproduced_answer.md`.

2. **Check for an existing reproduction**: read the newest artifact of type `reproduction` when one exists. Its presence means this is a re-run: the user's message carries new information (steps, data, environment, logs) or a correction to the recorded reproduction. Revise that file in place per the Iteration convention; never allocate a new number. Replace stale attempts, cause, and fix text; keep what still holds.

3. **Derive observed and expected behavior**: quote the report's exact error text, exit code, output, or screen state as observed. State expected behavior in one sentence, from the report or from the documented or tested behavior of the same path. When the report leaves expected behavior open, pick the reading the code's tests support and record the alternative under `### Known limits`.

4. **Find the code path**: locate the entry point the report exercises and follow it to the point where behavior diverges from expected. Read the existing tests for that path before writing one. Use child workers per the conventions (agent-codebase-locator for files and tests, agent-codebase-analyzer for current behavior) when the area is unfamiliar; verify their claims against the repository.

5. **Write a reproduction that fails today**:
   - Prefer a test in the project's test suite: a new test file or a new case in the file that covers the path, following that suite's patterns. Leave it uncommitted and record its path.
   - Fall back to an exact command with its observed output when no test harness can reach the behavior (a CLI invocation, an HTTP request, a script). Record the command byte-exact and the decisive output lines.
   - Run it. Record the run command and the result. A run that passes is not a reproduction: change the input, environment, or entry point and run again.
   - Bound the effort at three distinct attempts (different input, environment, or entry point; re-running the same command is one attempt). After three failures to reproduce, go to step 7.
   - Never edit product code, even to add logging; instrument only from the test or command side.

6. **Reproduced**: set `status: reproduced`. Under `## Cause`, explain why the observed behavior differs from expected with `path:line` pointers to the code that produces it. Under `## Fix`, write two to six ordered steps a fixer applies without further research: each names the file and function, what changes, and which check proves it (the reproduction from step 5 plus the narrowest existing check for the same path). Remove the `## Attempted` and `## Missing` sections.

7. **Not reproduced**: set `status: not-reproduced`. Under `## Attempted`, record every attempt from step 5: command, environment (versions, OS, data, configuration), result. Under `## Missing`, list exactly what would let it reproduce: steps, data, version, environment, logs, one item per line. Remove the `## Cause` and `## Fix` sections. Do not guess a cause.

8. **Save the artifact**: take the next artifact number (or keep the existing file from step 2) and write `NN-reproduction-<slug>.md` in the task directory from the template. Frontmatter: `task`, `type: reproduction`, `summary` (two to four sentences: what reproduced or did not, the cause or the missing input, what the fix session needs), `status`. Fill `## Human Review`: `### Review targets` names the reproduction and the cause and fix (or the missing list); `### Verify` lists the checks the reviewer runs, starting with the reproduction command and the failure it shows; `### Known limits` records environments not tried, the expected-behavior reading from step 3, or `None.` When not run by the workflow engine, commit the saved file with `git add <path>` as `docs(task): reproduction artifact`.

9. **Final answer**: `status: reproduced` uses `references/reproduction_reproduced_answer.md`; `status: not-reproduced` uses `references/reproduction_not_reproduced_answer.md`. Fill the selected template exactly, using the conventions' placeholders, plus `{needed}`: one line per item of the artifact's `## Missing` list. End with one fenced `text` command; nothing follows the fence.

## Rules

- Never edit product code and never commit code. The reproduction test stays uncommitted; the fix session decides whether it becomes a regression test. Only the reproduction artifact is committed, as a `docs(task)` commit.
- A reproduction that passes today is not a reproduction. Record it under `## Attempted` and try a different input, environment, or entry point.
- Do not guess a cause without a failing reproduction. `## Cause` and `## Fix` exist only when `status: reproduced`.
- Keep the fix plan short enough to execute in one session: two to six steps, each with a file, a function, the change, and its proving check. A bug whose fix needs a design decision is not a `bugfix` task; say so under `### Known limits` and keep the fix steps to what is settled.
- Quote observed behavior; do not paraphrase error text or exit codes.

## References

Read from this skill directory: `references/reproduction_template.md`, `references/reproduction_reproduced_answer.md`, `references/reproduction_not_reproduced_answer.md`.
