---
name: video-iterative-orchestration
description: Centralize ticket-scoped delivery decisions and delegate execution through isolated, resumable ticket branches using video-iterative-development.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Video-Iterative Orchestration

**Skill Type: Rigid** — preserve ticket scope, interrupted work, dependency ancestry, and evidence gates. Ordinary failures enter recovery; they do not end an implementation attempt.

## Purpose and ownership

Turn a Jira epic, GitHub Issue queue, or explicit requirement list, optionally narrowed to named tickets, into a durable delivery queue. Each selected ticket or correction gets an exclusive implementation agent and worktree. Before dispatch, the orchestrator selects the backend-only, frontend-only, or cross-layer scope and supplies a complete execution contract. Every implementation agent uses `video-iterative-development` to execute that contract and produce its verified submission.

The orchestrator delegates execution, not decision authority. It exclusively owns source interpretation, ticket scope, product behavior, repository and layer selection, dependency order, branch and PR topology, deviations, blocker disposition, lifecycle state, final acceptance, and ticket reporting. It invokes rather than restates its companions:

- `resume-and-reconcile.md` owns interrupted-work discovery and mapped-source change detection.
- `extract-figma-visuals` owns Figma hierarchy selection, export, and bundle validation.
- `feature-conformance` owns source authority, decision records, traceability, and delivery-claim validation.
- `video-iterative-development` owns assigned implementation, recovery mechanics, evidence, and submission. It returns observations and structured decision requests; it does not change the execution contract or assign delivery states.
- `agent-implementation-reviewer` owns an independent read-only plan-to-diff report. The orchestrator applies the feature-contract adapter without changing that shared reviewer.
- [The engineering guidance review](references/engineering-guidance-review.md) examines the final diff against applicable repository conventions. It records concrete consequences and justified exceptions without turning preferences into new ticket requirements.

## Decision authority

A consequential decision is any choice that changes source interpretation, scope, product or design behavior, participating repositories or layers, dependency order, branch or PR topology, required evidence, an approved deviation, blocker disposition, or final ticket state. The orchestrator makes and records every consequential decision before dispatch or in response to a worker request. Automatic source resolutions authorized by this skill are orchestrator decisions too.

Implementation agents may choose only reversible, repository-conventional mechanics that leave the execution contract unchanged, such as local code organization, command ordering, deterministic selector details, or how to diagnose and retry an in-scope failure. When instructions are incomplete, conflicting, or require a consequential choice, the worker must not guess, expand scope, contact the prompter, or assign itself a terminal state. It returns a structured `decision_request` to the orchestrator and continues all unaffected assigned work.

## Inputs

- A Jira epic key/link, GitHub Issue queue, or explicit prioritized requirement list. Resolve the selected queue from the request; do not require Jira for a GitHub or tracker-neutral run.
- For correction mode, a read-only findings Markdown document.
- Repository roots when they cannot be discovered from the workspace.
- An optional read-only design document or link. Architecture is a document subtype, not a separate input category.
- Optional read-only Figma root-frame links containing `node-id` for applicable UI tickets.
- An optional request to coordinate the run through Slack, including one explicitly named channel or an explicit request for a direct-message run. Without either destination, `slack-coordinator` uses the repository default.
- Any explicit external authority or deadline.

Do not request a feature ID, contract file, approval flag, Figma revision, or layer classification. Missing optional Figma or design-document context is not a blocker.

When Slack coordination is requested, invoke `slack-coordinator` directly as part of the orchestration; do not spawn a separate Slack agent or pane. Use one Slack run and thread for the orchestration. The orchestrator is the sole Slack liaison and the sole consumer of its `run_id`; implementation agents report to the orchestrator and never call the coordinator or consume owner input themselves.

