# Collection conventions

These conventions apply to every skill in this collection.

## Portable skills, optional orchestration

Every skill runs independently in Claude Code, Codex, Oh My Pi, Pi, or a portable skill installation. Runtime adapters supply invocation and worker mechanics, not a separate delivery process. Missing worker support means performing the role inline after reading its skill. No phase requires Atomic, a workflow installation, or a sibling helper.

The optional Atomic workflow is registered as `delivery`. Install it explicitly with `--atomic`; ordinary installs copy skills only. It loads the same canonical skills: without an explicit `skills_dir`, a project-local `.agents/skills` in the task worktree takes automatic precedence over the portable default `~/.agents/skills`. Workflow source and helpers live under `atomic/`; there are no runtime-specific workflow forks. See [workflows/delivery.md](../workflows/delivery.md) for inputs and launch instructions.

## Task directory

A task lives in `<task-root>/<slug>/` under the project root. `<slug>` is two to four kebab-case words that name the task, for example `verbose-flag-cli` (from "Add a --verbose flag to the CLI"). `<task-root>` is the repository's configured task root; the default is `.agents/tasks`. Skill scanners never read the task root, and `.agents/skills/` may sit beside the default root.

The task root resolves in this order:

1. An explicit existing `task_dir` is authoritative. Its parent directory is the task root and no directive is consulted.
2. Otherwise a repository-root `AGENTS.md` or `CLAUDE.md` may declare exactly one override directive: `<!-- skills:task-root=relative/path -->`. Both files may declare it (dual declarations) only when the values match. A conflict between files, more than one directive in one file, an invalid value, or a symlinked instruction file fails closed, as does a symlinked path component under the resolved root.
3. With no directive, the root is `.agents/tasks`.

A valid override is a relative POSIX path: no absolute or drive-letter form, no `~`, environment syntax, escaped bytes, backslashes, or NUL, and no empty, dot, or parent segments; every segment is lowercase `[a-z0-9._-]`. The reserved roots `.git`, `.agents/skills`, and `.atomic-delivery`, and anything beneath them, are rejected. The optional workflow resolves the root at the selected base commit and fails when the created worktree's checked-out root disagrees with it. Generic paths in this collection write the root as `<task-root>`; fill it from the resolved value, never a guess.

## task.md

`task.md` is the required request record in every task directory; a new task also carries a valid empty `index.json`, initialized at creation (see Artifacts). Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date); epic children also carry `parent`, `base`, and `depends_on`. Optional keys: `issue` (the GitHub issue number a child task tracks, written by `start-epic-delivery` and closed by its pull request), `routed_by` with `route_confidence` (the workflow the `deliver` skill chose and how sure the judgment was), and `liaison: first-sergent` for manual First Sergent opt-in. The body is the user's request verbatim.

`workflow` records the delivery chain: `full`, `lean`, `prd`, `oneshot`, `bugfix`, `epic`, or `program`; the default is `full`. `resolve-reviews` and `epic-wave` are continuation routes over existing tasks, not new task kinds. The chains are in [workflows/delivery.md](../workflows/delivery.md).

A skill given no task directory, and finding none whose `task.md` matches the request, opens the task worktree first. Then create the directory: pick a slug, write `task.md` from the user's message, and initialize a valid empty `index.json` (schema `skills.task-index/v1`, version 1, `generation` 0, no series), with the adjacent helper's `init` when the installation carries one and otherwise with the exact manual contract under Recording an artifact. `git add <task-root>/<slug>/task.md <task-root>/<slug>/index.json`, commit as `docs(task): open <slug>`, and report the path. The optional workflow prepares the same files before its first skill stage; stages reuse them. When `git check-ignore -q <task-root>/<slug>/task.md` reports the file ignored, remove only the exact task-root line that earlier versions of this collection added to the project `.gitignore`, stage that edit with the same commit, and stop with a one-line instruction when the path remains ignored. Outside git, save artifacts in place and report that they are uncommitted.

An existing task directory without `index.json` is a legacy task. It is never silently migrated: its numbered files stay as they are, and the legacy rules below apply only while the index is genuinely absent.

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

An indexed task stores durable artifacts under `artifacts/<kind>/<variant>/<NNNN>.md` inside the task directory, registered in `index.json`. The index is the sole source of truth for what exists and what is current. When `index.json` is present it is authoritative: invalid JSON, an invalid schema, a dangling path, a symlinked component, a SHA-256 mismatch, or mirrored `type`/`status`/`summary` that disagrees with the file fails closed rather than falling back to a directory scan.

