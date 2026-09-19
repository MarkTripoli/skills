---
name: review-code
description: Run for /review-code requests. Review the complete task diff and record only concrete findings.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Code Review

Review the complete code change without editing product code. Output is a durable artifact containing concrete findings or recording a clean review. The delivery workflow's review loop (or the user, by hand) alternates `/review-code` and `/fix-code-review` until a review is clean.

## Setup

Locate the task directory and read `task.md` per the conventions (create one from the request when none exists). Read `@file` args fully. Read `references/code_review_template.md`, `code_review_findings_answer.md`, `code_review_clean_answer.md`, `code_review_blocked_answer.md`.

## Pin scope

Determine merge target: the base of the existing pull request (`gh pr view --json baseRefName` on GitHub, `glab mr view` on GitLab), else `base:` from `task.md` when present, else the repository default branch. Record base branch, merge-base SHA, HEAD SHA, staged/unstaged changes, untracked task files, commits after merge base: `git status --short --branch`, `git diff --name-status <base>...HEAD`, `git diff <base>...HEAD`. Review committed/working-tree changes against merge base. Task artifacts under `.agents/tasks/` and unrelated changes are not review subjects. Stop if base unresolved. Empty or incomplete scope is not clean.

## Requirements and tests

Read `task.md`/`ticket.md`, the newest artifact of the implementation source type (prefer `plan`, then `structure-outline`, `tdd`, `prd`). Use artifact summaries to avoid opening unrelated documents. Read repo instructions, standards for changed files. Read changed/existing tests before judging. Check claims, boundaries, catches regression/requirement. Inspect commit/PR description; title stands alone, body explains behavior/motivation/decisions/evidence/limits. Record models when known.

When `task.md` lists acceptance criteria, decide each one against the diff and its tests. A criterion nothing in the change proves is a major-severity finding that names the missing check; a criterion the change contradicts is critical. When the task directory holds a `verification` artifact (newest `NN-verification-*.md`), read its items table first: a criterion it records as `pass` with a command and quoted output is proven and is not re-run here; its `fail` and `untested` items are findings to confirm against the diff, and its `## Findings` name the checks to read.

When the task directory holds an earlier `NN-code-review-*.md`, read only the `### CR-...` heading lines under its `## Critical and Required Findings`, and no finding body. Record each one in `## Previous Round` as `fixed`, `still open`, or `declined`, decided from the current diff and the fix round's recorded reason, never from the previous reviewer's reasoning. A `still open` entry is raised again under `## Critical and Required Findings` with a new identifier so the gate counts it; a finding the previous round did not raise is judged on its own.

## Review

Trace behavior through callers/tests. Evaluate every applicable axis:

1. **Correctness:** requirements, null/boundary cases, failures, test validity, state, races, retries, lifecycle, cleanup, idempotency, persistence, migrations, compatibility.
2. **Readability:** precise names, direct flow, organization, unnecessary abstractions, dead code. Conditionals on unrelated paths/repeated branching = structural concerns.
3. **Architecture:** patterns, ownership, dependencies, duplication, coupling, abstraction, boundaries. Refactors reduce concepts, not relocate.
4. **Security:** untrusted inputs, authorization, secrets, parameterization, encoding, provenance, boundary validation.
5. **Performance:** N+1, unbounded queries/loops, blocking async, unnecessary renders, missing pagination, hot-path allocations.

Interfaces: accessibility, keyboard/pointer, responsive, manual/screenshot evidence.

## Health and severity

Clean: improves health, satisfies task, follows conventions, no critical- or major-severity findings. Do not block on preference/perfection/non-blocking.

Classify each finding on three axes (CodeRabbit vocabulary; no live integration):
- Type: Nitpick (optional polish) | Potential issue (possible defect) | Refactor suggestion (structural improvement).
- Severity: critical | major | minor | trivial | info (guidance, not a problem).
- Category: Functional correctness | Security and privacy | Data integrity and integration | Performance and scalability | Stability and availability | Maintainability and code quality.

Gate on Severity: critical or major set `findings`. minor, trivial, and info are Advisories and do not prevent `clean`.
Migration from the old scale: Critical -> critical; Required -> major; Optional -> minor; Nit -> trivial (Type Nitpick); FYI -> info.

Lead with highest-leverage. Prefer proven to weak. Structural: name smallest fix (collapse branches, separate orchestration/policy, move to owner, reuse helper, explicit boundary, delete pass-through, extract module).

Size: ~100 easy, ~300 coherent, ~1000 check split. Signals. Require split when bundled/worsens oversized. Review complete scope.

Dependencies: verify stack insufficient, check lockfile/maintenance/license/security/changelog. One upgrade unless coupled.

Identify newly orphaned code explicitly. Orphaned: task-caused dead = major severity. No deletion of uncertain pre-existing without direction.

Report evidence-backed from change. Critical/major severity: id, file:line, failure, evidence, fix. Advisories: location, evidence, suggestion. No praise, enforced nits, speculation, pre-existing.

Run read-only checks to confirm/reject. No edits.

Verify tests/build/manual/screenshots. Green checks alone are not sufficient.

## Save

Take the next artifact number. Write `NN-code-review-<summary>.md` using template. Set `findings` when actionable remain, `clean` when none, `blocked` when gate failed. Blocked is not clean. Save the file.

Then run `node <skills dir>/typed-judgment/judge.mjs axis-coverage <the saved file> --json`, where `<skills dir>` is the directory that holds this skill (in a checkout, `skills/delivery`). Record each row's verdict, level, and confidence on that axis's `helper coverage` line, and the stderr provenance line under the heading. An axis that comes back `skipped` or `asserted` was not examined against the pinned scope: examine it, rewrite that section with evidence from the changed code or the reason the axis does not apply, save again, and run the command once more. Run it at most twice and record what the second run says. A finding the second pass turns up is a finding like any other and can change the status. Exit 3, no `node`, no `TYPESAFE_API_KEY`, or an `unclear` row: write `unavailable` on the lines it would have filled, decide those axes yourself, and say under `## Review Limits` that judgments were skipped.

Commit it with `git add <path>` as `docs(task): code-review artifact`.

## Next

- Findings: use `references/code_review_findings_answer.md`, next `/fix-code-review @<artifact>`.
- Clean: use `code_review_clean_answer.md`, next `/describe-pr`.
- Blocked: use `code_review_blocked_answer.md`, stop until gate runs.

Use template only. Fill `{artifact_link}` with a relative Markdown link to the saved file, `[NN-code-review-slug.md](.agents/tasks/<slug>/NN-code-review-slug.md)`. End with one fenced `text` command.