After read-only intake resolves the epic and selected tickets, inspect an existing ledger for an active coordinator `run_id`. Resume that run when present. Otherwise confirm that the executable is available and call `run start` before the first state-changing action, using the epic as the work, the requested outcome as the goal, and the selected tickets as the scope. Pass `--channel` only for the single channel explicitly named in the current instruction, pass `--dm` only when the prompter explicitly requests a direct-message run, and otherwise let the coordinator use the repository default. Record the returned `run_id`, channel, thread timestamp, and permalink in the ledger at its first permitted write. Never start a second coordinator run merely because a ticket starts, resumes, retries, or changes owner.

Run `run check` immediately before every orchestrator state-changing action and immediately before each dispatch or follow-up that authorizes implementation work. Exit `0` permits the action. On exit `10`, apply, answer, or reject the owner input with `run resolve`, then check again. On exit `11`, pause, retry after a short wait, and report the reason; never mutate state, dispatch work, or fall back to another Slack path while coordination is unavailable. Exit `12` is the operator's explicit break-glass decision and permits the run to continue without further Slack calls.

Use `run event` for orchestration phase changes, ticket lifecycle changes, and blocker starts or clears; the daemon owns quiet-interval status reposting. Call `run finish` once when the orchestration reaches its terminal completed, failed, or cancelled outcome. Follow the standalone skill's command, channel-selection, message, and failure contracts rather than restating or weakening them here. When Slack coordination was not requested, do not start a run and do not add Slack gates.

## Select the run mode

Use **delivery mode** without findings: read [the Jira delivery workflow](references/jira-delivery-mode.md) for Jira, or [delivery mode](references/delivery-mode.md) for GitHub and tracker-neutral queues. Use **correction mode** when the selected queue includes a findings document. Read [the correction workflow](references/correction-mode.md).

In either mode, run [resume and source reconciliation](references/resume-and-reconcile.md) before creating a worktree. For Jira, status is decisive: `In Progress` and `Code Review` are `resume_required` and must adopt existing work rather than start from base.

## Ticket scope and design authority

The selected ticket's requirements and acceptance criteria define the boundary of work. The epic supplies membership, order, and dependency context; it is never assumed to contain every behavior represented in Figma or a design document. Map only Figma nodes and document sections that clarify a selected ticket. Unmapped design content is context, not missing, deferred, or out-of-scope work.

Within the ticket boundary:

1. mapped Figma is the default authority for visual and interaction behavior, including ambiguous or conflicting ticket details;
2. mapped Figma overrides a conflicting design document automatically;
3. without applicable Figma, a mapped design document resolves ambiguous ticket details;
4. repository and API conventions resolve remaining implementation details.

Record each automatic resolution in `.agent-evidence/orchestration/<run-id>/decision-log.md`. Pause only the affected ticket for the rare unresolved choice whose alternatives materially change product scope or user behavior. An explicitly approved departure from the authoritative sources is an `approved_deviation`; ordinary implementation decisions and Figma resolutions are not deviations.

Create one run-level design-document manifest at `.agent-evidence/orchestration/<run-id>/design-documents/manifest.json`. It records source identity, whole-document SHA-256, and stable IDs, titles, and SHA-256 values only for sections mapped to selected tickets. `feature-conformance` references this manifest; it does not create another one.

For every supplied UI root, invoke `extract-figma-visuals` before dispatch and pass its validated bundle to applicable workers. A supplied Jira, Figma, or design-document source that remains unreadable after access checks and materially different retries blocks only the affected ticket. Never substitute stale content, a recreated mock, or guessed requirements.

## Establish run state

Before dispatch:

1. Create or continue one goal for the selected epic work. Keep it active while any ticket has recoverable or independent work.
2. Inspect repository guidance, current status, worktrees, ticket branches, open PRs, generated-code rules, and documented verification commands. For an existing PR, identify its source worktree and the reason if that worktree is unusable. For cross-layer work, resolve the participating repositories' documented compound launch configuration into its complete process topology: every command, argument, working directory, environment source, dependency order, port, health/feature probe, migration/fixture step, client-generation step, runtime define, and Android Patrol command. Pass the selected worktree, verification commands, and resolved topology to the implementation agent. A repository-documented IDE compound is a topology definition, not an instruction to invoke the IDE.
3. Resolve tickets and dependencies through the selected tracker's authenticated interface, then run resume/source reconciliation. Jira uses Jira MCP; a GitHub or explicit-list run preserves its own scope and status authority.
4. Extract and validate applicable Figma bundles. Create the single design-document manifest when supplied.
5. Invoke `feature-conformance` in preflight mode. Repair agent-generated schema or mapping errors and rerun it; do not present them as ticket blockers.
6. Resolve the explicit task directory or configured task root. Use immutable indexed receipts as described below. Create an ignored ledger, `decision-log.md`, and the rebuildable `resume-state.json` and `source-index.json` caches. Jira, Git, PRs, current manifests, and current source reads remain authoritative when caches are absent or stale.
7. Build the dependency table and record owner, selected scope and unchanged layers, adopted or new write surface, PR target, source mappings, contract rows, orchestrator decisions, evidence gate, canonical-runtime lease state, recovery state, and final state. When Slack coordination is enabled, also record its `run_id`, channel, thread timestamp, permalink, and current coordination state at run level.

Use canonical `snake_case` machine states: `ready`, `waiting`, `resume_required`, `resume_needs_lineage`, `resume_source_missing`, `active`, `source_update_detected`, `reconciliation_active`, `correction_active`, `needs_product_decision`, `locally_verified`, `submitted`, `submitted_verified`, and `blocked`.

## Preserve indexed records and proof

`index.json` is authoritative for task artifacts. Record contract receipts as `feature-contract` (`design.contract`), conformance as `feature-conformance` (`review.conformance`), proposed blockers as `delivery-disposition` (`delivery.disposition`), and verified submission receipts as `submission-closure` (`delivery.closure`). Allocate a new immutable iteration for every durable revision, binding its exact JSON snapshot path/hash, ticket, source head and relevant contract/review record. Select and digest-validate current records before using them; invalid indices never fall back to scans. Use the adjacent optional task-artifact helper or the exact manual conventions. Only genuinely unindexed legacy tasks use numbered records.

The run ledger, resume inventory and source index are rebuildable operational caches, not replacements for immutable acceptance or review receipts. Raw visual bundles and captures remain excluded local evidence. GitHub PR body, distinct evidence comment, direct hosted capture and current-head readback remain publication authority; never weaken installed publication hooks or baseline/current proof requirements.

## Isolate and stack ticket work

Give each active implementation agent one exclusive worktree and branch in every repository it modifies. Never share a mutable checkout or discard interrupted changes.

- Adopt the selected source for `In Progress` and `Code Review` tickets, including a dirty worktree whose changes belong to that ticket.
- Create new work only for eligible tickets without adopted work.
- Create a dependent branch from its prerequisite's verified submitted remote head.
- Target a dependent PR at that prerequisite branch so the PR contains only its ticket's delta. Record the stacked ancestry.
- Reuse an existing correction PR source branch and PR. Recreate only a checkout of that exact branch when its old worktree is unusable.
- Never reset, clean, stash, force-push, or rewrite interrupted work merely to simplify setup.
- Sequence overlapping write surfaces or create a dedicated integration ticket branch.

A submitted prerequisite branch is sufficient for downstream implementation, local verification, and submission. Use its source checkout to regenerate the client and a local path dependency when needed. Do not wait for its merge, pipeline, or generated-client publication before implementing, testing, recording evidence, pushing the assigned dependent branch, or creating or updating its PR.

## Control commits and pushes

The orchestrator defines each ticket's durable commit groups and named push boundaries before dispatch. Every assignment carries this default standing authorization unless the prompter explicitly narrows it:

```yaml
push_policy: final_verified_batch
final_push_authorized: true
checkpoint_pushes: prohibited
additional_boundary_authority: orchestrator
missing_boundary_state: decision_request_not_blocked
```