Each artifact belongs to exactly one semantic series identified by `(kind, variant)`. Iteration `NNNN` is a four-digit contiguous number starting at `0001`; its id is `<kind>.<variant>.<NNNN>` and its path is `artifacts/<kind>/<variant>/<NNNN>.md`. A series records a `current` pointer and ordered `iterations`. Each iteration record carries `id`, `iteration`, `path`, `sha256` (the lowercase digest of the exact UTF-8 file text), `type`, `status`, and `summary` mirroring the artifact's own metadata, plus `supersedes` naming the immediately preceding iteration (omitted on the first). The index also carries a `generation` that increments by one on every recorded artifact.

The canonical series for each artifact type, exactly as `ARTIFACT_SERIES` in `shared/task-artifacts.mjs`:

| Type | Series (`kind.variant`) |
|---|---|
| `sources` | `research.sources` |
| `research-questions` | `research.questions` |
| `research` | `research.primary` |
| `design-discussion` | `design.discussion` |
| `design-prd` | `design.prd` |
| `design-tdd` | `design.tdd` |
| `structure-outline` | `planning.structure` |
| `plan` | `planning.plan` |
| `epic-plan` | `planning.epic` |
| `epic-delivery` | `delivery.epic` |
| `reproduction` | `debugging.reproduction` |
| `fix` | `implementation.fix` |
| `implementation` | `implementation.receipt` |
| `verification` | `review.verification` |
| `app-test` | `review.browser` |
| `code-review` | `review.code` |
| `code-review-fixes` | `review.fixes` |
| `comment-review` | `review.comments` |
| `pr-description` | `pull-request.description` |
| `pr-review` | `pull-request.review` |
| `evidence` | `evidence.recording` |
| `evidence-iteration` | `evidence.iteration` |
| `execution-plan` | `orchestration.execution` |
| `commit` | `delivery.commit` |

Distinct series never share iterations. Several general reviews of one type are iterations of one series, while different review kinds (`review.code`, `review.fixes`, `review.verification`, `review.browser`, `review.comments`, `pull-request.review`) remain separate durable series with their own current pointers.

`execution-plan` (`orchestration.execution`) is optional orchestration evidence: the delivery workflow records the selected chain, skipped phases, judgment probabilities, thresholds, and reasons. A design discussion's or TDD's `### Execution DAG` section embeds it when present. Manual skills do not need this artifact; without one they describe the selected chain from `task.md`.

`pr-description` is indexed like any other artifact at `pull-request.description` but stays body-only without frontmatter, because the file is the pull request body; its `summary` mirrors the `## Purpose` section and its `status` is null. An indexed task has no root-level `pr-description.md`.

Keep each template's frontmatter, including `summary`. Later phases read only `summary` from artifacts they did not select as primary inputs.

Selecting the current artifact of a type: read and validate `index.json`, map the type to its canonical series, and take the iteration record the series' `current` pointer names. Never scan the directory for the newest file when an index exists. The legacy behavior, scanning the task directory for `NN-<type>-<slug>.md` files and taking the highest `NN` whose frontmatter `type` matches, applies only to a legacy task where `index.json` is genuinely absent.

## Iteration

A recorded iteration is immutable. Every durable revision, whether reviewer feedback, a repair, or a regenerated document, creates the next iteration in the same series: allocate the next contiguous number, write the new file, record it with `supersedes` naming the previous current iteration, and advance the series' `current` pointer and the index `generation`. Nothing edits an earlier iteration's file or rewrites its record. Re-read the index before allocating when another actor may have changed it; a stale allocation aborts on conflict rather than overwriting.

## Recording an artifact

An installed runtime or portable skill may carry the adjacent helper `references/task-artifacts.mjs`. When it is present, the flow is:

1. `node references/task-artifacts.mjs init <task-dir>`: create or validate the task's `index.json`.
2. `node references/task-artifacts.mjs allocate <task-dir> <kind> <variant>`: returns a reservation with the allocated id, canonical path, and a unique staging `writePath`.
3. Write the artifact to the returned `writePath` exactly as it will be published.
4. `node references/task-artifacts.mjs record <task-dir> <kind> <variant> <type> <writePath>`: validates metadata, digests the exact UTF-8 text, publishes the file at its canonical path, registers the iteration, and returns the record. Use the returned canonical path from here on.

The helper also answers `current <task-dir> <type>` (the current record for a type) and `root <repo-root>` (the resolved task root). Distribution depends on the installation shape: canonical skills in this repository and published plugin skills use manual index mutation and cannot assume the helper; runtime and portable builds copy it beside each skill, but no skill requires it; the Atomic workflow requires its adjacent copy. An independently installed skill never treats the helper as mandatory.

