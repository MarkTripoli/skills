---
name: create-epic-plan
description: Run for /create-epic-plan requests. Decompose an epic into child tasks with workflow types and dependencies.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Create Epic Plan

Split an epic into child tasks that ship as separate pull requests. The epic plan is the last artifact before delivery creates the children and starts the ready ones.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions, creating it from the user's message when none exists.

2. **Read primary inputs fully, others by summary**:
   - Read `references/epic_plan_template.md`, `references/epic_plan_final_answer.md`, and the [slicing guide](https://github.com/MarkTripoli/skills/blob/main/shared/SLICING.md), which a checkout has at `shared/SLICING.md`.
   - Read completely: `task.md` or `ticket.md`, plus the newest artifact of type `research`.
   - Other artifacts in the task directory listing: use the `summary` field. Open only when research leaves a gap.

3. **Read relevant source files**:
   - Open source files named in research that decide where a child's change lands.
   - Verify file paths before naming them in a child prompt.

4. **Cut the epic into candidate children**: list the behaviors the epic delivers in the order a caller meets them, and make each behavior one candidate. Name the contract several candidates share (schema, endpoint shape, module seam) and fix it in `## Decomposition`, so siblings build against it instead of waiting for each other.

5. **Size every candidate against the slicing guide's four tests**: one obligation, one vertical slice, one day, safe to merge alone. Split each candidate that fails a test using the split its symptom names in the guide, then re-run the four tests on the results. Record the evidence per child in `## Slice Check`.

6. **Write each child's acceptance criteria** as EARS sentences per the slicing guide: one behavior each, observable state, no vague terms, and the failure or boundary paths that child owns.

7. **Write the epic plan**:
   - Take the next artifact number.
   - Write `NN-epic-plan-<slug>.md` in the task directory following the template.
   - Fill the `## Children` JSON fence with one entry per child.
   - Fill `## Slice Check` with one row per child.
   - Derive `## Ordering` waves from `depends_on`.

## Child Rules

- One child per independently mergeable change. Name each child by its outcome, never by the layer it touches.
- A child entry carries `name`, `workflow`, `slice`, `depends_on`, `acceptance`, and `prompt`, plus `flag` when a flag guards the merge.
- `slice` is `vertical` when the child ends at behavior a user or a caller can exercise, `enabler` when it stops at a layer boundary. Every `enabler` names its consuming sibling in `## Slice Check`; an epic of only enablers is a horizontal batch and gets recut.
- `acceptance` is one to five EARS sentences, each decidable by a command, request, or observation. They are the child's definition of done and travel into the child's `task.md`.
- `flag` names the runtime flag whose default keeps today's behavior while the child's path merges unfinished. Omit it when the change is additive or unreachable until a later child.
- A child's `prompt` is a self-contained task description naming the files and the behavior. It never references the epic's artifact directory; the child session cannot read it.
- `workflow` per child is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`: `oneshot` for a bounded change with a clear spec, `bugfix` for a reported defect to reproduce and fix, `full` when research or design is needed, `lean` or `prd` only when the task asks for them.
- `depends_on` lists sibling names whose merged pull request the child needs. Keep it minimal so independent children run together.

## Output

1. Save the file.
2. Re-check every child against the Child Rules: `name` is at most 120 characters; `prompt` is at most 10000 characters; `workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`; `slice` is `vertical` or `enabler`, and every `enabler` has a consumer among its siblings; `acceptance` holds one to five sentences, each a single obligation in an EARS pattern, none of them carrying "and also", "as well as", "fast", "secure", "user-friendly", or "works correctly"; every `depends_on` entry names an existing sibling, with no cycles. Fix each violation in the file and save again before replying.
3. Check each child's `workflow` with the typed-judgment helper. Write the children as `[{name, prompt}]` to a temporary JSON file outside the repository (`mktemp`), run `node <skills dir>/typed-judgment/judge.mjs route-workflow --children <file> --json` where `<skills dir>` is the directory that contains this skill, then delete the file. For every child whose `workflow` differs from the helper's `workflow`, adopt the helper's when its `confidence` is at least 0.8, unless the epic's request names the workflow for that child; the request wins. Fill the `## Workflow judgments` table with every child's `suggested` workflow and `confidence`, and save again. When the helper is unavailable (exit 3, no `node`, or no `TYPESAFE_API_KEY`), keep your own choices, write `Helper unavailable; workflows chosen by this skill.` in place of the table, and add a `### Known limits` item saying judgments were skipped so the reply carries it in one line.
4. Size each child with the same helper. Write the children as `[{name, slice, prompt, acceptance}]` to a temporary JSON file outside the repository (`mktemp`), run `node <skills dir>/typed-judgment/judge.mjs size-children --children <file> --json`, then delete the file. Fill the `## Sizing judgments` table from the answer: each child's `verdict`, the `weakest` test with its probability, the `criteria` verdict, and the `split` the helper names. Then act on it: for a child whose `verdict` is `split`, apply the named `split` when the helper gives one, replace that child with the resulting children, and record them in `## Slice Check`; keep the child whole only with a `### Known limits` line saying why. A `verdict` of `unclear` is yours to decide, and the `weakest` test names what to look at. A child whose `criteria` is `weak` gets its acceptance sentences rewritten until they name observable state. Do not call the helper a second time after splitting. When the helper is unavailable, keep your own sizing, write `Helper unavailable; sizing judged by this skill.` in place of the table, and reuse the same `### Known limits` item.
5. Reply following `references/epic_plan_final_answer.md` exactly; fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-epic-plan-slug.md](.agents/tasks/<slug>/NN-epic-plan-slug.md)`, fill `{artifact_file}` with the saved file's name only (the template carries the `@`; name this artifact and no other file, never a path), and fill the `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists. Add no prose before or after the template. Commit the saved file with `git add <path>` as `docs(task): epic-plan artifact`.

## Feedback

When an epic plan artifact already exists and the user (or the invoking prompt) supplies feedback, revise that file in place: verify each item against the repository, apply it to the affected children or waves, re-run the Output checks, and reply with the same template. Never write a second epic plan.
