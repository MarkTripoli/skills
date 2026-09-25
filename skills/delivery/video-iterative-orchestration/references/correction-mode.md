# Findings-driven correction mode

Use when a run starts from a read-only findings document and identified GitHub Issues or existing pull requests, not the original delivery conversation. Keep findings, architecture documents, and design files read-only; store run state under an ignored orchestration evidence directory.

The selected requirement's acceptance criteria define correction scope. An implementation child issue records ownership only; it is not a separate acceptance target. Parent issue or roadmap description provides queue context only. Do not create duplicate corrections, broaden scope, or treat a parent-versus-requirement mismatch as a blocker.

## Intake and classification

1. Read the selected issue/requirements, linked implementation items, and all findings. Resolve each cited repository, pull request, source and target branch, architecture section or design file/page/node, and supporting evidence. Check current remote pull-request state and source/target commit SHAs; do not trust stale local checkouts or prior-agent summaries.
2. Record one ledger row per finding: issue or requirement ID, finding ID, source-document location, affected pull request, source/target SHAs, expected state, observed drift, cited architecture/design evidence, candidate repositories, downstream requirements, state, owner, and replacement evidence.
3. Confirm the finding, selected requirement, repository reality, and supplied architecture/design agree. For a material conflict, set `needs-design-decision`, record it in architecture feedback, and ask for the smallest necessary decision. Do not guess a visual or cross-repository contract outcome.
4. Group findings only when they share a root cause and the same pull-request branch owner. Otherwise make ordered correction tasks; the orchestrator sets scope and dependencies.

## Mutable unmerged-pull-request boundary

Before dispatch, compare each affected pull-request source branch with its target. Artifacts introduced only by that unmerged change are mutable: edit, rename, or remove the original migration, API/client artifact, component, test, or configuration so the final pull-request diff is correct. Do not add compensating artifacts to preserve an intermediate implementation.

Artifacts already on the target branch, merged, deployed, or externally consumed follow the repository's normal compatibility and forward-migration policy. If origin is unclear, inspect merge base and source/target diff. Prefer a correction commit on the existing source branch; do not force-push or rewrite remote history without explicit authorization.

## Dispatch and branch ownership

Update the existing pull-request source branch and existing pull request by default. Reuse the original worktree and make the correction agent its exclusive writer. Do not create a correction branch, stacked pull request, parallel review path, or replacement worktree unless repository circumstances require it. Never modify the target branch. If the original worktree is genuinely unavailable or unusable, recreate a local checkout of the exact existing source branch and record why.

Give the agent the finding, expected-versus-observed behavior, cited source locations, existing pull-request URL and source/target SHAs, relevant architecture feedback, and explicit acceptance criteria. Require `video-iterative-development`, including fresh scope selection, repository-convention inspection, and real-user-path evidence rules. Replace invalid or superseded final evidence with proof of corrected behavior.

## Closure and downstream effects

For each correction, verify that the final pull-request diff matches the cited requirement/design, the correction commit is pushed to the existing source branch, and the pull-request description links replacement final proof. UI drift requires fresh reviewer-ready Chrome and Android evidence; backend drift requires renewed applicable contract proof. Re-check the specific finding and affected original acceptance criteria before marking it `resolved`.

Assess downstream worktrees created from a faulty source head explicitly: recreate from the corrected remote head, queue dependent corrections, or document why they are unaffected. Do not resolve a finding while known downstream impact remains open. Apply the orchestration pipeline policy before `merge-ready`; deployments and approvals remain non-blocking unless explicitly required.