`final_push_authorized: true` is both permission and an instruction to push the ticket's coherent final batch after its assigned local verification and evidence gates pass. The worker does not ask the prompter or orchestrator to approve that final push again. Before those gates pass, it remains `active` or in recovery with local changes; the absence of an earlier push is never a blocker.

Preserve adopted history and any required lineage merge, but do not turn remote history into a diagnostic checkpoint log. A push boundary may publish several locally verified commits together. A branch already being published makes its existing remote commits immutable under this workflow; it does not require later experiments or recovery edits to be committed or pushed individually.

Authorize a push only when another ticket needs the remote head as a dependency, the ticket is ready for PR submission or evidence attachment, or a coherent review correction is ready for re-verification. Runtime leasing, evidence preservation, an individual debugging discovery, and fear of losing local work are not push boundaries. If a worker needs another boundary, it returns a `decision_request`; it does not push first and explain afterward.

Do not authorize history rewriting merely to repair excessive commits that are already remote. Prevent the pattern before the first push; preserve existing remote history unless the prompter separately authorizes a rewrite.

## Select a portable runtime mode

Choose the repository's documented local setup. Record `runtime_mode: isolated_local` when each ticket can safely own its own local runtime; use `runtime_mode: shared_canonical` only when the repository actually documents a shared singleton topology. The lease rules below apply only to the shared mode. Neither a dev container, IDE compound, company host, nor company port layout is required. In either mode, bind runtime probes and evidence to the assigned source commits and stop only processes owned by the assignment.

## Serialize the canonical full-stack runtime

Branches and worktrees may progress in parallel, but a repository-documented canonical full-stack dev container is one singleton runtime lane. Only one ticket may mount its source, start or restart services, apply migrations or fixtures, authenticate, run Android E2E, or record evidence there at a time. Source isolation never authorizes runtime isolation.

The orchestrator owns the runtime lease:

1. Keep tickets without the lease on source-only work. When they have exhausted that work, record them as `waiting` for the runtime; waiting for the lease is not a blocker or a recovery failure.
2. Grant the lease to exactly one ticket and record its repository worktrees, exact commits, resolved canonical process topology, start or switch commands, standard ports, environment source, migration and fixture commands, host-side probes, Android-facing connectivity or version probe, and required evidence.
3. Require the lease owner to deploy those exact sources through the repository's canonical dev-container topology. Launch every configured process directly with the available shell and retained-session tools. Do not inspect the host for, install, or invoke VS Code, `code`, or another editor launcher; editor availability is irrelevant. The compound launch configuration is the source for the process topology, and executing all of its commands with the same arguments, working directories, environment, dependency order, and ports is the canonical launch. Do not authorize another backend instance, alternate ports, a CORS or forwarding bridge, host-header rewriting, or a launch that reconstructs only part of the topology. Runtime contention never permits one of these workarounds.
4. Before Android E2E, verify the mounted source and commit, the documented runtime environment, applicable migrations and fixtures, the canonical port, host-side health and feature probes, and the Android-facing connectivity or version probe. Then require seven successful ADB samples across 60 seconds; every sample must report the assigned device as `device` and `sys.boot_completed` as `1`. Abort before Patrol if any sample fails. A host-side health response alone does not prove the emulator path.
5. Release the lease after the ticket's final runtime-dependent checks and evidence capture. The owner stops its runtime and recorder processes and returns the exact deployed commits, commands used, migration and fixture state, probe results, evidence paths, stopped-process status, and any persistent local state the next owner must account for. Do not destroy or reset persistent data unless repository guidance or the assignment authorizes it.
6. Validate the release report before granting the runtime to the next ticket. The next owner redeploys and verifies its own exact branch or commit; it never trusts source or process state left by the prior owner without those checks.

If later correction work needs the runtime again, return that ticket to the runtime queue. Do not retain the lease while waiting for a pipeline, review, merge, or publication.

