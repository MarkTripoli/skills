# Collection conventions

These conventions apply to every skill in this collection.

## Task directory

A task lives in `.agents/tasks/<slug>/` under the project root. `<slug>` is two to four kebab-case words that name the task, for example `verbose-cli-flag`. `.agents/skills/` may sit beside it; skill scanners never read `.agents/tasks/`.

## task.md

`task.md` is the only required file in a task directory. Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date). The body is the user's request verbatim.

`workflow` is one of `full`, `lean`, `prd`, `oneshot`; the default is `full`. The chains are in [workflows/delivery.md](../workflows/delivery.md).

A skill that is given no task directory and finds none whose `task.md` matches the request creates one: pick a slug, write `task.md` from the user's message, append `.agents/tasks/` to the project `.gitignore` when that file exists and lacks the line, and report both paths in the reply.

Example:

```markdown
---
slug: verbose-cli-flag
title: Add a --verbose flag to the CLI
workflow: full
created: 2026-09-15
---
Add a --verbose flag to the CLI that prints each command before running it.
```

## Artifacts

Artifacts are `NN-<type>-<slug>.md` in the task directory. `NN` is two digits: list the directory, take the highest existing prefix, add one; use `01` when there is none.

Keep each template's frontmatter, including `summary`. Later phases read only `summary` from artifacts they did not select as primary inputs.

"The newest artifact of type X" is the file with the highest `NN` whose frontmatter `type` is `X`.

## Iteration

Revise an artifact by editing its file in place. Never allocate a new number for a revision. Re-read the file before writing when another actor may have changed it.

## Feedback

Feedback comes from the user's message or from a file the user names. There are no comment identifiers, no resolve step, and no delete step: apply the change, or say why it was not applied.

## Human gate reply

A phase that ends at a human gate replies in this shape:

````markdown
{summary}

Review artifact: [NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)

Check:
- <one line per item in the artifact's ### Verify list>

Known limits:
- <one line per item in the artifact's ### Known limits list>

Reply with the changes you want, or run `/iterate-<phase> @NN-type-slug.md`. Running the next command records approval.

```text
/<next-skill> @NN-type-slug.md
```
````

## Handoff

The final answer ends with exactly one fenced `text` block containing exactly one line: `/<skill-name>`, optionally followed by ` @<artifact file>`. Nothing follows the fence. Codex users type `$<skill-name>` instead of `/<skill-name>`; the fence still shows `/`.

## Commits

Exclude `.agents/tasks/` from commits unless the user asks to include it. Stage explicit paths only; never `git add -A` or `git add .`.

Every commit message follows [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```text
<type>(<scope>)!: <description>

[body]

[footer]
```

- `type` is one of `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- `scope` is optional: the module, package, or area touched, in kebab-case. Omit the parentheses when the change has no single area.
- `!` marks a breaking change; the footer then carries `BREAKING CHANGE: <what breaks and the migration>`.
- `description` is imperative, lower-case first letter, no trailing period, whole subject line at most 72 characters.
- The body says why, not what the diff shows. Footers reference issues (`Refs: #123`, `Closes: #123`).
- One type per commit: a `feat` and its `test` may share a commit; a `feat` and an unrelated `fix` never do.

Validate the subject before committing: it must match `^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9][^\n]*[^.\n]$` and be at most 72 characters. A subject that fails is rewritten, never committed.

## Child workers

For a role `agent-<role>`, start a worker whose first instruction is to read and follow `skills/agent-<role>/SKILL.md` (or the installed skill of that name), give it the assignment text, wait for it, and read its final message. Verify its claims against the repository before using them.

The runtime section in an installed skill names the exact mechanism. When no subagent mechanism exists, perform the role inline and say so in the reply.

## Worktree probe

Used by `create-plan`, `iterate-plan`, `create-structure-outline`, and `iterate-structure-outline` to choose a final-answer template.

1. Read `.agents/workspace.json` and `.agents/workspace.local.json` when present.
2. Run `git rev-parse --git-dir`.
3. Choose:
   - the git dir path contains `/worktrees/`: the in-worktree answer template;
   - a workspace config is present with `disabled: true`: the disabled answer template; check out branch `<slug>` first when it does not exist;
   - otherwise, including when no config file exists: the answer template that hands off to `/setup-worktree`, which writes a default `.agents/workspace.json` when none exists.

## Phase isolation

A phase skill reads only `task.md` and the artifacts it selects. It never relies on earlier conversation. Each phase is meant to run in a fresh context, started by `run-task` or by the user opening a new session and pasting the handoff command.

## Reply files

When the invoking prompt names a reply path (`.agents/tasks/<slug>/replies/NN-<skill>.md`), the skill writes its complete final reply there verbatim after printing it. `NN` is the phase-run sequence (`01`, `02`, ...), independent of artifact numbers. The file's existence signals completion; its `text` fence is the next command.

## Execution backends

`run-task` chooses a backend in this order:

1. Herdr, when `HERDR_ENV` is `1`, `herdr` is on `PATH`, and the runtime notes in the installed skill name a Herdr agent kind.
2. The runtime's subagent tool.
3. Manual: print the command and the task path; the user runs it in a new session and re-runs `/run-task`.

Interactive phases need a human in the loop: every `iterate-*` skill, `create-prd`, `create-tdd`, and `review-artifact-comments`. Run them in Herdr when available, otherwise inline in the current session with the sentence "Running this phase inline; context will grow." Never run an interactive phase in a subagent.
