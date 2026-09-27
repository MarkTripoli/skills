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

If no PR exists, inspect branch status and committed changes. Commit and push code with explicit paths when required; task metadata remains local and ignored. Require readable hosted proof in the PR description and a distinct comment before making the PR ready for review. If GitHub's PR upload is the only available host, a draft PR may be created solely to host the capture; return to `/record-evidence` to verify the hosted proof before writing the final description.

The title is a Conventional Commits subject under the conventions' rule: `<type>(<scope>): <description>`, lower-case description, no trailing period, at most 72 characters including the type and scope. Write it for the change as a whole, not the first commit. Before creating or retitling, run `node scripts/check-commits.mjs --title "<title>"` when the repository has that script; otherwise count the characters and match the pattern yourself. A title that fails is shortened or rewritten; it is never sent to GitHub, because the `Commits` check fails the pull request on it.

### 3. Gather context

Read `task.md` or `ticket.md`, explanatory metadata selected through current index records, and `@file` inputs. Require current hosted proof and read current `review.verification` when present. Check the actual hosted video or non-UI capture URL opens to readable recorded behavior, its result is not failed, and every required acceptance behavior has a passing capture. Check its tested code SHA and current PR head binding before publication.

Read full diff plus surrounding code.

If the task has a plan, start a child worker for role `agent-implementation-reviewer` with the assignment "Compare <plan path or task dir> with the current implementation against <base>. Return only reviewer-relevant deviations." (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.

Verify important child worker claims against the diff.

### 4. Write description

Template exactly:

- `Why the change`: one sentence.
- `Special things to note`: one to three bullets. `- None.` when no warnings, migrations, constraints, omissions, surprises.
- `Acceptance criteria` (only when `task.md` lists them): one bullet per criterion in task order, each naming the command, request, or observation that decides it. A criterion this diff does not satisfy is listed with what is missing; never drop one.
- `Evidence` (required): explicit `- result: passed`, `- tested: <full code SHA>`, `- current head: <full PR head SHA>`, `- capture: <direct hosted URL>`, and `- comment: <distinct PR comment permalink>` fields. Name tested behaviors and caveats here; never link a local report or task file as evidence.
- `Change outline`: compact structural view from `references/show-me.md`. Views that help: data shape, endpoint contract, pseudocode, file tree, component tree, call/control/data flow. `diff` for changes, full shape for new. Focus on files, calls, fields, components, boundaries.
- `Closes #{ISSUE_NUMBER}`, the template's last line: keep it only when `task.md` has `issue: <number>` (an epic child whose issue `start-epic-delivery` opened), filled with that number, so the merge closes the issue; otherwise delete the line and the blank line before it, so the body ends with the Known limits bullet.

Task artifacts and capture files are local and ignored, so the PR body must not link to their repository-relative paths. Link the hosted capture and distinct evidence comment; put the concise reviewable behavior and limits in the body itself.

Do not include walkthrough artifacts in the PR body unless asked. When requested, create a separate HTML artifact from `references/pr_walkthrough_example.html`, fill it with real diff nodes, write it under the task directory, and save it.

### 5. Save and publish

Prepare a provisional body in a temporary file outside the task directory. Include the hosted capture URL and mark the separate evidence comment pending; this body opens or updates a draft PR only. When no task exists, open one under the resolved task root first. Create the draft PR with `gh pr create --draft --base <base> --body-file <temporary-path> --title "<title>"`, or update an existing PR with `gh pr edit <number> --body-file <temporary-path>`. Never save the body in task artifacts.

Post a **separate** PR comment with `- result: passed`, `- tested: <SHA>`, `- current head: <SHA>`, and `- capture: <hosted URL>`. Use `gh pr comment <number> --body-file <temporary-path>` for an already-hosted URL, or the authenticated PR comment box to upload video and verify its hosted URL first. Editing the PR body does not count as a comment. On review updates, edit the prior evidence comment or add a distinct replacement. Obtain its permalink and read back the exact comment by ID.

Add the verified comment permalink and explicit fields under `## Evidence` in the final body, update the PR from the temporary file, and read back both hosted locations. Confirm the head and tested revisions, result and capture URL agree. Remove the temporary file and scratch capture after verified hosting. Never upload or commit files from `.agent/tasks/` or `.agents/tasks/`. If publication fails, leave the PR draft and report incomplete.


Before changing a draft to ready, run the collection's proof command from the repository root:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number>
```

The command validates current local review and optional verification metadata against the hosted PR head, base, capture, explicit tested/result/head fields, and specific separate comment. It does not read or require any local evidence or PR-description receipt. `stale` requires new review/capture after code changes; `incomplete` requires repairing missing hosted proof.

The Claude plugin offers an optional Bash `PreToolUse` guard when `SKILLS_PUBLICATION_TASK_DIR` names this task directory: direct `gh`/`./gh pr create --draft` can host capture but cannot pass final proof, and `gh pr ready [number]` requires the shared decision above. Direct shell calls outside Claude, unsupported tools/runtimes, and out-of-band GitHub publication are not guarded; perform this skill's proof and read-back steps regardless of hook registration. Unsupported targeted Bash PR syntax is denied in the selected task.

When a draft exists solely to host a capture that has not yet been uploaded, the provisional check is:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number> --draft-host-capture
```

This may return `allowed: true` with `ready: false` and `status: "incomplete"` only for an existing draft PR. It does not authorize final body publication or ready status. After uploading and verifying the capture, complete the ordinary comment/body ordering above and run the final decision again.
Re-fetch the PR and confirm URL, title, number, base, head, and the published `## Evidence` fields and separate comment. Retitle an existing PR that fails the title rule with `gh pr edit <number> --title "<title>"`. Mark a draft PR ready only after the proof command passes. If upload, comment, link verification, or body readback fails, publication is incomplete.

### 6. Report

Read and use `references/pr_description_final_answer.md`, linking to the hosted PR instead of a task-local artifact. Include PR URL, file-change summary, deviation summary or `No plan file found`.

The final answer must end with exactly one fenced `text` block. This is a human gate; running the next command records approval.

## Feedback

When feedback arrives, read the live PR body, confirm the hosted proof still covers the head, and publish the revised body directly. Behavior-changing review feedback requires recapture and updated hosted capture in both description and separate PR comment first. Do not save an evidence or description iteration under the task root.

## Style

- Engineer to engineer.
- Reviewable in one pass.
- Risk before summaries.
- No filler, slang, unexplained acronyms.
- Use `gh` for GitHub remotes; otherwise report the branch, base, and description path for a manual pull request.
