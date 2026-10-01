---
name: describe-pr
description: Run for /describe-pr requests. Create or update the pull request description for the current task.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Pull Request Description

Create or update the PR description only after current, recorded behavior evidence can be published in both the description and a distinct PR comment.

## Workflow

### 0. Load context

Locate the task directory and read `task.md` per the conventions before reading other files; select current artifacts from `index.json` (scan numbered files only for a legacy task without an index). For an existing delivery whose local task is absent, locate its original worktree; never invent a retrospective baseline. A standalone request may open metadata under the resolved root, but final delivery publication still requires authentic current evidence.

Read from this skill directory:

- `references/pr_description_template.md`
- `references/show-me.md`
- `references/pr_walkthrough_example.html` (user wants HTML walkthrough only)
- `references/pr_description_final_answer.md`

### 1. Read template

Read `references/pr_description_template.md`. Keep the full body: Purpose, optional task acceptance criteria, Special things to note, Evidence with Recorded tests, Change outline, and Human Review (Review targets, Verify, Known limits). Never publish a provisional/minimal body as final. No changelog, local verification report, plan appendix, or long narrative.

The Evidence section is required for every delivery PR: one real hosted recording per required surface, exact tested/head revisions, per-test result and cue, a distinct comment permalink on this PR. A direct URL and a claimed MIME or `passed` result are not proof.

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

Read `task.md` or `ticket.md`, explanatory metadata selected through current index records, and `@file` inputs. Require current hosted proof and read current `review.verification` when present. Enumerate required UI, CLI, API, and agent surfaces from the task and change, not file extensions. Inspect every capture at its direct supported host: a GitHub user-attachment or raw gist, with actual video bytes and playback for UI, or original invocation, tested SHA, successful exit/status/outcome, and observed output for text. A PNG, HTML page, self-reported prose, or URL/MIME alone does not prove a recording. Require a substantive passing Recorded tests row with timestamp/output-line cue for each surface and passing rows for every required behavior. A failed or required-untested target blocks `result: passed`. Confirm tested code SHA and current PR head; behavior-changing differences require recapture.

For a delivery task, run `node <skills-dir>/deliver/contract.mjs status <task-dir>` before final publication. Require authentic baseline/policy, current verification and clean review when required, current sealed recording and inspection; only Hosted PR description may remain missing. Source changes invalidate those prerequisites. Report verification items and review findings inline, never as task-file links. Failed or required-untested surfaces and unverified hosted captures block ready publication rather than becoming a caveat.

Read full diff plus surrounding code. For `/deliver`, inspect the diff stat and the approved slicing decision against shared/SLICING.md; generated files and lockfiles count separately. Recut an oversized hand-written change into independently reviewable children before publication.