Manual index mutation, when no helper is available, follows this exact contract (`TASK_ARTIFACT_DISTRIBUTION.canonical.contract` in `scripts/lib/build.mjs`):

- Validate the full existing index and every artifact path (relative, inside the task directory, no symlinks) before changing anything.
- Reserve the next contiguous four-digit iteration bound to the current index `generation`. Stage the file at a unique `.artifact-staging/<uuid>.md` and record the reservation with an exclusive create at `.artifact-reservations/<uuid>.json`.
- Digest the exact UTF-8 staging text with SHA-256. The record fields are `id`, `iteration`, `path`, `sha256`, `type`, `status`, `summary`; `supersedes` names the prior current iteration and is omitted on the first.
- Publish with an exclusive hard link from staging to the semantic path, set the series `current` to the new record id, and increment `generation` by one.
- Write the index through an exclusive sibling temporary file renamed atomically over `index.json`. If the index write fails, remove the published artifact; after success, remove the staging file and reservation. On any conflict (stale generation, existing path, concurrent update) abort; never force.

## Feedback

Feedback comes from the user's message, a named file, or reviewer text explicitly supplied to a revision stage. There are no comment identifiers, resolve step, or delete step: apply each change or state why it was not applied.

## Human gate reply

A phase that ends at a human gate replies in this shape:

````markdown
{summary}

Review artifact: [planning.plan.0001](<task-root>/<slug>/artifacts/planning/plan/0001.md)

Check:
- <one line per item in the artifact's ### Verify list>

Known limits:
- <one line per item in the artifact's ### Known limits list>

Reply with the changes you want, or run `/iterate-<phase> @<task-root>/<slug>/artifacts/planning/plan/0001.md`. Running the next command records approval.

Next action:
Open a new session in {run_location}, then run:

```text
/<next-skill> @<task-root>/<slug>/artifacts/planning/plan/0001.md
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

The workflow may collect structured results from artifact frontmatter, but it must not require a runtime-specific output format inside the ordinary skill. A revision stage applies supplied reviewer text by recording the next iteration of the series it owns; the controller verifies the stage registered the expected new current record and advanced the index generation.

## Typed judgments

`typed-judgment/judge.mjs`, installed beside the other skills, asks the TypeSafe System One model a typed question about prose (one option out of a set, a yes/no probability, a graded level) and prints one word, or JSON with `--json`; the thresholds live in the helper. Only a skill step or the optional Atomic controller that names the command calls it; no other step adds a call. The helper is optional: without a key (`TYPESAFE_API_KEY`, or the key file its skill names), without `node`, or on any nonzero exit the caller applies its own rule, the deterministic workflow check or the skill's own reading, never fails the step, and says once in the reply that judgments were skipped. Only what the step names leaves the machine: the artifact, request, feedback, thread bodies with the few lines of code they point at, or step observations; never other repository code, diffs, or secrets. Where a template has a place for it, the step records the answer word and its confidence in the artifact so a reader can see why the workflow branched.

## Answer template placeholders

Answer templates under `references/` use these placeholders; fill every one before printing.

- `{run_location}`: observed task worktree and branch in the fixed handoff sentence `Open a new session in {run_location}, then run:`. Fill `` `<root>` on branch `<branch>` `` from `git rev-parse --show-toplevel` and `git rev-parse --abbrev-ref HEAD`; use `this checkout` outside git. Fill it even when orchestration owns the next stage, so the reply remains usable manually.
- `{artifact_link}`: relative Markdown link to the artifact this phase recorded, `[<kind>.<variant>.<NNNN>](<task-root>/<slug>/artifacts/<kind>/<variant>/<NNNN>.md)`; `none` when nothing was saved.
- `{artifact_file}`: that artifact's path relative to the worktree root, `<task-root>/<slug>/artifacts/<kind>/<variant>/<NNNN>.md`. Templates write `@{artifact_file}` in commands; the `@` is already there, so fill nothing but the path.
- `{summary}`: the saved artifact's frontmatter `summary`.
- `{review_check}` and `{known_limits}`: one line per item of the artifact's `### Verify` and `### Known limits` lists.
- `{plan_file}`: the worktree-relative path of the plan or structure outline being implemented, the current artifact of the `planning.plan` or `planning.structure` series; used by the implementation skills, which hand off to the plan rather than to their own receipt. Same rule: path only, the template carries the `@`.
- `{next_command}`: only in replies for an artifact whose exact `type` is `research`, `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`; in `sources` replies, `/create-prd` or `/create-tdd` when the request converts an existing product or technical document the sources hold, otherwise the chain's first skill for the task's `workflow`: `/create-research-questions` for `full`, `lean`, `epic`; `/create-research` for `prd`, `program`, `oneshot`; `/reproduce-bug` for `bugfix`. This placeholder never rewrites a literal command in another answer template: `research-questions` always hands off to `/create-research`, including in `lean`.
- `{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` otherwise; used by the plan, outline, and `iterate-implementation` replies.
- `{completed_phase}` and `{next_phase}`: phase numbers in implementation replies.
- `{child_slug}`, `{child_issue}`, `{child_start_command}`: epic delivery; see `start-epic-delivery`. `{child_issue}` is `#<number>` or `no issue`. `{child_start_command}` is the child's first manual skill followed by `<task-root>/<child slug>/`; for a oneshot child it is `/deliver <task-root>/<child slug>/` with an explicit instruction to use manual mode and implement before review. Each child starts in its own worktree cut from the epic branch in `task.md` `base:`.
- `{needed}`: one line per item of the artifact's `## Missing` list (the reproduction artifact in `reproduce-bug`, the app-test artifact in `test-app`).

