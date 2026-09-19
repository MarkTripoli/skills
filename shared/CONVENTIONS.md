# Collection conventions

These conventions apply to every skill in this collection.

## Portable skills, optional orchestration

Every skill runs independently in Claude Code, Codex, Oh My Pi, Pi, or a portable skill installation. Runtime adapters supply invocation and worker mechanics, not a separate delivery process. Missing worker support means performing the role inline after reading its skill. No phase requires Atomic, a workflow installation, or a sibling helper.

The optional Atomic workflow is registered as `delivery`. Install it explicitly with `--atomic`; ordinary installs copy skills only. It loads the same canonical skills, with portable `~/.agents/skills` as the default `skills_dir` and an explicit project-local path for project installs. Workflow source and helpers live under `atomic/`; there are no runtime-specific workflow forks. See [workflows/delivery.md](../workflows/delivery.md) for inputs and launch instructions.

## Task directory

A task lives in `.agents/tasks/<slug>/` under the project root. `<slug>` is two to four kebab-case words that name the task, for example `verbose-flag-cli` (from "Add a --verbose flag to the CLI"). `.agents/skills/` may sit beside it; skill scanners never read `.agents/tasks/`.

## task.md

`task.md` is the only required file in a task directory. Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date); epic children also carry `parent`, `base`, and `depends_on`. Optional keys: `issue` (the GitHub issue number a child task tracks, written by `start-epic-delivery` and closed by its pull request) and `routed_by` with `route_confidence` (the workflow the `deliver` skill chose and how sure the judgment was). The body is the user's request verbatim.

`workflow` records the delivery chain: `full`, `lean`, `prd`, `oneshot`, `bugfix`, `epic`, or `program`; the default is `full`. `resolve-reviews` and `epic-wave` are continuation routes over existing tasks, not new task kinds. The chains are in [workflows/delivery.md](../workflows/delivery.md).

A skill given no task directory, and finding none whose `task.md` matches the request, opens the task worktree first. Then create the directory: pick a slug, write `task.md` from the user's message, `git add .agents/tasks/<slug>/task.md`, commit as `docs(task): open <slug>`, and report the path. The optional workflow prepares the same file before its first skill stage; stages reuse it. When `git check-ignore -q .agents/tasks/<slug>/task.md` reports the file ignored, remove only the exact `.agents/tasks/` line that earlier versions of this collection added to the project `.gitignore`, stage that edit with the same commit, and stop with a one-line instruction when the path remains ignored. Outside git, save artifacts in place and report that they are uncommitted.

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

Every task works in its own git worktree on its own branch. A manual skill opens it before writing `task.md`, so every later commit lands on the task branch and the user's checkout stays untouched. Optional orchestration prepares or reuses the same task worktree before starting skill stages:

```bash
git worktree add ~/.agents/worktrees/<repo>/<slug> -b <slug> <target>
git -C ~/.agents/worktrees/<repo>/<slug> status --short --branch
```

`<repo>` is the basename of the main worktree, `basename "$(git worktree list --porcelain | sed -n '1s/^worktree //p')"`, which prints the same name from the main checkout and from any of its worktrees; the project root (`git rev-parse --show-toplevel`) is the current worktree and names the wrong directory from inside another task's. `<slug>` is the task slug; a skill whose own rule names the branch (`deliver` prefixes an epic branch with `epic-`) passes that name to `-b` and keeps the slug in the path. `<target>` is the merge target in the order the Commits section states: the existing pull request base, then `task.md` `base:`, then the repository default branch (`origin/HEAD`, or `main` without a remote). Without it `-b` cuts from the current HEAD, and a task opened from another task's worktree or from a feature branch carries that branch's commits into its pull request. Reuse the worktree instead of creating it when `git worktree list` already prints that path; when the branch already exists, check it out instead of creating it: `git worktree add ~/.agents/worktrees/<repo>/<slug> <slug>`. The rest of the task runs from that path: the task directory is created there, and each later phase starts there. Report the path and the branch in the reply.

The worktree is the default, not a question to put to the user. Four cases skip it, and nothing else does:

