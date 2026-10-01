# Collection conventions

Conventions apply to every skill.

## Portable skills

Every skill runs standalone in Claude Code, Codex, Oh My Pi, Pi, or a portable install. Runtime adapters supply invocation and worker mechanics, not a separate delivery process. Without worker support, perform the role inline after reading its skill. No phase requires a sibling helper.

## Task directory

Task lives in `<task-root>/<slug>/` under the project root; default root `.agents/tasks`. An explicit existing task directory makes its parent authoritative; otherwise read the repository AGENTS/CLAUDE directive. Conflicting/invalid directives and symlinked components fail closed. Read [task artifact and root contracts](task-artifacts.md) before discovery or writes. `<slug>` is two to four kebab-case words, e.g. `verbose-flag-cli`. Skill scanners never read the resolved task root.

## task.md

`task.md` records the request; new tasks also initialize a valid empty `index.json` (`skills.task-index/v1`). Legacy tasks genuinely lacking the index stay legacy, never silently migrate. Frontmatter keys: `slug`, `title`, `workflow`, `created` (ISO date); epic children also carry `parent`, `base`, `depends_on`. Optional keys: `branch` (epic child's branch), `issue` (GitHub issue number the child tracks, written by `start-epic-delivery` and linked by its PR), `gates` (`plan` or `none`), `routed_by` (`deliver` when that skill routed it), `slack_run_id`, and `slack_channel` with `slack_thread_ts` (written by `deliver`; see [Slack feature thread](#slack-feature-thread)). Body = user's request verbatim, then the sections `## Status` (the current stop condition and its unblock check) and `## Decisions` (dated: decision, owner, reason), both written by `deliver`.

`workflow` records the delivery chain: `full`, `lean`, `prd`, `oneshot`, `bugfix`, `epic`, or `program`; default `full`. `resolve-reviews` and `epic-wave` continue existing tasks. Chains are in [workflows/delivery.md](../workflows/delivery.md).

A skill given no task directory, and finding none whose `task.md` matches the request, opens the task worktree first, then picks a slug, writes `task.md`, initializes `index.json` and reports the path. Before writing it, if `git check-ignore -q <task-root>/<slug>/task.md` reports it is NOT ignored, append `/<task-root>/` to `$(git rev-parse --git-common-dir)/info/exclude`; that local exclude is shared by all worktrees and never commits. Never edit or commit the project `.gitignore`. Outside git: save artifacts in place.

For `/deliver` feature work, keep a `## Delivery brief` after the verbatim request: observed Jira key and URL, branch base and SHA, decision authority, requested UI surfaces, evidence destination, PR follow-up, model roles, delegation, PR size decision, and unresolved ticket gaps. It carries standing defaults into fresh phases without changing the request. No phase treats an inferred requirement as a Jira fact. Authorization the developer gives up front for decisions and review repairs covers later phases; external actions outside it need their own authority.

For Jira-backed tasks, the current `research.jira` artifact (`type: jira-refinement`) records the live issue snapshot, confirmed specifications, QA guide and `## Planning impact` before implementation. It is a draft source for PRD, outline or plan work, not approval to edit Jira. A later refinement requires reconciling the existing plan or outline before implementation resumes. Proposed behavior stays labeled until confirmed.

Example:

```markdown
---
slug: verbose-flag-cli
title: Add a --verbose flag to the CLI
workflow: full
created: 2026-09-15
---
Add a --verbose flag to the CLI.
```

## Slack feature thread

Task whose `task.md` has `slack_run_id` uses the `slack-coordinator` CLI for one run thread. `deliver` saves the ID returned by `run start` before work begins. Only the orchestrator sends `run event`, calls `run check` immediately before a mutation, handles owner input with `run resolve`, and calls `run finish` with the observed outcome; workers and reviewers never send them. A standalone phase run by hand on a task with a run ID acts as the orchestrator. Such a task never uses the direct Slack API; see [coordinator mode](../skills/delivery/agent-slack-control-plane/SKILL.md#coordinator-mode).

Without coordinator mode, a task with `slack_thread_ts` uses the one direct feature thread `deliver` opened. A phase posts one blocker reply only when a human answer is required and no artifact or repository file supplies it, per [feature-thread mode](../skills/delivery/agent-slack-control-plane/SKILL.md#feature-thread-mode); ordinary handoffs are not blockers. With `SLACK_AGENT_OWNER_ID` set, read the thread at least once a minute while waiting; the first owner reply or session answer wins. `describe-pr` edits the root with the PR-open state; follow-up edits it with observed checks. Direct Slack failure does not block product work unless the request made Slack a gate.


## Task worktree

Every task gets its own branch/worktree before task files are written. Resolve the main repository name from `git worktree list --porcelain`, not the current task checkout. Create `~/.agents/worktrees/<repo>/<slug>` with `git worktree add <path> -b <branch> <target>`; reuse existing paths/branches. An explicit branch wins, otherwise use `<dev-name>/<issue-key-if-known>-<short-description>` with the configured Git name in kebab-case. Epic skill-specific branch rules remain authoritative.

Resolve `<target>` from the existing PR base, task `base:`, then origin default branch (or main without a remote). New deliver work fetches origin and prefers observed origin/main unless an explicit target wins; report fetch failure without calling stale state fresh. Record the SHA.

Skip only when already in this task's own worktree, its task directory already exists here, the project is not Git (state that), or the user explicitly requested this checkout. Another task's worktree never qualifies. Copy an epic child's task.md and empty index into its new child worktree after opening it from its recorded base. Keep worktrees and historical task directories; the owner removes them after merge.

## Artifacts and feedback

Read [the immutable artifact contract](task-artifacts.md) before selecting or recording artifacts. With `index.json`, validate the whole index and ledger; select its current semantic record and never directory-scan or edit a recorded iteration. Revisions allocate immutable successors. Only genuinely absent indexes use legacy numbered files and in-place revisions. Invalid indexes fail closed.

Keep each template's frontmatter, including `summary`; read selected primary artifacts completely and only summaries from others. Feedback comes from the user's message, named file or supplied reviewer text. Apply each change or explain why not.

Raw captures stay in external scratch; evidence receipts are local provenance metadata, not uploads. Publication proof is the hosted PR body, distinct same-PR comment and direct capture bytes, checked by the existing publication gate and optional hooks. Required untested, failed, stale or unreadable proof blocks ready publication.

## Human gate reply

A phase ending at a human gate uses its answer template: summary, artifact link, `Check:` and `Known limits:` lines from the artifact's `### Verify` and `### Known limits` lists, then the handoff below. Running the next skill records approval.

## Handoff

A reply handing off to another skill ends with one fenced `text` block holding one line: `/<skill-name>`, optionally followed by ` @<artifact file>`. Only `/record-evidence` may add ` --baseline` before the artifact argument. Nothing follows the fence. Codex users type `$<skill-name>`; the fence still shows `/`.

The two lines before the fence are always `Next action:` and `Open a new session in {run_location}, then run:`. A terminal reply has no command fence; it ends with the current state and any prerequisite action in plain prose.

The new session opens in the same task worktree, where the uncommitted task directory lives; the user pastes the fence there, and `@<file>` is a path relative to that worktree's root. Fill `{run_location}` from observed git state, never a guess: in git work tree, `` `<root>` on branch `<branch>` `` where `<root>` is `git rev-parse --show-toplevel` and `<branch>` is `git rev-parse --abbrev-ref HEAD`; when the worktree was skipped and the project is not a git work tree, `this checkout`. A reply states only the worktree and branch it is actually in.

## Typed judgments

`typed-judgment/judge.mjs` asks the TypeSafe System One model a typed question about prose and prints one word, or JSON with `--json`; thresholds live in the helper. Only a skill step that names the command calls it. The helper is optional: without a key (`TYPESAFE_API_KEY`, or the key file its skill names), without `node`, or on a nonzero exit, the caller applies its own documented fallback (a deterministic check or its own reading) and says once in the reply that judgments were skipped. Only what the step names leaves the machine, never other code, diffs, or secrets. Record the answer word and confidence in the artifact where the template has room.

## Answer template placeholders

Answer templates under `references/` fill every placeholder before printing. The catalogue is in [placeholders.md](placeholders.md).

## Commits

PR target resolution is the existing PR base, then `task.md` `base:`, then the default branch. Tools that need a base commit take the first of these that resolves: `base:`, the upstream, then `origin/HEAD`.

Task directories and artifacts are local, ignored working state shared by phases in one task worktree. Never stage or commit task-root files, including task.md, index.json and iterations or change the project `.gitignore`. Code commits stage explicit code paths; never `git add -A` or `git add .`.

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

Validate the subject before committing: it must match `^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9][^\n]*[^.\n]$` and be at most 72 characters. A subject that fails is rewritten, never committed. The repository's own commit rules (`AGENTS.md`, `CLAUDE.md`, commit lint, validator script) also apply to body and trailers and override the runtime's default attribution trailer. A pull request title is a subject under the same rule: the GitHub Commits workflow runs `check-commits.mjs --title` on it, and a title that fails is shortened or rewritten before the pull request is opened or retitled.

## Child workers

For a role `agent-<role>`, start a worker whose first instruction is to read and follow the installed `agent-<role>` skill's `SKILL.md` (in a checkout, `skills/delivery/agent-<role>/SKILL.md`), give it the assignment text, wait, and read its final message. Verify its claims against the repository before using them.

The runtime section in an installed skill names the mechanism. Without one, worker roles run inline and say so.

## Phase isolation and context budget

An orchestrating session (`deliver`) may keep one context across phases and delegate to child workers. A phase run by hand starts in a new session and reads only `task.md` and its selected artifacts. A reviewer always starts fresh: it gets `task.md`, the plan phase, the acceptance criteria and a commit range, never the builder's transcript.

Artifacts and git carry memory between sessions, not the conversation. Put everything the next session needs in the task directory (`## Status`, `## Decisions`, the plan's `## Progress`) before printing the reply.

Read budget for one phase, in order: `task.md`; the selected primary artifacts, completely; `summary` only from other artifacts; repository files through child workers where the skill provides them, and directly only the files the phase must edit or cite. Never paste a worker's full message into an artifact or reply; extract facts with `path:line` pointers. If context degrades (re-reading files, contradicting the artifact, dropping a constraint), persist the state and print the resume handoff. Interactive phases (`iterate-*`, `create-prd`, `create-tdd`, `review-artifact-comments`) save the artifact after every accepted change.