A preflight can detect an incomplete launch before Patrol; prevention requires the participating repositories' test launchers to reject missing required configuration before starting. When a ticket includes this harness repair, assign one repository-owned local E2E entry point that invokes the backend and Patrol launchers with the complete documented environment. Route local E2E runs through it and remove fallback flags or partial launch steps that can start tests without required values. Require a positive launch check and a negative check that deliberately omits each required setting and fails before the backend or Patrol starts. On failure, record the source commit, sanitized launch-command identity, environment source, effective non-secret host and port, and an allowlisted present/missing map of required settings. Never record secret values, full environments, secret-bearing arguments, or unkeyed hashes of secrets.

## Dispatch contract

Dispatch builders in fresh sessions with no inherited conversation (`fork_turns: "none"` where supported). Resolve the repository's exact compatible model profile through `route-model`: builder mutation uses `economy`, and independent reviewers use the strongest compatible candidate. Never hard-code a company model identifier, route a reviewer to economy, or share a builder's session with its reviewer. If a configured model cannot be selected, record the mismatch and correct routing before dispatch; without a profile, report that no model is enforced. When workers are unavailable, read the role skills and perform the bounded work inline, recording that independent session isolation was unavailable rather than pretending a reviewer was delegated.

Every implementation assignment must contain:

- queue identity, selected ticket/requirement, implementation child when present, observed tracker status, and verbatim requirements and acceptance criteria; a Jira Story remains the QA scope;
- the orchestrator-selected backend-only, frontend-only, or cross-layer scope, unchanged layers, observable behavior, API contract when applicable, and explicit non-goals;
- adopted branch/worktree/PR or new branch ancestry, base/head SHAs, dirty-state fingerprint, and exclusive write surface;
- the participating repositories' engineering guides and exact verification commands, including any schema and client generation commands and generated-output checks; for an existing PR, use its worktree unless the ledger records a concrete reason it is unusable;
- prerequisite submitted commits and stacked PR target;
- applicable design-document manifest mappings and assertions;
- applicable Figma URL, bundle/metadata paths, selected images, node IDs, and warnings;
- applicable repository UI rails, read-only component inventory, intended PR base for changed-line diagnostics, and required public-component stories or reviewed goldens;
- when requested for a UI-affecting ticket with mapped Figma, the non-blocking golden assignment described below, including its target package, relevant widget or page state, mapped frame, and wide-screen/web-layout viewport;
- feature-contract path/version, relevant rows, resolved decisions, source-change state, and evidence requirements;
- observable outcome, correction finding when applicable, and the required handoff packet;
- explicit authority to commit and push the assigned ticket branch, create or update its PR, and upload its final evidence; these normal submission actions need no separate prompter approval;
- the managed-approval protocol: attempt each authorized external action, use the command runner's scoped approval mechanism when required, never ask the prompter for conversational confirmation, and preserve an explicit tool denial for focused recovery;
- the commit plan: expected durable product/test groups, required adopted-history or lineage reconciliation, and named push boundaries, plus the explicit `push_policy`, `final_push_authorized`, `checkpoint_pushes`, `additional_boundary_authority`, and `missing_boundary_state` values above;
- the canonical-runtime lease state; when granted, the exact source commits, resolved process inventory from the documented compound launch configuration, direct shell commands, working directories, dependency order, standard ports, environment source, migrations and fixtures, required host-side and Android-facing probes, and release-report fields; when not granted, an instruction to continue source-only work and request the lease without changing runtime state;
- when the selected ticket includes launch-harness repair, the repository-owned backend and Patrol launch paths, required-setting names, safe failure-fingerprint fields, and positive and deliberately incomplete startup checks;
- the project-local Android runner command, assigned device serial, exact project-local ADB preflight command, seven-sample/60-second stability rule, and the final-evidence capture contract: wait for the passing preflight and a known stable app UI before recording; exclude non-required emulator boot, build, install, launcher, app startup, and login footage; and use one unstacked one-second presentation hold per evidence checkpoint;
- an instruction to follow repository guidance and invoke `video-iterative-development`;
- the worker authority boundary and required `decision_request` fields: observed condition, conflicting or missing assignment clause, evidence, exact decision needed, affected work, and unaffected work continued.

