# Post-ready native review

After each PR is marked ready, run this independent read-only review on its current effective change. Keep `submitted_verified` separate; this review does not retroactively invent a delivery or pipeline gate. Record exact source and target SHAs, ticket, model, deployment status and approved temporary decisions. A changed head invalidates anchors and requires a current review.

## Prepare the effective change

Use an isolated temporary detached worktree at the pinned target SHA and simulate merging the pinned source without touching or pushing either published branch. For a stack use its immediate parent as target. Compare the resulting tree to the pinned target: this excludes work already incorporated through squash merges. Record tree identity and the diff being reviewed. A clean simulation may use `git merge --no-ff --no-edit <source-sha>` in that temporary checkout only.

If the merge conflicts, retain the conflict observation and possible dependency order, stop that PR's effective review, and continue independent work. Do not resolve conflicts merely to manufacture a reviewable diff or report them as code defects. Remove only the clean temporary checkout you created after preserving its receipt; preserve unexpected dirty state for reconciliation.

## Use a native reviewer when available

Prefer Claude Code's built-in `/code-review` in the prepared checkout on the strongest compatible configured model. For headless use, `claude -p --model <resolved-review-model> "/code-review high <target-sha>...HEAD"`. Confirm that the returned review actually covers the prepared target/source and effective diff. Read actual `CLAUDE.md`, `AGENTS.md` and maintained engineering guidance; do not assume a named file is loaded automatically. Leave `--fix` and `--comment` off while verifying candidates.

If Claude Code, its native command or the requested review model is unavailable, record that absence and use an independent read-only configured reviewer on the same prepared tree when authorized. Do not claim a native review occurred or silently substitute for an explicitly mandatory reviewer. No optional runtime is a universal infrastructure prerequisite.

Require a concrete failing scenario, changed-line anchor and evidence for every finding. Judge only newly introduced behavior, deployment facts and recorded decisions. Retract unsupported preferences and compatibility demands for mutable unshipped PR artifacts. Intent uncertainty becomes an owner question, not an invented requirement.

Post verified findings only within recorded comment authority and after checking their anchors against the pinned provider diff. GitHub defaults to its authenticated PR review/thread interface; optional GitLab uses individual discussions when inline feedback is requested. A native command's single summary note is not equivalent to anchored inline findings.

Return verified findings to the same ticket owner's correction flow, with exact source head and PR. Submission conformance and proof are reverified after changes. A current review receipt with no unresolved verified findings or product questions enables separately authorized landing; without landing consent the PR remains submitted. Review, approval and queued merge commands never prove an actual merge.
