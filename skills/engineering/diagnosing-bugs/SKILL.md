---
name: diagnosing-bugs
description: Diagnoses a hard bug or performance regression by building a tight red-capable feedback loop first, then reproducing, minimizing, testing ranked falsifiable hypotheses and fixing behind a regression test. Use when the user runs /diagnosing-bugs, says "diagnose this" or "debug this", or reports something broken, throwing, flaky or slow in any repository; not for the delivery workflow's recorded reproduction and fix phases on a task (use reproduce-bug and fix-bug).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Diagnosing bugs

A bug with a fast, deterministic pass/fail signal gets found; a bug without one gets guessed at. So the loop comes first and no hypothesis is formed until it exists. Skip a phase only with a stated reason. `<skill-dir>` is the directory holding this SKILL.md.

Redact every secret in commands, output and captured artifacts as `<REDACTED>`. Keep credentials in environment variables, and quote only the lines of a capture that carry the signal. If the redacted output is not enough, say so and ask the user.

Read `GLOSSARY.md` and ADRs under `docs/adr/` in the affected area when they exist.

## Phase 1: Build the feedback loop

Spend most of the effort here. Try, roughly in this order:

1. A failing test at whatever seam reaches the bug.
2. A `curl` or HTTP script against a running dev server.
3. A CLI run on a fixture input, diffed against known-good output.
4. A headless browser script (Playwright) asserting on DOM, console or network.
5. A replayed capture: a saved request, payload or event log run through the code path alone.
6. A throwaway harness: the smallest slice of the system that reaches the bug in one call.
7. A property or fuzz loop for "sometimes wrong" output.
8. A bisection harness for "worked before": `git bisect run <check>`.
9. A differential loop: same input through old and new versions or configs, outputs diffed.
10. A human-in-the-loop script, last resort, when a person has to click: copy `<skill-dir>/scripts/hitl-loop.template.sh` to a scratch path, replace the lines between the edit markers with `step "<instruction>"` and `capture VAR "<question>"` calls, and run `bash <copy>`. The user answers in the terminal; the script prints captured values as `KEY=VALUE` lines for you to read. Capture observations only, and leave signing in to the user as a `step`.

Then tighten it: faster (cache setup, narrow the scope), sharper (assert the exact symptom, not "did not crash"), deterministic (pin time, seed randomness, isolate the filesystem and network). For a flaky bug, raise the reproduction rate (loop the trigger, add parallelism or stress, narrow timing) until it fails often enough to debug.

**Done when** you can name one command, already run with its output shown, that:

- [ ] drives the real code path and asserts the user's exact symptom, so it goes red on this bug and green once fixed;
- [ ] gives the same verdict every run, or a pinned high rate for a flaky bug;
- [ ] finishes in seconds;
- [ ] runs unattended, or through the human-in-the-loop script.

Reading code to build a theory before this command exists is the failure this skill prevents. If no loop is possible, stop: list what you tried and ask for access to an environment that reproduces it, a redacted capture (HAR file, log, core dump, timestamped recording), or permission to add temporary production instrumentation.

## Phase 2: Reproduce and minimize

Run the loop and confirm it shows the failure the user described, not a nearby one, across repeated runs, and record the exact symptom (message, wrong value, timing). Then cut inputs, callers, config, data and steps one at a time, rerunning after each cut, until every remaining element is load-bearing: removing any one turns the loop green.

## Phase 3: Hypothesize

Write three to five ranked hypotheses before testing any. Each states its prediction: "If X is the cause, changing Y makes the bug disappear and changing Z makes it worse." A hypothesis without a prediction is discarded or sharpened. Show the ranked list to the user, who may re-rank it from context, and continue with your ranking if they do not answer.

## Phase 4: Instrument

Each probe tests one prediction and changes one variable. Prefer a debugger or REPL, then targeted logs at the points that separate hypotheses; never log everything and grep. Tag every debug line with one unique prefix such as `[DEBUG-a4f2]` so cleanup is one search. For a performance regression, measure a baseline first (timing harness, profiler, query plan), then bisect.

## Phase 5: Fix with a regression test

State the reproduction and the confirmed root cause before proposing the fix. Then:

1. Find a seam where a test reproduces the real bug pattern as it happens at the call site. If only a shallow seam exists (one caller where the bug needs several), record that as a finding instead of writing a test that gives false confidence; the installed codebase-design skill can shape a better seam.
2. Turn the minimized repro into a failing test there and watch it fail. If you forced red by mutating code or a fixture, diff against a clean copy to prove the mutation applied.
3. Apply the fix and watch the test pass.
4. Rerun the Phase 1 loop on the original, unminimized scenario.

## Phase 6: Clean up

- [ ] The Phase 1 loop no longer reproduces the bug.
- [ ] The regression test passes, or the missing seam is recorded.
- [ ] No line with the debug prefix remains (`git grep '\[DEBUG-a4f2\]'`).
- [ ] Throwaway harnesses are deleted or moved to a marked debug location.
- [ ] The commit or PR message states the hypothesis that proved correct.
