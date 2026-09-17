---
name: start-epic-delivery
description: Run for /start-epic-delivery requests. Create child task directories from an approved epic plan and start the first ready wave.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Epic Delivery Start

You turn an approved epic plan into one task directory per child and tell the user which children can start now. Running this skill records approval of the epic plan.

## Steps

1. **Locate the task directory and read `task.md`** per the conventions. The epic's slug is the parent slug for every child.

2. **Read the epic branch**: `git rev-parse --abbrev-ref HEAD`. Stop when it prints `HEAD`, `main`, or `master`: the epic must run on its own branch because the children's `task.md` files are committed to it and every child cuts its worktree from it; tell the user to start the run with `--branch epic-<epic slug>` (by hand: `git switch -c epic-<epic slug>`). Record the name; it is `<epic branch>` below.

3. **Select the epic plan**. Use the file the user named with `@...`; otherwise the newest artifact of type `epic-plan` in the task directory. Read it completely. Stop and ask when there is no epic plan.

4. **Parse the children**. Take the JSON fence under `## Children`. Each entry has `name`, `workflow`, `slice`, `depends_on`, `acceptance`, and `prompt`, and may have `flag`. Check every entry before writing anything: `name` is 1 to 120 characters; `workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`; `slice` is `vertical` or `enabler`; `acceptance` is a list of one to five sentences; `prompt` is 1 to 10000 characters; every `depends_on` entry names another child in the same list; no dependency cycles. Stop with the exact violations when any check fails; the user fixes the epic plan with `/create-epic-plan` follow-up edits and runs this skill again.

5. **Check for conflicts**. Compute each child's slug as the kebab-case form of its `name`, trimmed to at most four words. List `.agents/tasks/`. If any child directory already exists, stop and list every conflict; create nothing.

6. **Create the child task directories**. For each child, write `.agents/tasks/<child slug>/task.md` with frontmatter `slug`, `title` (the child `name`), `workflow`, `created` (today, ISO date), `parent` (the epic slug), `base` (the epic branch), and `depends_on` (a YAML list of the dependency slugs, empty list when none). The body is the child `prompt` verbatim, then a blank line, then `## Acceptance criteria` with one bullet per `acceptance` sentence in order. When the child has a `flag`, the body ends with `Feature flag: <flag>`, whose default keeps today's behavior.

7. **Compute waves**. Wave 1 is every child with no dependencies. Wave N+1 is every child whose dependencies are all in waves 1 to N. Every child lands in exactly one wave; a child whose dependencies never resolve is a violation from step 4.

8. **Open one GitHub issue per child**. Run this step only when `gh auth status >/dev/null 2>&1` succeeds and `git remote get-url origin` prints a `github.com` URL; otherwise skip it, create no issue, and write one line under `### Known limits` in the receipt: `GitHub issues were not created: <gh not installed | gh not authenticated | origin is not a GitHub remote>.` Create the label once, ignoring failure: `gh label create 'epic:<epic slug>' --description 'Children of epic <epic slug>' 2>/dev/null || true`. Then walk the children wave by wave, so every dependency already has a number. For each child, write the body to a temporary file: the child `prompt` verbatim, a blank line, then three lines `Depends on: #<n>, #<m>` (the issue numbers of its `depends_on` siblings, or `Depends on: none`), `Epic: <epic branch>`, and `Task directory: .agents/tasks/<child slug>`. Create the issue with `gh issue create --title '<child name>' --label 'epic:<epic slug>' --body-file <body file>`; the command prints the issue URL, and the number is its last path segment. Add `issue: <number>` to that child's `task.md` frontmatter, after `depends_on`. When `gh issue create` fails for a child, leave `issue` out of its `task.md`, name the child under `### Known limits`, and continue with the next child.

9. **Commit the child task files**: `git add .agents/tasks/<child slug>/task.md` for each child, then one commit with subject `docs(task): open epic children`. A child run cuts its worktree from `<epic branch>`, so its `task.md`, including `issue`, must be in that branch's history before the child starts.

10. **Write the receipt**. Take the next artifact number and write `NN-epic-delivery-<epic slug>.md` from `references/epic_delivery_template.md`: the epic branch, the children created with their paths and issue numbers (`#<number>`, or `none`), the waves, and the Human Review section. When not run by the workflow engine, commit the receipt with `git add <path>` as `docs(task): epic-delivery artifact`.

11. **Final answer**. Read `references/epic_delivery_final_answer.md` and respond using that template only. Fill `{artifact_link}` with a relative Markdown link to the receipt. List one line per wave-1 child; its `{child_issue}` is `#<number>` from step 8 (or `no issue`), and its `{child_start_command}` is `archon workflow run delivery-<workflow> --base <epic branch> --input task_dir=.agents/tasks/<child slug> '<child prompt>'`, where `<workflow>` is the child's `workflow`, `<epic branch>` is the name from step 2, `<child slug>` is the directory created in step 6, and `<child prompt>` is the child's `prompt` verbatim with every `'` written as `'\''`. `--base` cuts the child's worktree from the epic branch, which holds the child's `task.md`, and makes the epic branch the target of the child's pull request. The `task_dir` input makes the child run reuse that directory instead of creating a second one. The command runs from the project root and starts the child as its own delivery run. Under `delivery-epic` and `delivery-program`, the `delivery-wave` block that follows this skill launches the ready children itself when the pack's `children` input is `auto` (the default); the printed commands are then the record of what it runs, and the way to start a child by hand when `children` is `manual`. The reply is terminal: no additional skill command follows.

## Rules

- Never edit the epic plan; report violations and stop.
- Never start a child's phases from this session. Each child runs as its own delivery run, one at a time or in parallel per wave.
- Children in later waves start only after every dependency's pull request is merged; say so in the receipt.
- `issue` in a child's `task.md` is always the number `gh issue create` returned; never guess one, and never fail the run because issues could not be created.
- The only commits this skill makes are `docs(task): open epic children` and, by hand, the receipt commit; it never stages code.
