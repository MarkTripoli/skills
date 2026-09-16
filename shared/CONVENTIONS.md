# Collection conventions

These conventions apply to every skill in this collection.

## Task directory

A task lives in `.agents/tasks/<slug>/` under the project root. `<slug>` is two to four kebab-case words that name the task, for example `verbose-cli-flag`. `.agents/skills/` may sit beside it; skill scanners never read `.agents/tasks/`.

## task.md

`task.md` is the only required file in a task directory. Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date). The body is the user's request verbatim.

`workflow` is one of `full`, `lean`, `prd`, `oneshot`; the default is `full`. The chains are in [workflows/delivery.md](../workflows/delivery.md).

Optional key `with`: a list of optional phases to insert before `describe-pr`, for example `with: [review-code, record-evidence]`. `run-task` merges it with its `--with` option; the phases and their order are in [workflows/delivery.md](../workflows/delivery.md), Optional phases.

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

Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one.

```text
/<next-skill> @NN-type-slug.md
```
````

## Handoff

The final answer ends with exactly one fenced `text` block containing exactly one line: `/<skill-name>`, optionally followed by ` @<artifact file>`. Nothing follows the fence. Codex users type `$<skill-name>` instead of `/<skill-name>`; the fence still shows `/`.

The sentence before the fence is always: "Start the next phase in a new session, or hand the task to `/run-task`; continuing in this session carries this phase's context into the next one." Terminal replies whose fence names `/show-me` omit it, because no phase follows.

## Answer template placeholders

Answer templates under `references/` use these placeholders; fill every one before printing.

- `{artifact_link}`: relative Markdown link to the file this phase saved, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`; `none` when nothing was saved.
- `{artifact_file}`: that file's name only, for example `04-plan-verbose-cli-flag.md`. Templates write `@{artifact_file}` in commands; the `@` is already there, so fill nothing but the name, never a path.
- `{summary}`: the saved artifact's frontmatter `summary`.
- `{review_check}` and `{known_limits}`: one line per item of the artifact's `### Verify` and `### Known limits` lists.
- `{plan_file}`: the name of the plan or structure outline being implemented, the newest artifact of type `plan` or `structure-outline`; used by `setup-worktree` and the implementation skills, which hand off to the plan rather than to their own receipt. Same rule: name only, the template carries the `@`.
- `{next_command}`: in research replies, `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`.
- `{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` for `full` and `prd`.
- `{completed_phase}` and `{next_phase}`: phase numbers in implementation replies.
- `{child_slug}`, `{child_start_command}`, `{first_child_command}`: epic delivery; see `start-epic-delivery`.

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

For a role `agent-<role>`, start a worker whose first instruction is to read and follow the installed `agent-<role>` skill's `SKILL.md` (in a checkout of the collection, `skills/delivery/agent-<role>/SKILL.md`), give it the assignment text, wait for it, and read its final message. Verify its claims against the repository before using them.

The runtime section in an installed skill names the exact mechanism. When no subagent mechanism exists, perform the role inline and say so in the reply.

## Worktree probe

Used by `create-plan`, `iterate-plan`, `create-structure-outline`, and `iterate-structure-outline` to choose a final-answer template.

1. Read `.agents/workspace.json` and `.agents/workspace.local.json` when present.
2. Run `git rev-parse --git-dir`.
3. Choose:
   - the git dir path contains `/worktrees/`: the in-worktree answer template;
   - a workspace config is present with `disabled: true`: the disabled answer template; check out branch `<slug>` first when it does not exist;
   - otherwise, including when no config file exists: the answer template that hands off to `/setup-worktree`, which writes a default `.agents/workspace.json` when none exists.

## Phase isolation and context budget

A phase skill reads only `task.md` and the artifacts it selects. It never relies on earlier conversation. Each phase is meant to run in a fresh context, started by `run-task` or by the user opening a new session and pasting the handoff command.

The artifact is the memory between phases; the conversation is not. Everything the next phase needs is in the task directory before the reply is printed. A compaction summary is not a substitute: it drops the exact file paths, checks, and limits the artifact keeps.

Read budget for one phase, in this order: `task.md` frontmatter and body; the selected primary artifacts, completely; `summary` only from other artifacts; repository files through child workers where the skill provides them, and directly only the files the phase must edit or cite. Never paste a worker's full message into an artifact or reply; extract facts with `path:line` pointers.

Signs that the context has degraded: re-reading a file already read this session, contradicting the artifact or `task.md`, dropping a constraint the user stated, repeating a question the user answered, or losing track of which numbered step is running. On the first sign: save the artifact in its current state, print the reply with the handoff fence, and stop. The next session resumes from the file with `/iterate-<phase> @<file>` or the next command.

Interactive phases (every `iterate-*` skill, `create-prd`, `create-tdd`, `review-artifact-comments`) accumulate the whole exchange in one window. Save the artifact after every accepted change so nothing is lost when the session ends. After about ten rounds of feedback, say so and suggest continuing from the saved file in a new session with the matching `/iterate-*` command.

## Reply files

When the invoking prompt names a reply path (`.agents/tasks/<slug>/replies/NN-<skill>.md`), the skill writes its complete final reply there verbatim after printing it. The final reply is the text filled from the skill's answer template (`references/*_answer.md`), the message the user reads last; it is never the artifact, and it ends with the command fence. `NN` is the phase-run sequence (`01`, `02`, ...), independent of artifact numbers. The file's existence signals completion; its `text` fence is the next command.

## Execution backends

`run-task` chooses a backend in this order:

1. Herdr, when `HERDR_ENV` is `1`, `herdr` is on `PATH`, and the runtime notes in the installed skill name a Herdr agent kind.
2. The runtime's subagent tool.
3. Manual: print the command and the task path; the user runs it in a new session and re-runs `/run-task`.

Interactive phases need a human in the loop: every `iterate-*` skill, `create-prd`, `create-tdd`, and `review-artifact-comments`. Run them in Herdr when available, otherwise inline in the current session with the sentence "Running this phase inline; context will grow." Never run an interactive phase in a subagent. After an inline phase, the orchestrator's session holds that phase's whole exchange: it stops and asks the user to continue with `/run-task @<task dir>` in a new session.