Do not dispatch vague work, delegate a consequential choice, or ask the prompter to choose backend versus frontend scope. Resolve a returned `decision_request`, record the decision, and send a focused contract amendment to the same owner.

Do not pass the Slack coordinator `run_id` to implementation agents. The orchestrator checks the gate before dispatching or amending their assignments and represents their verified state changes through run events, preventing multiple agents from competing for one owner-input queue.

A worker request for the prompter to say “go ahead” before an assigned push, PR operation, evidence upload, or requested Slack update is an invalid handoff, not a decision request or blocker. Return it to the same owner with a focused instruction to attempt the exact action through the runtime's managed approval mechanism. Accept an external-action failure only when the worker provides the exact redacted denial from that attempted mechanism; keep the ticket non-terminal and continue unaffected work.

A worker that treats the final push as unauthorized, or treats a missing additional push boundary as `blocked`, has violated the assignment. Return it to the same owner with the standing final-push authorization or resolve its `decision_request` for an additional boundary; do not ask the prompter to authorize an ordinary assigned-branch submission.

## Enforce repository UI rails

Require repository engineering, component-inventory, localization, semantics, generated-output, and validation guidance before UI implementation. Reuse public design-system controls and tokens, keep service access in owning layers, and report justified exceptions. A reusable component addition must stay within assigned scope or return a `decision_request`. Required component stories and reviewed goldens follow the repository's own tooling and environment; do not install company-specific MCP servers, package paths, lint commands, or golden infrastructure as defaults here. Missing repository-required rail evidence returns to recovery before `locally_verified`.

## Collect optional feature golden proof

When the repository supports golden tests and the assignment requests supplementary visual proof, assign one best-effort golden using its documented workflow for a UI-affecting ticket with mapped Figma. Scope it to the smallest relevant widget or page state that demonstrates the ticket's visual result. A high-level composition that visibly corresponds to the mapped Figma frame is sufficient; do not require an exhaustive matrix of screens, states, viewports, or interactions solely for this proof. Preserve the repository's required theme coverage for the selected subject.

Include a wide-screen/web-layout viewport when generating the golden. Treat it as Flutter widget-composition proof for that responsive layout, not as browser-runtime or interaction proof. Recordings on the assigned Chrome and Android surfaces remain the required real-flow evidence; an iOS surface uses its repository-documented runner when explicitly assigned.

When the golden can be produced, require the worker to:

1. use fixed fixtures and the package-owned `test/goldens/` helper;
2. run the repository's documented golden-update command, inspect every task-related PNG, run its golden-verification command, and repeat the update to confirm there is no further task-related PNG diff;
3. commit only the reviewed task-related test and baseline files; and
4. attach or link the reviewed wide-screen/web-layout PNG in the PR alongside the final Android recording, naming the mapped Figma frame and the widget or page state it proves.

This extra feature golden and its upload are non-blocking supplements; the required public-component golden above is separate. If setup, rendering, fonts, dependencies, the optional golden command, or its upload fails, record the exact command, failure, and any artifact that was produced; remove partial failing golden-only changes from the ticket's final diff; and continue the required implementation, conformance, Android evidence, and submission work. A missing optional golden must not prevent `locally_verified`, `submitted`, or `submitted_verified`, trigger a blocker disposition, or invalidate otherwise sufficient Android proof. Do not describe a successful golden that exposes a product or Figma mismatch as a generation failure; route that mismatch through ordinary conformance recovery.

## Recovery and blockers

