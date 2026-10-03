---
name: reproduce-bug
description: Reproduces a reported bug before anything is edited and records the observed and expected behavior, a reproduction that fails today, the cause and a short fix plan, or exactly what is missing when it cannot reproduce. Use when the user runs /reproduce-bug, pastes a bug report or ticket, or a bugfix task starts; not for fixing the bug (use /fix-bug once the status is reproduced).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Reproduce Bug

Turn a bug report into a reproduction that fails today, then record the cause and a fix plan short enough for one session. The reproduction artifact is the only plan a `bugfix` task has; nothing in the product is edited until it exists.

For a delivery task, save the output of `node <skills-dir>/deliver/contract.mjs revision <task-dir>` as `revision`, never a git hash, record the policy and baseline paths, and report the evidence still missing. A source change makes earlier verification, review, recording and inspection historical. `node <skills-dir>/deliver/contract.mjs status <task-dir>` reports currency; optional for manual work.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists; set `workflow: bugfix` in a `task.md` this skill creates. Read `ticket.md` when present and every `@file` argument fully. Read `references/reproduction_template.md`.

2. **Check for current reproduction evidence**: read current `debugging.reproduction` when present. On a re-run, use it as input and record a new iteration; never edit the current record. Replace stale attempts/cause/fix text while keeping what holds. A legacy task without `index.json` follows the conventions' in-place rule.

3. **Derive observed and expected behavior**: quote the report's exact error text, exit code, output, or screen state as observed. State expected behavior in one sentence, from the report or from the documented or tested behavior of the same path. When the report leaves expected behavior open, pick the reading the code's tests support and record the alternative under `### Known limits`.

4. **Find the code path**: locate the entry point the report exercises and follow it to the point where behavior diverges from expected. Read the existing tests for that path before writing one. Use child workers per the conventions (agent-codebase-locator for files and tests, agent-codebase-analyzer for current behavior) when the area is unfamiliar; verify their claims against the repository.

   Before adding or editing a reproduction test or check, get a baseline:
   1. If a sealed original baseline exists, reuse it.
   2. Otherwise run `/record-evidence --baseline` now, while source and checks are unchanged.
   3. If that cannot run (no recording or viewing capability), record the baseline `untested` with the reason and continue; it may be captured later from a temporary worktree at the base commit.

   Reuse matching failure output in step 5; do not rerun only to confirm the report.

5. **Write a reproduction that fails today**:
   - Prefer a test in the project's test suite: a new test file or a new case in the file that covers the path, following that suite's patterns. Leave it uncommitted and record its path.
   - Fall back to an exact command with its observed output when no test harness can reach the behavior (a CLI invocation, an HTTP request, a script). Record the command byte-exact and the decisive output lines.
   - Run it. Record the run command and the result. A run that passes is not a reproduction: change the input, environment, or entry point and run again.
   - Bound the effort at three distinct attempts (different input, environment, or entry point; re-running the same command is one attempt). After three failures to reproduce, go to step 7.
   - Never edit product code, even to add logging; instrument only from the test or command side.

6. **Reproduced**: set `status: reproduced`. Under `## Cause`, explain why the observed behavior differs from expected with `path:line` pointers to the code that produces it. Under `## Fix`, write two to six ordered steps a fixer applies without further research: each names the file and function, what changes, and which check proves it (the reproduction from step 5 plus the narrowest existing check for the same path). Remove the `## Attempted` and `## Missing` sections.

7. **Not reproduced**: set `status: not-reproduced`. Under `## Attempted`, record every attempt from step 5: command, environment (versions, OS, data, configuration), result. Under `## Missing`, list exactly what would let it reproduce: steps, data, version, environment, logs, one item per line. Remove the `## Cause` and `## Fix` sections. Do not guess a cause.

8. **Save the artifact**: record the next immutable `debugging.reproduction` iteration from the template. Frontmatter: `task`, `type: reproduction`, `summary` (two to four sentences covering observed result, cause or missing input, and the fix session's needs), `status`. Human Review names the reproduction and cause/fix or Missing list; Verify starts with the command and decisive failure; Known limits lists untried environments, expected-behavior source, or `None.` Keep it local and uncommitted. Only a genuinely unindexed legacy task uses numbered files.

   When reproduced, hand off to `/fix-bug`.

9. **Final answer**: read the one answer template the status selects. `status: reproduced` uses `references/reproduction_reproduced_answer.md`; `status: not-reproduced` uses `references/reproduction_not_reproduced_answer.md`. Fill the selected template exactly, using the conventions' placeholders, plus `{needed}`: one line per item of the artifact's `## Missing` list. End with one fenced `text` command; nothing follows the fence. A blocker that needs a human goes to the orchestrator; run by hand, post it to the task's Slack thread per [feature-thread mode](https://github.com/MarkTripoli/skills/blob/main/skills/delivery/agent-slack-control-plane/references/feature-thread.md#post-a-blocker).

## Rules

- Never edit product code and never commit code. The reproduction test stays uncommitted; the fix session decides whether it becomes a regression test. Keep the reproduction artifact in the local task directory; it is not part of branch history.
- Keep the fix plan short enough to execute in one session: two to six steps, each with a file, a function, the change, and its proving check. A bug whose fix needs a design decision is not a `bugfix` task; say so under `### Known limits` and keep the fix steps to what is settled.
- Quote observed behavior; do not paraphrase error text or exit codes.
