Task: `describe-pr-title-rule`

## Purpose

The `Commits` workflow checks the pull request title with `check-commits.mjs --title`, but `describe-pr` never checked the title it wrote, so PR #16 opened with a 74-character title and failed CI; `describe-pr` now writes the title as a Conventional Commits subject and runs that check before opening or retitling.

## Special things to note

- `check-commits.mjs --title <text>` with no range or message file used to exit 2 with "expected --message-file or a range". It is now a valid invocation, which is what the skill step calls; the CI and hook invocations are unchanged.
- The rule is stated in `shared/CONVENTIONS.md` under Commits, so every skill that opens a pull request reads it, not only `describe-pr`. `start-epic-delivery` and the epic children inherit it through the same sentence.
- Installed copies under `~/.agents/skills` and `~/.omp/agent/skills` predate this change; the installer refreshes them.

## Change outline

The title becomes a checked subject at the two points the skill touches the host.

```diff
 describe-pr step 2 (no PR yet)
+  title = <type>(<scope>): <description>, for the change as a whole, <= 72 chars
+  node scripts/check-commits.mjs --title "<title>"     fails -> rewrite, never send
-  gh pr create --base <base> --body-file <path>
+  gh pr create --title "<title>" --base <base> --body-file <path>
 describe-pr step 5 (PR exists)
   gh pr edit <number> --body-file <path>
+  title fails the rule -> gh pr edit <number> --title "<title>"
```

`parseArgs` accepts the title as the only target.

```diff
-  if (!options.messageFile && !options.range) throw ...
+  if (!options.messageFile && !options.range && options.title === null) throw ...
```

```text
scripts/check-commits.mjs                 --title alone; usage comment
tests/commits.test.mjs                    the PR #16 title fails at 74 chars; a short one passes
skills/delivery/describe-pr/SKILL.md      title rule in steps 2 and 5
shared/CONVENTIONS.md                     a pull request title is a subject under the same rule
.changeset/describe-pr-title-rule.md      patch
```

The check is prose the skill session runs; nothing in the suite proves a live `describe-pr` run performs it.

## Human Review

### Review targets

- `skills/delivery/describe-pr/SKILL.md:42-44`: the title is written for the whole change rather than copied from the first commit, and a failing title is rewritten locally rather than sent.
- `scripts/check-commits.mjs:54`: `--title` alone no longer throws; the CI range form and the hook's `--message-file` form are untouched.

### Verify

- [ ] `npm test` exits 0 with `pass 61, fail 0`.
- [ ] `node scripts/check-commits.mjs --title "feat(typed-judgment): retry transient failures, score review axis coverage"` exits 1 naming 74 characters; `--title "feat: one"` exits 0.
- [ ] This pull request's own title passes the `Commits` check.

### Known limits

- The validator checks skill structure and banned tokens; whether a session runs the title check before `gh pr create` is observed only in real runs.
