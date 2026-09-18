# Collection conventions

These conventions apply to every skill in this collection.

## Task directory

A task lives in `.agents/tasks/<slug>/` under the project root. `<slug>` is two to four kebab-case words that name the task, for example `verbose-flag-cli` (from "Add a --verbose flag to the CLI"). `.agents/skills/` may sit beside it; skill scanners never read `.agents/tasks/`.

## task.md

`task.md` is the only required file in a task directory. Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date); epic children also carry `parent`, `base`, and `depends_on`. Optional keys: `issue` (the GitHub issue number a child task tracks, written by `start-epic-delivery` and closed by its pull request) and `routed_by` with `route_confidence` (the pack the `deliver` skill chose and how sure the judgment was). The body is the user's request verbatim.

`workflow` is one of `full`, `lean`, `prd`, `oneshot`, `bugfix`, `epic`; the default is `full`. It records the delivery pack that created the task; the chains are in [workflows/delivery.md](../workflows/delivery.md).

Under Archon the `delivery-task` block writes this file and commits it as `docs(task): open <slug>`. A skill run by hand that is given no task directory and finds none whose `task.md` matches the request opens the task worktree first, then creates the directory the same way: pick a slug, write `task.md` from the user's message, `git add .agents/tasks/<slug>/task.md`, commit with subject `docs(task): open <slug>`, and report the path in the reply. When `git check-ignore -q .agents/tasks/<slug>/task.md` reports the file ignored, remove the exact `.agents/tasks/` line that earlier versions of this collection added to the project `.gitignore`, stage that edit with the same commit, and stop with a one-line instruction when the path is still ignored.

Example:

```markdown
---
slug: verbose-flag-cli
title: Add a --verbose flag to the CLI
workflow: full
created: 2026-09-15
---
Add a --verbose flag to the CLI that prints each command before running it.
```

## Task worktree

Every task works in its own git worktree on its own branch. Under Archon the run gets one from `--branch`. A skill run by hand opens it, before `task.md` is written, so the task directory and every later commit land on the task branch and the checkout the user works in stays untouched:

```bash
git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>
git -C ~/.agents/worktrees/<repo>/<slug> status --short --branch
```

`<repo>` is the basename of the main worktree, `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"`, which prints the same name from the main checkout and from any of its worktrees; the project root (`git rev-parse --show-toplevel`) is the current worktree and names the wrong directory from inside another task's. `<slug>` is the task slug; a skill whose own rule names the branch (`deliver` prefixes an epic branch with `epic-`) passes that name to `-b` and keeps the slug in the path. `<target>` is the merge target in the order the Commits section states: the existing pull request base, then `task.md` `base:`, then the repository default branch (`origin/HEAD`, or `main` without a remote). Without it `-b` cuts from the current HEAD, and a task opened from another task's worktree or from a feature branch carries that branch's commits into its pull request. Reuse the worktree instead of creating it when `git worktree list` already prints that path; when the branch already exists, check it out instead of creating it: `git worktree add ~/.agents/worktrees/<repo>/<slug> <slug>`. The rest of the task runs from that path: the task directory is created there, and each later phase starts there. Report the path and the branch in the reply.

The worktree is the default, not a question to put to the user. Four cases skip it, and nothing else does:

- The session is already on the task's branch, the name passed to `-b` (`<slug>`, or `epic-<slug>` for an epic; check with `git rev-parse --abbrev-ref HEAD`), that is, already in this task's own worktree. Work where the session is; the worktree exists. (Being in some *other* task's worktree does not skip it: `<repo>` and `<target>` resolve the same from any worktree of the repo, so the correct one is still opened.)
- The task directory already existed. The worktree was opened when the task was opened; a later phase does not open a second one.
- The project is not a git work tree. Work in place and say so in the reply.
- The user's message in this session asks for the current checkout. Their word overrides the default; nothing else does, not a handoff fence and not a bare skill invocation.

A worktree outlives the task's sessions and is removed by the user with `git worktree remove <path>` once the pull request merges.

## Artifacts

Artifacts are `NN-<type>-<slug>.md` in the task directory. `NN` is two digits: list the directory, take the highest existing prefix, add one; use `01` when there is none.

Keep each template's frontmatter, including `summary`. Later phases read only `summary` from artifacts they did not select as primary inputs.

"The newest artifact of type X" is the file with the highest `NN` whose frontmatter `type` is `X`.

## Iteration

Revise an artifact by editing its file in place. Never allocate a new number for a revision. Re-read the file before writing when another actor may have changed it.

## Feedback

Feedback comes from the user's message, from a file the user names, or, under Archon, from the reviewer text of a rejected gate that the node prompt passes in. There are no comment identifiers, no resolve step, and no delete step: apply the change, or say why it was not applied.

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

Next action:
Open a new session, then run:

```text
/<next-skill> @NN-type-slug.md
```
````

Under Archon the approval node records the decision; the reply's fence is ignored.

## Handoff

A reply that hands off to another skill ends with exactly one fenced `text` block containing exactly one line: `/<skill-name>`, optionally followed by ` @<artifact file>`. Nothing follows the fence. Codex users type `$<skill-name>` instead of `/<skill-name>`; the fence still shows `/`.

The two lines before the fence are always `Next action:` and `Open a new session, then run:`. A terminal reply contains no command fence; it ends with the current state and any prerequisite action in plain prose.

The command fence is for manual mode: the user pastes it into a new session. Archon ignores it and runs the next node itself.

## Running under Archon

A delivery pack node prompt reads: "Read and follow `<skills_dir>/<skill>/SKILL.md`, the installed `<skill>` skill, for task directory `<task dir>`." It then states that the workflow engine runs the next phase, tells the skill to ignore any instruction about opening a new session, and asks it to print the skill's final answer. The skill does its normal work, writes its artifact, and prints its normal reply; nothing in the skill needs to know it is under Archon. The one rule that depends on it, "when not run by the workflow engine, commit the saved file", is decided by that sentence alone: a prompt that does not say the workflow engine runs the next phase is a by-hand run, whatever else it looks like, and the skill commits its artifact.

Some nodes end the prompt with a JSON-only requirement instead of "Print the skill's final answer": `review-code` answers `{status, artifact, summary}` and `reproduce-bug` answers `{status, summary, artifact}`, each field copied from the artifact's frontmatter. The artifact is still written first; the JSON replaces the printed reply, and the pack routes on `status`. The requirement lives in the pack prompt, not in the skill.

An iterate skill run by a pack receives the reviewer's text in the prompt as its feedback and revises the newest artifact it owns in place.

## Typed judgments

`typed-judgment/judge.mjs`, installed beside the other skills, asks the TypeSafe System One model a typed question about prose (one option out of a set, a yes/no probability, a graded level) and prints one word, or JSON with `--json`; the thresholds live in the helper. Only a skill step or a pack node that names the command calls it; no other step adds a call. The helper is optional: without `TYPESAFE_API_KEY`, without `node`, or on any nonzero exit the caller applies its own rule, the pack's deterministic check or the skill's own reading, never fails the step, and says once in the reply that judgments were skipped. Only what the step names leaves the machine: the artifact, request, feedback, thread bodies with the few lines of code they point at, or step observations; never other repository code, diffs, or secrets. Where a template has a place for it, the step records the answer word and its confidence in the artifact so a reader can see why the workflow branched.

## Answer template placeholders

Answer templates under `references/` use these placeholders; fill every one before printing.

- `{artifact_link}`: relative Markdown link to the file this phase saved, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`; `none` when nothing was saved.
- `{artifact_file}`: that file's name only, for example `04-plan-verbose-flag-cli.md`. Templates write `@{artifact_file}` in commands; the `@` is already there, so fill nothing but the name, never a path.
- `{summary}`: the saved artifact's frontmatter `summary`.
- `{review_check}` and `{known_limits}`: one line per item of the artifact's `### Verify` and `### Known limits` lists.
- `{plan_file}`: the name of the plan or structure outline being implemented, the newest artifact of type `plan` or `structure-outline`; used by the implementation skills, which hand off to the plan rather than to their own receipt. Same rule: name only, the template carries the `@`.
- `{next_command}`: in research replies, `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`; in sources replies, `/create-prd` or `/create-tdd` when the request converts an existing product or technical document the sources hold, otherwise the chain's first skill for the task's `workflow`: `/create-research-questions` for `full`, `lean`, `epic`; `/create-research` for `prd`, `program`, `oneshot`; `/reproduce-bug` for `bugfix`.
- `{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` otherwise; used by the plan, outline, and `iterate-implementation` replies.
- `{completed_phase}` and `{next_phase}`: phase numbers in implementation replies.
- `{child_slug}`, `{child_issue}`, `{child_start_command}`: epic delivery; see `start-epic-delivery`. `{child_issue}` is `#<number>` of the child's GitHub issue, or `no issue`. `{child_start_command}` is `archon workflow run delivery-<workflow> --base <epic branch> --input task_dir=.agents/tasks/<child slug> '<child prompt>'`, with every `'` in the prompt written as `'\''`, run from the project root on the epic branch; it appears in the terminal reply body.
- `{needed}`: one line per item of the artifact's `## Missing` list (the reproduction artifact in `reproduce-bug`, the app-test artifact in `test-app`).

## Commits

Pull request target resolution is the existing pull request base, then `task.md` `base:`, then the repository default branch.

`.agents/tasks/` is committed history. An Archon run works in a disposable worktree; the branch carries the task's memory, so `task.md` and every artifact travel with the code to the pull request, where a reviewer can open them, and to `delivery-resolve-reviews`, which adopts the run's branch and reads them.

Artifacts under `.agents/tasks/` are committed on the task branch. Under Archon the pack's join node after each phase stages only the run's task directory and commits as `docs(task): <phase> artifacts`, where `<phase>` is `research`, `design`, `prd`, `tdd`, `plan`, `outline`, `implement`, `review`, `reproduce`, `fix`, `pr`, or `review-round`. A skill that is not run by the workflow engine commits its own artifact with an explicit `git add <path>` as `docs(task): <artifact type> artifact`, for example `docs(task): plan artifact`. Code commits stage explicit code paths and never mix artifact files in. Never `git add -A` or `git add .` for code.

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

## Phase isolation and context budget

A phase skill reads only `task.md` and the artifacts it selects. It never relies on earlier conversation. Each phase runs in a fresh context: an Archon node with `context: fresh`, or a new session the user opens by hand and pastes the handoff command into.

The artifact is the memory between phases; the conversation is not. Everything the next phase needs is in the task directory before the reply is printed. A compaction summary is not a substitute: it drops the exact file paths, checks, and limits the artifact keeps.

Read budget for one phase, in this order: `task.md` frontmatter and body; the selected primary artifacts, completely; `summary` only from other artifacts; repository files through child workers where the skill provides them, and directly only the files the phase must edit or cite. Never paste a worker's full message into an artifact or reply; extract facts with `path:line` pointers.

Signs that the context has degraded: re-reading a file already read this session, contradicting the artifact or `task.md`, dropping a constraint the user stated, repeating a question the user answered, or losing track of which numbered step is running. On the first sign: save the artifact in its current state, print the reply with the handoff fence, and stop. The next session resumes from the file with `/iterate-<phase> @<file>` or the next command.

Interactive phases (every `iterate-*` skill, `create-prd`, `create-tdd`, `review-artifact-comments`) accumulate the whole exchange in one window when run by hand. Save the artifact after every accepted change so nothing is lost when the session ends. After about ten rounds of feedback, say so and suggest continuing from the saved file in a new session with the matching `/iterate-*` command. Under Archon each round is its own fresh session: the gate collects the feedback and the iterate skill applies it.