## Commits

Pull request target resolution is the existing pull request base, then `task.md` `base:`, then the repository default branch.

The task root is committed history. The task branch carries `task.md`, `index.json`, and every artifact with the code to the pull request. Review-resolution sessions use the existing pull-request branch and its committed task directory.

Every skill commits its saved artifacts with explicit `git add <path>` as `docs(task): <artifact type> artifact`, for example `docs(task): plan artifact`. One artifact commit stages the new iteration's canonical path and `index.json` together, so the committed index never references an uncommitted file. Optional orchestration may commit remaining task-directory changes after a stage, but this never replaces the skill's standalone commit rule. Code commits stage explicit code paths and never mix artifact files in. Never `git add -A` or `git add .` for code.

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

The runtime section in an installed skill names the exact mechanism. When no subagent mechanism exists, ordinary phase worker roles run inline and say so; `agent-first-sergent` is the exception because its opted-in contract requires separately delegated fresh phases. Without that transport, keep the existing manual handoff instead of calling an inline role a liaison.

## Phase isolation and context budget

A phase skill reads only `task.md` and its selected artifacts. It never relies on earlier conversation. Every newly dispatched phase gets a fresh context: an Atomic native stage with `context: "fresh"`, or a new manual session. Resuming an interrupted active Atomic stage may restore that stage's own saved session; this does not carry its conversation into a different phase.

The artifact is the memory between phases; the conversation is not. Everything the next phase needs is in the task directory before the reply is printed. A compaction summary is not a substitute: it drops the exact file paths, checks, and limits the artifact keeps.
An opted-in manual First Sergent is a child-worker role, not a phase skill. It dispatches each phase in a fresh agent session and reads its saved artifact; when a gate needs human input it returns only the decision and evidence to the chat liaison. Task-local `.first-sergent-state.json` keeps exact artifact-hash approvals, pending feedback and cumulative steps across worker replacement; the original request stays in `task.md`. Interactive in-phase questions need the same addressable child session, not a new artifact gate. This role never carries its own conversation into a phase or compacts an active phase. Atomic's existing controller serves as a separate orchestrator for an explicitly selected Atomic run; its native pending gate does not wake the liaison, and native Atomic prompts, not chat text, authorize gates. The ordinary manual handoff stays available when this mode is off.

Read budget for one phase, in this order: `task.md` frontmatter and body; the primary artifacts selected through the index's current records, completely; `summary` only from other index records; repository files through child workers where the skill provides them, and directly only the files the phase must edit or cite. Never paste a worker's full message into an artifact or reply; extract facts with `path:line` pointers.

Signs that the context has degraded: re-reading a file already read this session, contradicting the artifact or `task.md`, dropping a constraint the user stated, repeating a question the user answered, or losing track of which numbered step is running. On the first sign: save the artifact in its current state, print the reply with the handoff fence, and stop. The next session resumes from the file with `/iterate-<phase> @<file>` or the next command.

Interactive phases (every `iterate-*` skill, `create-prd`, `create-tdd`, `review-artifact-comments`) accumulate the exchange in one window when run by hand. Save the artifact after every accepted change. After about ten feedback rounds, suggest continuing from that file in a new session with the matching `/iterate-*` command. Optional orchestration supplies accepted feedback to a new revision stage; an interrupted active stage follows the resume exception above.
