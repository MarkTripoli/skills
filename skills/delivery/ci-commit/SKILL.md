---
name: ci-commit
description: Run for /ci-commit requests. Create focused Conventional Commits for completed work.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Commit Changes

Create commits for completed work. Every message is a Conventional Commit per the conventions' Commits section. No approval pause; this skill is the commit step.

## Process

### 1. Locate the task

Locate the task directory and read `task.md` per the conventions, creating the task worktree and task record when none matches the request. Use its slug and current `index.json` to allocate any receipt. Read only files needed for the work.

### 2. Review changes

```bash
git status --short --branch
git diff
```

Inspect staged. Read changed files. Decide one or multiple commits.

Do not stage scratch files, dummy scripts, one-off tests, or unrelated output. Keep the configured task root out of code commits; commit task changes separately per the conventions.

### 3. Plan commits

Group by purpose, one type per commit. For each commit write the subject `<type>(<scope>)!: <description>`:

- `type` from the change itself: new behavior `feat`, corrected behavior `fix`, restructure without behavior change `refactor`, tests only `test`, docs only `docs`, build or dependency files `build`, pipeline files `ci`, everything else `chore`.
- `scope`: the package, module, or directory that owns the change; omit when none dominates.
- `!` plus a `BREAKING CHANGE:` footer when a public contract changes.
- `description`: imperative, lower-case, no trailing period; state the reason over the file list when the reason fits.
- Body: why the change was needed and anything a reviewer cannot see in the diff. Omit when the subject says it all.

Examples: `feat(cli): add --verbose flag for command tracing`, `fix(parser): keep trailing slash in base urls`, `refactor!: replace callback api with promises`.

Unrelated edits: leave unstaged, mention. Mixed file: ask how to split unless obvious.

### 4. Validate the subject

Before every commit, check the subject line against the conventions' pattern:

```bash
printf '%s' "<subject>" | grep -Eq '^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9][a-z0-9-]*\))?!?: [a-z0-9].*[^.]$' && test "$(printf '%s' "<subject>" | wc -c)" -le 72
```

A failing subject is rewritten and re-checked; it is never committed. When the repository has its own commit lint (`commitlint` config, a `commit-msg` hook, `.gitmessage`, or a `CONTRIBUTING.md` rule), read it and satisfy its stricter rule too.

### 5. Execute

```bash
git add <path> <path>
git commit -m "<subject>" -m "<body>"
```

Never `git add -A`, `git add .`, broad staging. Verify with `git log -1 --format='%s%n%n%b'` that the recorded message matches what was validated; a hook that rejects the commit is a blocker to report, not to bypass with `--no-verify`.

### 6. Save receipt

Useful: record the next immutable `delivery.commit` iteration through the conventions' Recording an artifact flow using `references/commit_template.md`. Commit its canonical path and `index.json` explicitly as `docs(task): commit artifact`.

Read and use `references/commit_final_answer.md` exactly. Fill `{artifact_link}` with the saved canonical task-root-relative path; when no receipt was saved, write `none`. End with a single fenced `text` command. A legacy task without `index.json` follows the conventions' legacy rules.

## Rules

- Use current session context; do not ask the user to restate it.
- Focused commits, one type each, Conventional Commits subjects.
- Artifact files never share a commit with code.
- Failed tests, unsafe git: blockers.