Keep agents working through ordinary implementation, build, test, authentication, emulator, selector, dependency, and evidence failures using `video-iterative-development`'s recovery loop. A worker reports `recovery_exhausted` or a `decision_request`, never `blocked`; the orchestrator decides whether focused recovery, a contract amendment, or a proposed blocker is warranted. Continue unrelated tickets whenever one ticket pauses.

Do not accept Android evidence produced by forcing connectivity, authentication, navigation, or equivalent product state.

Treat Patrol's `device offline` result as `android_harness_unstable`, not as authentication or product evidence. Invalidate that run and its recording, restart only the canonical assigned emulator, rerun the complete seven-sample/60-second preflight, and retry Patrol once. If the retry fails, require `recovery_exhausted` with the ADB and Patrol evidence; do not authorize application or authentication changes to compensate.

Runtime contention remains `waiting`. Reject a worker-created alternate backend, port, bridge, proxy, host rewrite, or partial manual relaunch; revoke the invalid runtime attempt, preserve its source work, and return it to the canonical-runtime queue.

After exhausting safe recovery, the orchestrator may propose `blocked` only for:

- a supplied authoritative Jira, Figma, or design-document source that cannot be read;
- required access, a long-lived credential or renewal facility, or an external service that is demonstrably unavailable;
- an operation that would be destructive or exceed assigned authority;
- a rare unresolved product choice that materially changes scope or user behavior;
- `resume_source_missing` after exhaustive discovery, or `resume_needs_lineage` when equally authoritative sources remain;
- an unrecoverable repository state outside the assigned write surface.

The worker's recovery report names the exact condition, evidence, materially different recovery attempts, affected work, unaffected work continued, and the authority or action needed. A first failure, missing short-lived test code, ordinary ambiguity, contract-generation mistake, unanswered message, merge-conflict indicator, or missing evidence is not a blocker.

Before accepting `blocked`, write and validate the proposed disposition using [the delivery-disposition gate](references/delivery-disposition.md). Repair an invalid disposition and return the ticket to its existing owner as focused recovery work. Do not mark or report the ticket blocked until the validator accepts it.

Reject these conditions as blockers even when a worker labels them terminal:

- waiting for a prerequisite backend PR to merge, release, or publish its generated client;
- a pending or failed PR pipeline, regardless of whether its cause is known;
- unset local shell variables or Dart defines, an expired or absent short-lived invite code, or a renewal request that has not completed the documented local-auth diagnosis;
- reusing or restarting the selected feature backend, or applying its repository-documented migrations and required test fixtures to local test data;
- an unavailable IDE, editor executable, IDE task runner, or compound-launch UI; workers must not probe for these launchers and must execute the complete documented process topology directly;
- permission to commit or push the assigned ticket branch, create or update its PR, or upload its final evidence;
- waiting for the already-authorized final verified-batch push boundary, or needing an orchestrator decision about an additional push boundary;
- a merge-conflict indicator, missing proof, or another recoverable delivery step.

Unset runtime values prove only that the current process has not received its test configuration. Before an authentication blocker can be accepted, the owning agent must inspect the repository's documented fixture or credential source and injection path, attempt the documented local renewal flow against the effective local backend, and classify the failure from redacted request and server/client evidence. Never infer that the facility is unavailable from environment inspection or a `401` alone.

Keep launch reproductions separate from the original failure. If a manually launched API returns `400` for the emulator host while the API launched with the complete documented environment returns `401` without a key and `200` for renewal, that comparison identifies a configuration-sensitive reproduction. It does not establish the cause of an earlier `400` whose effective environment was not captured. Use the safe launch fingerprints above to diagnose future failures, and return an incomplete-launch finding to the repository-owned harness repair rather than treating a preflight probe alone as prevention.

Do not publish a provisional blocker while its recovery is still under review. If a worker or Slack status has already described a condition that recovery resolves, emit the blocker-clear event immediately, update the run's status card without replacing its fixed Slack root, keep the ticket non-terminal, and return the same owner to the next incomplete step. A stale public status never justifies stopping the run.

