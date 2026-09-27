---
name: describe-pr
description: Run for /describe-pr requests. Create or update the pull request description for the current task.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Pull Request Description

Create or update the PR description only after current, recorded behavior evidence can be published in both the description and a distinct PR comment.

## Workflow

### 0. Load context

Locate the task directory and read `task.md` per the conventions before reading other files; select current artifacts from `index.json` (scan numbered files only for a legacy task without an index). When no task directory matches the request, open one under the resolved task root as in step 5.

Read from this skill directory:

- `references/pr_description_template.md`
- `references/show-me.md`
- `references/pr_walkthrough_example.html` (user wants HTML walkthrough only)
- `references/pr_description_final_answer.md`

### 1. Read template

Read `references/pr_description_template.md`. Keep body in template. No changelog, verification report, plan appendix, long narrative.


The template's `## Evidence` section is required for every delivery PR. Keep its capture and separate comment URLs.

### 2. Identify or create PR

Discover the pull request and diff with `git` and GitHub CLI (`gh`):

```bash
git status --short --branch
gh pr view --json url,title,number,baseRefName,headRefName
git diff --name-status <base>...HEAD
git diff <base>...HEAD
```

`<base>` is the existing pull request's base, else `base:` from `task.md` when present, else the repository default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`).

If no PR exists, inspect branch status and committed changes. Commit and push only when required: code commits stage explicit code paths; uncommitted task artifacts go in their own `docs(task): <artifact type> artifact` commit per the conventions' Commits section. Require a current `evidence.recording` receipt and hosted capture before making the PR ready for review. If GitHub's PR upload is the only available host, a draft PR may be created solely to host the capture; return to `/record-evidence` to verify the URL and complete its receipt before writing the final description. If `gh` is unavailable or unauthenticated, report the missing prerequisite; do not claim publication.

The title is a Conventional Commits subject under the conventions' rule: `<type>(<scope>): <description>`, lower-case description, no trailing period, at most 72 characters including the type and scope. Write it for the change as a whole, not the first commit. Before creating or retitling, run `node scripts/check-commits.mjs --title "<title>"` when the repository has that script; otherwise count the characters and match the pattern yourself. A title that fails is shortened or rewritten; it is never sent to GitHub, because the `Commits` check fails the pull request on it.

### 3. Gather context

Read `task.md` or `ticket.md`, explanatory artifacts selected through current index records, and `@file` inputs. Require the current `evidence.recording` receipt for this task and read its complete contents, plus current `review.verification` when present. Check the actual hosted video or non-UI capture URL opens to readable recorded behavior, its result is not failed, and every required acceptance behavior has a passing capture. Check its tested code SHA against the current PR head (or branch HEAD before PR creation): artifact-only commits may advance HEAD, but any behavior-changing difference requires `/record-evidence` again before publishing. An absent, inaccessible, failed, untested-required, or stale capture blocks this skill, including oneshot, bugfix, and child PRs. An untested optional verification item is disclosed, never described as passing.

Read full diff plus surrounding code.

