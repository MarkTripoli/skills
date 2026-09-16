---
name: review-loop
description: Run for /review-loop requests. Drive review and fix in a bounded loop until zero findings or the max-depth cap.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Review Loop

Drive `review-code` and `fix-code-review` through fresh contexts, pass after pass, until a review reports zero findings, a `--max-depth` cap is reached, or a review is blocked. You never review or edit product code yourself; each pass runs in its own worker.

## Setup

Locate the task directory (`@<task dir>`, or a request naming one) and read `task.md` per the conventions (create one from the request when none exists). Resolve `max_depth`: the invoking prompt's `--max-depth <n>` flag or an explicit max-depth request wins; else `task.md`'s `max_depth` key; else endless (no cap). Record the absolute task directory, the project root (the directory that contains `.agents/tasks/`), and this skill's own directory and the installed skills directory beside it, the same way `run-task` records them before spawning a phase. Read `references/review_loop_template.md`, `review_loop_clean_answer.md`, `review_loop_capped_answer.md`, `review_loop_blocked_answer.md`.

## Resume

Find the newest artifact of type `review-loop` in the task directory (the conventions' "newest artifact of type X"). Take `depth` from its frontmatter; no such artifact means this is the first pass, `depth: 0`. A resumed run keeps that file's number: every pass below edits it in place, never allocates a new one.

## Loop

Repeat from step 1 until a step below stops:

1. Spawn a fresh-context `review-code` worker for the task directory (no `@<file>`; it reviews the whole current diff). Read its reply and the `code-review` artifact it names completely; take `status` from the artifact's frontmatter.
2. `status: clean`: set the loop artifact's `status` to `clean`, record this pass under `## Passes`, save, and hand off with `references/review_loop_clean_answer.md`.
3. `status: blocked`: set the loop artifact's `status` to `blocked`, record this pass and the blocker from the review artifact's `## Verdict` rationale, save, and stop. Terminal: reply with `references/review_loop_blocked_answer.md`.
4. `status: findings`:
   - `max_depth` is set and `depth + 1 > max_depth`: set the loop artifact's `status` to `capped`, record this pass and every open Critical/Required and Advisory finding from the review artifact under `## Termination`, save, and stop. Terminal, no fix pass: reply with `references/review_loop_capped_answer.md`.
   - Otherwise: spawn a fresh-context `fix-code-review` worker with `@<code-review artifact file>` for the task directory. Read its reply and the `code-review-fixes` receipt it names completely. Set `depth = depth + 1`, persist it in the loop artifact's frontmatter alongside `status: running`, record this pass (review artifact, review status, fixes receipt, findings applied/declined/blocked from the receipt), save, and return to step 1.

Every finding is in scope for the fix worker, advisories included (Design Q2 Option A): the loop's only exits are a literal `status: clean` from `review-code` and the depth cap; there is no partial-pass exit.

### Spawning a fresh-context worker

Reuse `run-task`'s documented backend order and prompt (the conventions' Execution backends section; `run-task/SKILL.md` steps 3-4): choose Herdr, then the runtime's subagent tool, then manual, in that order. Compute `NN` as the count of files in `<task dir>/replies/` plus one, two digits; `<skill>` is `review-code` or `fix-code-review`. The prompt is: "Read and follow `<skills dir>/<skill>/SKILL.md`, the installed skill for `/<skill>`, for task directory `<absolute task dir>`[` @<review artifact file>`]. When finished, also write your complete final reply (the message you print last, filled from the answer template, not the artifact) verbatim to `<absolute task dir>/replies/<NN>-<skill>.md`." Only `fix-code-review`'s prompt carries the `@<review artifact file>` argument.

- **Herdr**. Run `herdr pane split --current --direction right --cwd "<project root>" --no-focus` and take `.result.pane.pane_id`. Name the agent `<first 24 characters of slug>-<NN>`. Run `herdr agent start <name> --kind <kind> --pane <pane_id>` with the kind from the runtime's Herdr agent kind (or from the user when it is absent). Run `herdr agent prompt <name> "<prompt>" --wait --timeout 3600000`; a non-zero exit with `agent_prompt_stalled` means the prompt delivered but the runtime reports no lifecycle states, so continue. Then loop until the reply file exists, polling `herdr agent get <name>`.
- **Subagent**. Start one subagent with the prompt (the runtime notes name the tool). Its returned message is the reply; write it to the reply path yourself when the file is missing.
- **Manual**. Print the prompt as a fenced `text` block, say "Run this in a new session, then run `/review-loop @<task dir>` again.", and stop; the next invocation resumes this pass through Resume.

`review-code` keeps its no-edit rule in every pass.

## Save

One `review-loop` artifact per run: take the next artifact number only when no artifact of that type exists yet in the task directory; every later pass edits that same file in place per the conventions' Iteration rule, appending the new pass under `## Passes` and updating `depth`, `status`, and `summary`. Each pass's own `code-review` and `code-review-fixes` artifacts are the workers' numbered artifacts (Design Q5 Option A); the loop never renumbers or rewrites them.

## Next

- `status: clean`: use `references/review_loop_clean_answer.md`, next `/describe-pr`.
- `status: capped`: use `references/review_loop_capped_answer.md`, terminal.
- `status: blocked`: use `references/review_loop_blocked_answer.md`, terminal.

Fill `{artifact_link}` with a relative Markdown link to the saved `review-loop` artifact, `[NN-review-loop-slug.md](.agents/tasks/<slug>/NN-review-loop-slug.md)`. End with one fenced `text` command.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
