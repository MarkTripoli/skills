# Answer template placeholders

Answer templates under `references/` use these placeholders; fill every one before printing.

- `{run_location}`: observed task worktree and branch in the fixed handoff sentence `Open a new session in {run_location}, then run:`. Fill `` `<root>` on branch `<branch>` `` from `git rev-parse --show-toplevel` and `git rev-parse --abbrev-ref HEAD`; use `this checkout` outside git. Fill it even when deliver owns the next stage, so the reply remains usable manually.
- `{artifact_link}`: relative Markdown link to the artifact this phase recorded, `[<kind>.<variant>.<NNNN>](<task-root>/<slug>/artifacts/<kind>/<variant>/<NNNN>.md)`; `none` when nothing was saved.
- `{artifact_file}`: that artifact's path relative to the worktree root, `<task-root>/<slug>/artifacts/<kind>/<variant>/<NNNN>.md`. Templates write `@{artifact_file}` in commands; the `@` is already there, so fill nothing but the path.
- `{summary}`: the saved artifact's frontmatter `summary`.
- `{review_check}` and `{known_limits}`: one line per item of the artifact's `### Verify` and `### Known limits` lists.
- `{source_file}`: the worktree-relative path of the current indexed plan or structure outline being implemented or checked (`planning.plan`, else `planning.structure`). With neither: the implementation receipt in `iterate-implementation`, and the verification or app-test artifact in the failed answers of `verify-implementation` and `test-app`. Same rule: path only, the template carries the `@`.
- `{next_command}`: research replies use `/create-design-discussion` for `full`, `/create-structure-outline` for `lean`, `/create-prd` for `prd`. Sources replies use `/create-prd` or `/create-tdd` when converting an existing product or technical document; otherwise use the chain's first skill for the saved workflow. `review-artifact-comments` replies use the command its type table names for the edited artifact. Delivery entry, completed implementation, fix, code-review-fixes, baseline and delivery-inspection replies use the command that skill's own instructions name; the baseline reply names task-only `/iterate-implementation` or the plan's implementation skill. A blocked or complete result has no next-skill fence. This placeholder never rewrites a literal command in another template: `research-questions` always hands off to `/create-research`, including in `lean`.
- `{implementation_command}`: `/implement-outline` for `lean`, `/implement-plan` otherwise; used by the plan, outline, and `iterate-implementation` replies.
- `{completed_phase}` and `{next_phase}`: phase numbers in implementation replies.
- `{child_slug}`, `{child_issue}`, `{child_start_command}`: epic delivery; see `start-epic-delivery`. `{child_issue}` is `#<number>` or `no issue`. `{child_start_command}` is the child's first manual skill followed by `<task-root>/<child slug>/`; for a oneshot child it is `/deliver <task-root>/<child slug>/` with an explicit instruction to use manual mode and implement before review. Each child starts in its own worktree cut from the epic branch in `task.md` `base:`.
- `{needed}`: one line per item of the artifact's `## Missing` list (the reproduction artifact in `reproduce-bug`, the app-test artifact in `test-app`).


Evidence templates also use hosted URL/result/cue fields and `{report_link}` for the external scratch report, never as publication proof. Baseline/current receipts are selected through `evidence.baseline`/`evidence.recording`; baseline handoffs may add `--baseline` before the single artifact argument.

Review follow-up outputs also use `{head_sha}` for the last inspected full head SHA, `{checks_state}` for observed current-head required checks, `{thread_count}` for actionable review threads and `{approval_state}` for the separately fetched review decision. No active monitor is claimed after the session ends.