If the task has a plan, start a child worker for role `agent-implementation-reviewer` with the assignment "Compare <plan path or task dir> with the current implementation against <base>. Return only reviewer-relevant deviations." (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.

Verify important child worker claims against the diff.

### 4. Write description

Template exactly:

- `Why the change`: one sentence.
- `Special things to note`: one to three bullets. `- None.` when no warnings, migrations, constraints, omissions, surprises.
- `Acceptance criteria` (only when `task.md` lists them): one bullet per criterion in task order, each naming the command, request, or observation that decides it. A criterion this diff does not satisfy is listed with what is missing; never drop one.
- `Evidence` (required): the recorded result and tested code SHA, one bullet per UI video or non-UI terminal/API/performance/agent capture with its verified hosted URL, plus the URL of a **distinct** PR comment carrying the same capture. A local report path is supplementary, never the publication link.
- `Change outline`: compact structural view from `references/show-me.md`. Views that help: data shape, endpoint contract, pseudocode, file tree, component tree, call/control/data flow. `diff` for changes, full shape for new. Focus on files, calls, fields, components, boundaries.
- `Closes #{ISSUE_NUMBER}`, the template's last line: keep it only when `task.md` has `issue: <number>` (an epic child whose issue `start-epic-delivery` opened), filled with that number, so the merge closes the issue; otherwise delete the line and the blank line before it, so the body ends with the Known limits bullet.

Task artifacts are committed on the branch, so the body may link their canonical task-root-relative paths when `git ls-files <task-root>/<slug>` lists them; ignored local capture paths are not reviewer-accessible links.

Do not include walkthrough artifacts in the PR body unless asked. When requested, create a separate HTML artifact from `references/pr_walkthrough_example.html`, fill it with real diff nodes, write it under the task directory, and save it.

### 5. Save and publish

Prepare a provisional body in an untracked temporary file outside the task directory and artifact index. Include the verified hosted capture URL and identify the separate evidence comment as pending; this body is only for opening or updating a draft PR, never the final description or a committed task artifact. When no task exists, open one under the resolved task root first. Create the draft PR with `gh pr create --base <base> --body-file <temporary-path> --title "<title>"`, or update an existing PR with `gh pr edit <number> --body-file <temporary-path>`. Preserve all earlier indexed `pull-request.description` iterations when updating a PR.

Post a **separate** PR comment with the hosted capture URL, result, tested code SHA, and current PR head SHA. Use `gh pr comment <number> --body "<text>"` for an already-hosted URL, or the authenticated PR comment box to upload video and verify its hosted URL first. Editing the PR body does not count as a comment. On review updates, edit the prior evidence comment or add a new distinct comment. Obtain and read back its permalink and content, confirming that the comment links to the capture.

Only now allocate and record the **one** next indexed `pull-request.description` iteration through the conventions' Recording an artifact flow. Write the final body with both the verified hosted capture URL and evidence-comment permalink in `## Evidence`; the artifact has no frontmatter. Commit its returned canonical path and `index.json` explicitly as `docs(task): pr-description artifact`, then push. Re-fetch the resulting PR head SHA and edit the **same** evidence comment to name that final head SHA alongside the tested code SHA and capture URL; read the comment back before publishing the body with `gh pr edit <number> --body-file <final-path>`. This comment edit does not create a Git commit and preserves the artifact's recorded permalink. Remove the provisional temporary file; do not index, stage, or commit it. Never rewrite an earlier iteration. If publication fails, repair publication of this recorded final body rather than allocating a duplicate iteration.


Before changing a draft to ready, run the collection's proof command from the repository root:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number>
```

Use the actual task directory, repository root, and PR number. The command validates current indexed artifact records, compares the receipt and clean review revisions with Git HEAD, checks that any advancement contains only indexed task artifacts, and reads the hosted PR, comment, and published body through `gh`. It prints JSON with `status`, `reason`, and `ready`; mark ready only for `status: "pass"` and `ready: true`. `stale` requires fresh evidence/review for the changed code; `incomplete` requires repairing missing proof and rerunning the command. An explicit `--override "<reason>"` records the requested reason in output but can never produce pass or authorize ready.

When a draft exists solely to host a capture that has not yet been uploaded, the provisional check is:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number> --draft-host-capture
```

This may return `allowed: true` with `ready: false` and `status: "incomplete"` only for an existing draft PR. It does not authorize final body publication or ready status. After uploading and verifying the capture, complete the ordinary comment/body ordering above and run the final decision again.
Re-fetch the PR and confirm URL, title, number, base, head, and that the published body matches the final indexed artifact and its rendered `## Evidence` section links to both the playable/readable hosted capture and the distinct comment. Confirm again that the comment links to the capture. Retitle an existing PR that fails the title rule with `gh pr edit <number> --title "<title>"`. Mark a draft PR ready only after the checks pass. If upload, comment, link verification, or body matching fails, publication is incomplete; repair it before reporting success.

### 6. Report

Read and use `references/pr_description_final_answer.md` exactly. Include PR URL, file-change summary, deviation summary or `No plan file found`. Fill `{artifact_link}` with the saved canonical task-root-relative path.

The final answer must end with exactly one fenced `text` block. This is a human gate; running the next command records approval.

## Feedback

When `pull-request.description` already has a current iteration and feedback arrives, use it as input, confirm the current evidence still covers the head, record the revised body as the next iteration, and publish that new path so the pull request body matches. Behavior-changing review feedback requires a new `evidence.recording` iteration and updated hosted capture in both description and separate PR comment first; metadata-only edits may reuse the verified capture. Never rewrite a recorded iteration. A legacy task without `index.json` follows the conventions' legacy rules.

## Style

- Engineer to engineer.
- Reviewable in one pass.
- Risk before summaries.
- No filler, slang, unexplained acronyms.
- Use `gh` for GitHub remotes; otherwise report the branch, base, and description path for a manual pull request.