## Conformance, submission, and completion

Before claiming `locally_verified` or later, invoke `feature-conformance` and read [the feature-contract review adapter](references/feature-contract-review.md). Use the adapter to prepare a row-scoped review plan and invoke an independent, unchanged `agent-implementation-reviewer` that did not implement the ticket. The reviewer returns its standard plan-to-diff report; the orchestrator alone maps that report and the named evidence to contract outcomes. Return gaps to recovery.

Also run [the engineering guidance review](references/engineering-guidance-review.md) against the ticket's final diff and applicable repository guides. Use a read-only reviewer distinct from the implementation owner when the runtime supports one; otherwise perform the read-only pass inline and record that limitation. Send evidence-backed, in-scope defects to the same owner for correction, then rerun affected verification and focused review. A justified departure from a repository preference is advisory, not a delivery failure. The orchestrator records each finding's disposition and keeps the review tied to the final diff.

Before accepting `submitted`, independently probe the remote branch, PR, required final proof references, any successful wide-screen/web-layout golden proof, and requested Slack-coordinator event, write the resulting receipt, and run [the submission-closure gate](references/submission-closure.md). Repair invalid receipts or return missing required actions to focused recovery. A failed or absent non-blocking golden is recorded rather than repaired as a submission gap. A worker statement, local path, successful local command, or pending conversational confirmation cannot replace this gate.

Apply `jira-issue-hierarchy` Story QA-readiness checks separately from submission. An implementation Subtask is ownership, not the QA acceptance unit; submitted PRs and local evidence alone do not make its parent Story ready for QA.

The orchestrator must review final proof on every assigned UI surface before accepting it. Reject and re-record proof containing non-required emulator boot, build, install, launcher, app startup, or login footage, or stacked presentation holds beyond the one-second pacing rule; a passing Patrol result does not override this evidence gate. When the non-blocking golden succeeded, also review the wide-screen/web-layout PNG against its mapped Figma frame and verify that the PR presents it alongside the Android recording.

`submitted` requires the final commit on the remote source branch, the PR against its intended base or prerequisite branch, and final proof links in the PR description. Record any PR pipeline status already available without waiting for it. A reported merge conflict is metadata only; this workflow does not merge or resolve target-branch conflicts.

`submitted_verified` is terminal for a ticket. It requires `submitted` and successful delivery-mode conformance. A green, pending, missing, or failed PR pipeline does not change this state or delay goal completion. If an already available pipeline result reveals a defect in the submitted change, record the finding for a separate correction; do not reopen the delivery gate solely to make CI green.

Never merge, deploy, rotate secrets, edit CI/CD, mutate Figma or supplied documents, or rewrite remote history unless the prompter separately authorizes that action.

## Separate submission from merge readiness

`submitted_verified` closes the ticket's submission lifecycle, not its PR checks, merge authority, or QA handoff. Preserve the repository's required current-head CI and hosted-proof gates. Claim `merge_ready` only after known conflicts are absent and required checks pass. Backend changes require green CI; a frontend generated-client exception is valid only when repository policy explicitly allows a directly linked unmerged backend dependency, with exact failing-job and API/client evidence. Unrelated failures never qualify. Diagnose in-scope defects, report external check failures separately, and never merge without explicit authority.

## Final report

Report each selected ticket's canonical state, branch ancestry, PR target and URL, required evidence, non-blocking golden result or recorded failure, conformance result, any pipeline status already available, recovery summary, and genuine blocker when present. Report merge-conflict status as PR metadata. State which submitted branch unblocked each dependent ticket and which work remains parallelizable. When Slack coordination was enabled, include the run thread permalink and final coordination outcome.

## Related skills

- `video-iterative-development`
- `extract-figma-visuals`
- `feature-conformance`
- `agent-implementation-reviewer`
- `slack-coordinator`
- `jira-issue-hierarchy`
- Repository-documented Git worktree procedure
