# Delivery mode

Use this mode when a run starts from a prioritized GitHub Issue set or another explicitly identified requirements list. The requester may narrow a parent issue or provide selected items; if the parent issue is the agreed queue, inspect its linked issues and include all eligible in-scope requirements unless narrowed. Do not infer ticket hierarchy or permissions from labels alone. A requirement's own text and acceptance criteria define its scope; parent descriptions provide grouping, order, and dependency context only.

When GitHub Issues are used, retrieve the current issue content, comments that clarify acceptance, linked issues, project status, and relevant pull requests through the available authenticated GitHub interface. Validate that each selected issue belongs to the stated queue and inspect dependency links. If required issue access is unavailable, report the precise external blocker before dispatch. Do not invent issue content or substitute stale copied text.

For a tracker-neutral run, use the requester-supplied requirement list as the queue of record. Preserve IDs, ordering, acceptance criteria, and dependency links as supplied. Record the source and revision/location in the run ledger. Ask for repository roots only when they cannot be discovered; do not ask the requester to classify work as backend, frontend, or cross-layer.

## Scope and acceptance

The selected requirement's stated behavior and acceptance criteria define delivery scope. A parent issue, project roadmap, PRD, or broad feature statement gives context but must not broaden, replace, contradict, or block the selected work. Record mismatches as context; pause only for a material conflict with supplied architecture/design or repository reality. Preserve unrelated branches and worktrees.

Each selected requirement is its own acceptance unit. If implementation is tracked in a child issue, subtask, or local work item, it records ownership and implementation scope; it does not replace the parent's acceptance criteria. Reuse a suitable existing item rather than creating duplicates or changing its parent. Follow the selected tracker or repository's own status-transition policy; do not guess transitions or change statuses beyond the run's authority. Record actual changes in the ledger.

Inspect each requirement and its existing linked work for acceptance criteria, dependencies, architecture documents, design references, pull requests, and repository context. A selected requirement can lead to a backend pull request, frontend pull request, or both. Keep unrelated requirements in separate changes. Follow repository branch naming and pull-request conventions; include the relevant issue links where supported.

## Queue and dependency policy

Respect explicit dependency links and ordering. A narrowed request does not erase a dependency: inspect it, sequence against verified branch and pull-request state, and record any genuine external dependency that cannot be satisfied by selected work.

Parallelize only after inspecting every affected repository and proving there is no code, API-contract, generated-client, runtime, or branch-ancestry dependency. The orchestrator chooses the smallest implementation scope after repository inspection. A downstream frontend may use a locally generated client from a verified submitted backend branch; do not wait for merge or publication when local integration is sufficient. Keep publication and other release gates distinct from local integration.

Use ordinary pull requests as submission units. Mark a requirement `submitted` only when its clean final commit is on the remote source branch, the pull request targets the intended branch, and applicable proof links are present. Mark `merge-ready` only after conflict and required CI gates pass. Follow the repository's documented exception policy for directly dependent generated APIs; do not treat unrelated failures as exceptions. Deployment and approvals are non-blocking unless the requester explicitly makes them gates.