- The session is already on the task's branch, the name passed to `-b` (`<slug>`, or `epic-<slug>` for an epic; check with `git rev-parse --abbrev-ref HEAD`), that is, already in this task's own worktree. Work where the session is; the worktree exists. (Being in some *other* task's worktree does not skip it: `<repo>` and `<target>` resolve the same from any worktree of the repo, so the correct one is still opened.)
- The task directory already existed in this task's worktree. A later phase reuses it. An epic child directory committed on its parent's branch is not yet a child worktree: open the child's own worktree from the `base` recorded in its `task.md` before starting its first phase.
- The project is not a git work tree. Work in place and say so in the reply.
- The user's message in this session asks for the current checkout. Their word overrides the default; nothing else does, not a handoff fence and not a bare skill invocation.

A worktree outlives the task's sessions and is removed by the user with `git worktree remove <path>` once the pull request merges.

## Artifacts

Artifacts are `NN-<type>-<slug>.md` in the task directory. `NN` is two digits: list the directory, take the highest existing prefix, add one; use `01` when there is none.

`NN-execution-plan-<slug>.md` (`type: execution-plan`) is optional orchestration evidence: the delivery workflow records the selected chain, skipped phases, judgment probabilities, thresholds, and reasons. A design discussion's or TDD's `### Execution DAG` section embeds it when present. Manual skills do not need this artifact; without one they describe the selected chain from `task.md`.

Keep each template's frontmatter, including `summary`. Later phases read only `summary` from artifacts they did not select as primary inputs.

"The newest artifact of type X" is the file with the highest `NN` whose frontmatter `type` is `X`.

## Iteration

Revise an artifact by editing its file in place. Never allocate a new number for a revision. Re-read the file before writing when another actor may have changed it.

## Feedback

Feedback comes from the user's message, a named file, or reviewer text explicitly supplied to a revision stage. There are no comment identifiers, resolve step, or delete step: apply each change or state why it was not applied.

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
Open a new session in {run_location}, then run:

```text
/<next-skill> @NN-type-slug.md
```
````

In manual mode, running the next skill records approval. Under optional Atomic orchestration, its native human-input prompt records approval; the skill's handoff fence does not.

## Atomic approval and run control

Human approvals belong to Atomic's native UI. Inspect `/workflow status <run-id>` and use `/workflow connect <run-id>` to open the graph and answer a pending prompt. A phase's final answer still names its artifact, checks, and known limits, but neither that answer nor an ordinary chat response automatically approves anything.

Use native `/workflow pause <run-id>`, `/workflow quit <run-id>`, and `/workflow resume <run-id>` for resumable run control. Quit gracefully pauses saved work; it does not delete a run or its worktree. These are Atomic commands, not shell subcommands. There is no collection-owned gate watcher or response-command loop. Headless delivery requires `gates=none`.

## Handoff

A reply that hands off to another skill ends with exactly one fenced `text` block containing exactly one line: `/<skill-name>`, optionally followed by ` @<artifact file>`. Nothing follows the fence. Codex users type `$<skill-name>` instead of `/<skill-name>`; the fence still shows `/`.

The two lines before the fence are always `Next action:` and `Open a new session in {run_location}, then run:`. A terminal reply contains no command fence; it ends with the current state and any prerequisite action in plain prose.

The new session must open in the task worktree, on the task branch, where the phase that printed the reply ran: the task directory and every artifact are committed there and travel with the branch, and the `@<file>` argument is a path relative to that worktree's root. `{run_location}` names that worktree and branch, so the reply cannot drop where to run. Fill it from observed git state, never a guess: in a git work tree, `` `<root>` on branch `<branch>` `` where `<root>` is `git rev-parse --show-toplevel` (the task worktree, since every phase runs from it) and `<branch>` is `git rev-parse --abbrev-ref HEAD`; when the worktree was skipped and the project is not a git work tree, `this checkout`. A reply states only the worktree and branch it is actually in.

The command fence is for manual mode: the user pastes it into a new session in the same task worktree. Optional orchestration starts the next stage itself; it never executes the printed fence.

## Running as an Atomic stage

A native stage reads and follows `<skills_dir>/<skill>/SKILL.md` for the supplied task directory. The stage prompt states its scope and primary artifacts, supplies any accepted reviewer feedback, and asks for the skill's normal artifact and final answer. Skills retain their own artifact and code commit rules; orchestration reads persisted artifacts to route later work.

The workflow may collect structured results from artifact frontmatter, but it must not require a runtime-specific output format inside the ordinary skill. A revision stage applies supplied reviewer text to the newest artifact it owns in place.

## Typed judgments

`typed-judgment/judge.mjs`, installed beside the other skills, asks the TypeSafe System One model a typed question about prose (one option out of a set, a yes/no probability, a graded level) and prints one word, or JSON with `--json`; the thresholds live in the helper. Only a skill step or the optional Atomic controller that names the command calls it; no other step adds a call. The helper is optional: without a key (`TYPESAFE_API_KEY`, or the key file its skill names), without `node`, or on any nonzero exit the caller applies its own rule, the deterministic workflow check or the skill's own reading, never fails the step, and says once in the reply that judgments were skipped. Only what the step names leaves the machine: the artifact, request, feedback, thread bodies with the few lines of code they point at, or step observations; never other repository code, diffs, or secrets. Where a template has a place for it, the step records the answer word and its confidence in the artifact so a reader can see why the workflow branched.

## Answer template placeholders

Answer templates under `references/` use these placeholders; fill every one before printing.

- `{run_location}`: observed task worktree and branch in the fixed handoff sentence `Open a new session in {run_location}, then run:`. Fill `` `<root>` on branch `<branch>` `` from `git rev-parse --show-toplevel` and `git rev-parse --abbrev-ref HEAD`; use `this checkout` outside git. Fill it even when orchestration owns the next stage, so the reply remains usable manually.
- `{artifact_link}`: relative Markdown link to the file this phase saved, `[NN-type-slug.md](.agents/tasks/<slug>/NN-type-slug.md)`; `none` when nothing was saved.
- `{artifact_file}`: that file's name only, for example `04-plan-verbose-flag-cli.md`. Templates write `@{artifact_file}` in commands; the `@` is already there, so fill nothing but the name, never a path.
- `{summary}`: the saved artifact's frontmatter `summary`.
- `{review_check}` and `{known_limits}`: one line per item of the artifact's `### Verify` and `### Known limits` lists.
- `{plan_file}`: the name of the plan or structure outline being implemented, the newest artifact of type `plan` or `structure-outline`; used by the implementation skills, which hand off to the plan rather than to their own receipt. Same rule: name only, the template carries the `@`.
- `{next_command}`: in research replies, `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`; in sources replies, `/create-prd` or `/create-tdd` when the request converts an existing product or technical document the sources hold, otherwise the chain's first skill for the task's `workflow`: `/create-research-questions` for `full`, `lean`, `epic`; `/create-research` for `prd`, `program`, `oneshot`; `/reproduce-bug` for `bugfix`.
- `{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` otherwise; used by the plan, outline, and `iterate-implementation` replies.
- `{completed_phase}` and `{next_phase}`: phase numbers in implementation replies.
- `{child_slug}`, `{child_issue}`, `{child_start_command}`: epic delivery; see `start-epic-delivery`. `{child_issue}` is `#<number>` or `no issue`. `{child_start_command}` is the child's first manual skill followed by `.agents/tasks/<child slug>/`; for a oneshot child it is `/deliver .agents/tasks/<child slug>/` with an explicit instruction to use manual mode and implement before review. Each child starts in its own worktree cut from the epic branch in `task.md` `base:`.
- `{needed}`: one line per item of the artifact's `## Missing` list (the reproduction artifact in `reproduce-bug`, the app-test artifact in `test-app`).

## Commits

Pull request target resolution is the existing pull request base, then `task.md` `base:`, then the repository default branch.

`.agents/tasks/` is committed history. The task branch carries `task.md` and every artifact with the code to the pull request. Review-resolution sessions use the existing pull-request branch and its committed task directory.

Every skill commits its saved artifacts with explicit `git add <path>` as `docs(task): <artifact type> artifact`, for example `docs(task): plan artifact`. Optional orchestration may commit remaining task-directory changes after a stage, but this never replaces the skill's standalone commit rule. Code commits stage explicit code paths and never mix artifact files in. Never `git add -A` or `git add .` for code.

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

Validate the subject before committing: it must match `^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9][^\n]*[^.\n]$` and be at most 72 characters. A subject that fails is rewritten, never committed. A pull request title is a subject under the same rule: the `Commits` workflow runs `check-commits.mjs --title` on it, and a title that fails is shortened or rewritten before the pull request is opened or retitled.

## Child workers

For a role `agent-<role>`, start a worker whose first instruction is to read and follow the installed `agent-<role>` skill's `SKILL.md` (in a checkout of the collection, `skills/delivery/agent-<role>/SKILL.md`), give it the assignment text, wait for it, and read its final message. Verify its claims against the repository before using them.

The runtime section in an installed skill names the exact mechanism. When no subagent mechanism exists, perform the role inline and say so in the reply.

## Phase isolation and context budget

A phase skill reads only `task.md` and its selected artifacts. It never relies on earlier conversation. Every newly dispatched phase gets a fresh context: an Atomic native stage with `context: "fresh"`, or a new manual session. Resuming an interrupted active Atomic stage may restore that stage's own saved session; this does not carry its conversation into a different phase.

The artifact is the memory between phases; the conversation is not. Everything the next phase needs is in the task directory before the reply is printed. A compaction summary is not a substitute: it drops the exact file paths, checks, and limits the artifact keeps.

Read budget for one phase, in this order: `task.md` frontmatter and body; the selected primary artifacts, completely; `summary` only from other artifacts; repository files through child workers where the skill provides them, and directly only the files the phase must edit or cite. Never paste a worker's full message into an artifact or reply; extract facts with `path:line` pointers.

Signs that the context has degraded: re-reading a file already read this session, contradicting the artifact or `task.md`, dropping a constraint the user stated, repeating a question the user answered, or losing track of which numbered step is running. On the first sign: save the artifact in its current state, print the reply with the handoff fence, and stop. The next session resumes from the file with `/iterate-<phase> @<file>` or the next command.

Interactive phases (every `iterate-*` skill, `create-prd`, `create-tdd`, `review-artifact-comments`) accumulate the exchange in one window when run by hand. Save the artifact after every accepted change. After about ten feedback rounds, suggest continuing from that file in a new session with the matching `/iterate-*` command. Optional orchestration supplies accepted feedback to a new revision stage; an interrupted active stage follows the resume exception above.
