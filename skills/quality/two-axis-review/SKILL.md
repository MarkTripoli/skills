---
name: two-axis-review
description: Reviews the changes since a fixed point on two separate axes, Standards (the repository's documented rules plus a code-smell baseline) and Spec (what the originating issue or spec asked for), in two fresh parallel workers and reports both side by side. Use when the user runs /two-axis-review, asks to "review since X", or says "review this branch against the spec and our standards"; not for the delivery workflow's evidence-backed review artifact (use review-code) or user-facing merge risk (use assess-merge-risk).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Two-axis review

Review `git diff <fixed-point>...HEAD` twice: once for **Standards** (does the code follow this repository's documented rules?) and once for **Spec** (does it build what was asked?). A change can pass one axis and fail the other, so the axes stay separate from start to report. This skill reads and reports only: it edits no file, commits nothing and posts no comment. Needs `git`; authenticated `gh` to read GitHub issues and PRs.

## Steps

1. **Pin the fixed point.** Use the ref the user named (SHA, branch, tag, `main`, `HEAD~5`); ask when none was given. Run `git rev-parse <fixed-point>`, then `git diff --stat <fixed-point>...HEAD` and `git log --oneline <fixed-point>..HEAD`. Stop here on a bad ref or an empty diff, before any worker starts.
2. **Find the spec source**, first match wins:
   1. An issue or PR reference in the commit messages (`#123`, `Closes #45`, `PROJ-123`): read it with `gh issue view <n>` or `gh pr view <n>`. A Jira key is read only when the user has a Jira integration.
   2. A path the user gave.
   3. The current PRD, TDD or plan in a task directory under the configured task root (default `.agents/tasks/`) whose name matches the branch.
   4. A spec file in `docs/` matching the branch or feature name.
   5. Otherwise ask the user. When there is none, the Spec axis reports "No spec available." and no Spec worker runs.
3. **Find the standards sources.** List every file that says how code is written here: `CONTRIBUTING.md`, `CODING_STANDARDS.md`, `AGENTS.md`, `CLAUDE.md`, style docs under `docs/`, lint configs. Add the [smell baseline](references/smell_baseline.md), which holds twelve labelled code smells and the two rules that bind them; load it now, because the Standards worker receives it in full.
4. **Start both workers together**, each in a fresh context, with the briefs below. When the runtime has no child workers, run the two passes yourself one after the other, finishing and writing down Standards before reading the spec, and label the report "Axes reviewed in one context, not independent."
5. **Report** with the format below. Do not merge, deduplicate or rerank findings across axes.

## Worker briefs

**Standards worker** gets the diff command, the commit list, the standards file paths and the full text of [smell_baseline.md](references/smell_baseline.md), and this brief:

> Report each place the diff breaks a documented standard, citing the file and the rule, and each baseline smell you see, naming it and quoting the hunk. Mark documented-standard breaches as hard or judgement; baseline smells are always judgement calls, and a documented rule overrides the baseline. Skip what linters or formatters already enforce. Cite `path:line`. Under 400 words.

**Spec worker** gets the diff command, the commit list and the spec text or path, and this brief:

> Report (a) requirements that are missing or partial, (b) behavior the diff adds that the spec did not ask for, (c) requirements that look implemented but wrongly. Quote the spec line for each finding and cite `path:line`. Under 400 words.

## Report format

```markdown
## Standards
<worker report, lightly cleaned>

## Spec
<worker report, lightly cleaned, or "No spec available.">

Standards: <n> findings, worst <one line>. Spec: <n> findings, worst <one line>.
```

The last line names the worst finding within each axis and picks no overall winner. For a durable, evidence-backed review artifact on a task, hand off to `/review-code` instead.