If the task has a plan, start a child worker for role `agent-implementation-reviewer` with the assignment "Compare <plan path or task dir> with the current implementation against <base>. Return only reviewer-relevant deviations." (see the conventions' Child workers section); wait for it; read its final message. Use only findings you have read from the worker's final message.

Verify important child worker claims against the diff.

### 4. Write description

Template exactly:

- `Purpose`: one sentence.
- `Special things to note`: one to three bullets. `- None.` when no warnings, migrations, constraints, omissions, surprises.
- `Acceptance criteria` (only when `task.md` lists them): one bullet per criterion in task order, each naming the command, request, or observation that decides it. A criterion this diff does not satisfy is listed with what is missing; never drop one.
- `Evidence`: exact `- result: passed`, `- tested: <full code SHA>`, `- current head: <full PR head SHA>`, `- recording: <ui-video|cli-terminal|api-probe|agent-session>`, `- capture: <direct URL>`, `- comment: <distinct permalink on this PR>`. For mixed surfaces use matching `- recording <label>: <type>` and `- capture <label>: <URL>` pairs, with distinct lowercase-hyphenated labels. The separate PR comment repeats tested/head SHA and each recording/capture pair exactly. Include `### Recorded tests` with `| Test | Result | Capture | Cue |`, a substantive `passed` row per pair (`primary` for unlabeled) and a timestamp or output-line cue. Show caveats and nonpassing results honestly; never label the whole result passed with a failed or required-untested target.
- `Change outline`: compact structural view from `references/show-me.md`. Views that help: data shape, endpoint contract, pseudocode, file tree, component tree, call/control/data flow. `diff` for changes, full shape for new. Focus on files, calls, fields, components, boundaries.
- `Human Review`: keep `### Review targets`, `### Verify`, and `### Known limits` with concrete review and approval checks; human approval remains separate from recording proof.
- `Closes #{ISSUE_NUMBER}`, the template's last line: keep it only when `task.md` has `issue: <number>` (an epic child whose issue `start-epic-delivery` opened), filled with that number, so the merge closes the issue; otherwise delete the line and the blank line before it, so the body ends with the Known limits bullet.

Task metadata and review/verification artifacts may remain local, but the PR body must not link their repository-relative paths as proof. Raw recording, report and PR-description files belong outside the resolved task root. Immutable evidence/review metadata and seals remain local there; never upload or commit them. Put reviewable observations and limits in the body itself.

Do not include walkthrough artifacts in the PR body unless asked. When requested, create a separate HTML walkthrough from `references/pr_walkthrough_example.html` with real diff nodes outside the task root, and publish only its approved hosted link.

### 5. Save and publish

Prepare a provisional body in a temporary file outside the task directory. A pending comment is allowed only in a draft PR while hosting a missing capture; never call it final. When no task exists, open one under the resolved task root for metadata only. Create the draft PR with `gh pr create --draft --base <base> --body-file <temporary-path> --title "<title>"`, or update an existing draft with `gh pr edit <number> --body-file <temporary-path>`.

For every required surface, host the actual recording at a supported direct destination and inspect its content as in step 3. Post a **separate** PR comment repeating `- result: passed`, full tested and current-head SHAs and every recording/capture pair exactly. Use `gh pr comment <number> --body-file <temporary-path>` for already-hosted captures, or the authenticated PR comment box to upload and verify a user attachment first. Editing the PR body does not count as a comment. On updates, edit the previous evidence comment or post a replacement explicitly superseding it; obtain the exact permalink on this PR and read back that comment by ID.

Insert the verified comment permalink in the final body, publish the complete template with every capture and Recorded tests row, then re-fetch the whole body and separate comment. Compare revisions, types, URLs, per-test results/cues and required sections; verify every capture is still the original recording. Remove transient description drafts after successful readback. Retain sealed captures, samples and provenance attachments at their recorded external paths for resumable delivery; removing them invalidates local seals. Never upload or commit task-root data. If publication fails, leave the PR draft and report incomplete.


Before changing a draft to ready, run the collection's proof command from the repository root:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number>
```

The command validates local review and optional verification metadata against hosted PR head/base, full body, specific same-PR comment, every declared capture's actual bytes/content and recorded tests. It does not read or require a local evidence or PR-description receipt. `stale` requires new review/capture after behavior changes; `incomplete` requires repairing missing hosted proof.

The Claude plugin offers an optional Bash `PreToolUse` guard when `SKILLS_PUBLICATION_TASK_DIR` names this task directory: direct `gh`/`./gh pr create --draft` can host capture but cannot pass final proof, and `gh pr ready [number]` requires the shared decision above. Direct shell calls outside Claude, unsupported tools/runtimes, and out-of-band GitHub publication are not guarded; perform this skill's proof and read-back steps regardless of hook registration. Unsupported targeted Bash PR syntax is denied in the selected task.

When a draft exists solely to host a capture that has not yet been uploaded, the provisional check is:

```bash
node shared/publication-proof.mjs <task-dir> <repo-root> <pr-number> --draft-host-capture
```

This may return `allowed: true` with `ready: false` and `status: "incomplete"` only for an existing draft PR. It does not authorize final body publication or ready status. After uploading and verifying the capture, complete the ordinary comment/body ordering above and run the final decision again.
Re-fetch the PR and confirm URL, title, number, base, head, complete hosted template, every recording/capture pair, Recorded tests rows, and same-PR comment. Retitle an existing PR that fails the title rule with `gh pr edit <number> --title "<title>"`. Mark a draft PR ready only after the proof command passes. If upload, comment, link verification, capture inspection, or final-body readback fails, publication is incomplete.

When task.md carries slack_run_id and you own the run, send `run event` with the observed PR URL and next current-head checks; do not finish a run whose requested follow-up remains. Direct feature-thread visibility updates only its existing root per agent-slack-control-plane. Slack failures are reported without changing publication outcome unless Slack was requested as a gate.

### 6. Report

Read and use `references/pr_description_final_answer.md`, linking to the hosted PR instead of a task-local artifact. Include PR URL, file-change summary, deviation summary or `No plan file found`.

The final answer must end with exactly one fenced `text` block. Under `/deliver`, the orchestrator continues the authorized chain; in standalone use, running the next command records human approval.

## Feedback

When feedback arrives, read the live PR body, confirm every hosted recording still covers its required surface at the current head, and publish a complete revised body directly. Behavior-changing feedback requires recapture and updating every affected recording/capture pair and the distinct PR comment first. Never save raw evidence or a description under the task root; current sealed evidence metadata is selected from its immutable series.

## Style

- Engineer to engineer.
- Reviewable in one pass.
- Risk before summaries.
- No filler, slang, unexplained acronyms.
- For unsupported Git remotes or evidence hosts, explain that this gate supports only GitHub user-attachments and raw gists; arrange explicit support before claiming ready publication. Never report an arbitrary HTTPS URL as gate-approved.
