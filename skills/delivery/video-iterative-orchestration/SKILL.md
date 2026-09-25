---
name: video-iterative-orchestration
description: Orchestrate long-running, dependency-aware requirements or review corrections through isolated implementation worktrees, with verified video-iterative-development delivery gates.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Video-Iterative Orchestration

**Skill type: rigid.** Apply this process to every requirement. Do not fan out the whole list as a one-shot batch or declare an implementation agent blocked after its first failed attempt.

## Purpose and ownership

Turn an ordered requirement list into durable, dependency-aware delivery. Optionally use a read-only review findings document for correction runs. A selected requirement and its acceptance criteria remain the QA unit; a child issue or implementation task can track implementation ownership but cannot replace that acceptance. Each implementation agent owns isolated worktrees for every repository it changes and follows `video-iterative-development` for scope selection, E2E evidence, submission, and merge gates.

The orchestrator owns sequencing, isolation, durable state, recovery, integration, and delivery gates. The requester does not need to classify layers, split ordinary implementation work, or diagnose routine local failures.

## Optional Slack coordination

Slack is not a delivery prerequisite and no `deliver` or pull-request-description step invokes Slack automatically. Use the optional `agent-slack-control-plane` wrapper only when the orchestrator or requester explicitly opts in. Before dispatch, check `command -v slack-coordinator` and `slack-coordinator daemon status`; if the CLI or configured daemon is unavailable, leave Slack off and continue the delivery workflow.

When opted in, create one `slack-coordinator run` per requirement/work item before its first state-changing action. Record each returned `run_id` and thread permalink in that item's existing ignored ledger row. Use `run check` immediately before every state-changing action, resolve owner input through the CLI, report phase or blocker changes with `run event`, and close each run with `run finish`. The wrapper in `agent-slack-control-plane` defines the flow; its linked `slack-coordinator` command reference owns exact options and exit codes. The daemon alone handles Slack credentials and API access.

## Inputs

- A prioritized set of GitHub Issues or another explicit requirements list; a parent issue may define the queue when specified.
- For correction runs, a read-only findings document plus the affected requirement or pull request.
- Backend and frontend repository roots only when they cannot be discovered.
- Optional read-only architecture document or design link, inspectable through available tools.
- Any explicit external authority, deadline, or additional delivery gate.

Follow [delivery mode](references/delivery-mode.md) for queue intake and scope. Follow [correction mode](references/correction-mode.md) for finding intake, ownership, and closure. If repository roots are unknown, ask only for their locations; do not ask the requester to decide backend/frontend scope.

## Read-only design context

Architecture documents, Figma files, and findings are read-only inputs. Never edit or annotate supplied material. The orchestrator owns an append-only architecture-feedback record alongside the ignored run ledger. Record source revision/location, discoveries, proposed changes, agent feedback, evidence, affected requirements, and resolution state.

When a design file is supplied for a UI requirement, record its file/page/node, pass the relevant read-only link and architecture feedback to the implementation agent, and require inspection before UI implementation or visual review. When no external design context is supplied, use the selected requirement and repository conventions as the design source and record that fact. Backend-only work needs no design inspection. Pause only for a material unresolved conflict with requirements or repository reality; surface the smallest necessary decision rather than guessing.

## 1. Establish durable run state

Before dispatch:

1. Inspect the active coding-agent goal. If absent, create one covering the selected requirements, applicable pull requests, evidence gates, and CI gates. Keep it active through recoverable failures. Record item-level blockers and continue independent items; mark the overall goal blocked only when a genuine external condition prevents progress across the remaining goal. Mark complete only after every in-scope item reaches its final gate.
2. Inspect each relevant repository's `AGENTS.md`, `CLAUDE.md`, contribution guidance, local setup, test commands, generated-code rules, and Git status. Read supplied architecture material and inspect relevant design files only when supplied. Resolve selected requirements and their dependencies; derive scope from the selected requirement, not a broad parent description. In correction mode, resolve each affected pull request and current remote source/target heads before dispatch.
3. Create an ignored local ledger and a separate architecture-feedback record under an orchestration evidence directory. For every requirement record owner, state, repository scope, branch/worktree per repository, parent branch and commit, prerequisites, architecture revision/sections, feedback entries, design file/page/node, recovery attempts, evidence, and merge gate. Record the queue source and issue/requirement IDs. For correction mode also record finding ID, source document location, pull request, source/target SHAs, and resolution state.
4. Convert the ordered input into a dependency table containing ID, requirement, prerequisites, candidate repositories, parent branch/commit, state, and merge gate. Keep scope tied to the selected requirement; record parent-level mismatch as non-blocking context.
5. Use explicit lifecycle states: `ready`, `active`, `correction-active`, `locally-verified`, `submitted`, `merge-ready`, `blocked-pr-conflict`, `needs-design-decision`, and `blocked`. `locally-verified` means a clean committed branch with scoped evidence, not delivery. `submitted` means pushed source commit, pull request, and final proof links are verified. `merge-ready` additionally satisfies conflict and pipeline policy. A dependent item waits only until each prerequisite has a verified submitted remote commit that provides its needed interface; local integration need not wait for merge or package publication.

## 2. Isolate implementation agents

Give every implementation agent its own worktree and branch in each repository it changes. Use the repository's `.worktrees/` location and documented Git worktree procedure. Never share a mutable checkout between active agents.

- Independent work starts from a verified base branch and commit.
- Dependent work starts from the prerequisite's verified submitted remote branch head in every affected repository, not the original base or an unverified working directory.
- Correction work reuses the affected pull request's existing source branch and worktree by default; the correction agent is the exclusive writer and never changes the target branch. Recreate a local checkout of the exact source branch only when the original worktree is unavailable or unusable, and record why.
- Follow repository branch naming. Record parent SHAs and verify each worktree is on the intended branch and clean before dispatch.
- No two active agents may write the same branch, worktree, or file. Sequence overlap or define a separate integration requirement.
- One requirement affecting both backend and frontend belongs to one agent with paired worktrees. Do not touch an unrelated repository for symmetry.

A pushed backend source commit and client generated from that checkout are valid local backend-to-frontend integration inputs. A frontend may use a local path dependency for implementation, E2E, evidence, and submission. Do not wait for backend CI, merge, or client publication for local integration; enforce those gates separately for merge and release.

## 3. Dispatch contract

Every implementation assignment is self-contained and includes:

1. The requirement ID and verbatim behavior/acceptance criteria; selected issue links where applicable; correction finding, expected-versus-observed drift, cited review/design evidence, and affected pull request when relevant. State that the requirement is the acceptance scope and any child work item is implementation scope only.
2. Prerequisite commits, repository/worktree paths, parent SHAs, applicable architecture revision/sections, and relevant feedback entries. State whether architecture or design context was supplied; when absent, direct the agent to use the requirement and repository conventions.
3. Instruction to read repository guidance, preserve architecture/style/test/generated-code/runtime conventions, inspect both repositories, and follow `video-iterative-development` to choose the smallest scope independently. For corrections, apply the mutable unmerged-pull-request boundary and make the final diff correct.
4. Exclusive write surface, explicit out-of-scope areas, observable desired behavior, and evidence required to prove it.
5. Required handoff packet described below. Include supplied Figma file/page/node as a read-only link and require inspection before UI implementation or review.
6. Persistence mandate: exhaust safe in-scope options before reporting a genuine blocker. A failed command, test, build, emulator, auth step, dependency resolution, selector, architecture assumption, or design-tool access is a diagnosis trigger, not a stop reason.

Never dispatch a vague instruction such as “implement item 3.” State the observable result and the evidence that will prove it.

## 4. Persistent recovery loop

Keep an implementation agent active through failure with focused follow-up until the work succeeds or a genuine external blocker remains:

1. Capture the exact failure and classify it: product behavior, backend reachability, auth renewal, CORS, generated-client resolution, local runtime config, Android flavor/host routing, emulator stability, selector ambiguity, architecture/design mismatch, test harness, recording finalization, or pipeline failure.
2. Inspect repository guidance, source, configuration, logs, generated artifacts, and effective command/runtime values. For auth, use the documented local test-code renewal with existing runtime credentials. Diagnose a renewal `401` using effective host, request shape, documented credential source/injection, and redacted logs; it does not prove credentials are unavailable. Never extract secrets from a running process.
3. Form a concrete hypothesis and try the safest in-scope repair or materially different alternative. Preserve conventions; do not substitute hand-written HTTP or brittle text selectors for contract or UI failures.
4. Re-run the narrowest relevant check, then required E2E evidence. Record the attempt and outcome in the ledger and handoff.
5. After a hypothesis fails, choose a materially different safe option. Do not repeat an unchanged command without new evidence.

Distinguish product defects from harness failures. Pause dependents only when a result could change their parent branch or interface.

### Genuine blockers

A `blocked` report requires a demonstrated external condition: a required long-lived credential or renewal facility is absent after inspecting documented setup and attempting standard renewal; required supplied design context is inaccessible; required access or approval is unavailable; an external service cannot be made available locally; a material product decision is unresolved; or repository state is unrecoverable outside the agent's authority. An expired or missing short-lived test code is never sufficient by itself.

A blocker report states the exact condition, evidence, every safe recovery attempt, smallest owner action, and affected requirements. Ordinary build/test failures, configuration gaps, initial tool errors, and unanswered messages are not blockers. Do not request or expose credentials in messages.

## 5. Submission gates and handoff

Accept a local handoff as `locally-verified` only when the agent returns a clean committed branch that is `E2E-evidence-ready`: reviewed Chrome and Android video for a meaningful UI flow, authenticated valid/invalid contract evidence for changed backend behavior, or contract proof for API-only work. Immediately close submission: verify the final remote source commit, create or locate the pull request against the intended target, share only locally validated final video proof through an authorized accessible evidence location, and verify that its links are in the pull request description. Mark `submitted` only after all checks pass; then assess conflicts.

A known pull-request conflict sets `blocked-pr-conflict`; record its URL and conflict state and report plainly. Do not resolve it without authorization or claim it is merge-ready. A submitted pull request without a known conflict becomes `merge-ready` only after the applicable CI policy passes.

The handoff packet includes:

- selected backend-only, frontend-only, or cross-layer scope and why unchanged layers needed no work;
- repository guidance and conventions followed;
- architecture revision/sections and linked feedback entries for discoveries, proposed adjustments, and decisions;
- supplied Figma file/page/node inspected and visual mapping when relevant;
- worktree paths, branches, parent SHAs, final commit SHAs, and changed files;
- focused automated-check results;
- authenticated backend valid/invalid request-response evidence when backend behavior changed;
- API/client-generation and local dependency-resolution proof when contract/client changed;
- Chrome/Android Patrol outcomes and reviewed videos for meaningful UI work; contract evidence instead for API-only work;
- recovery attempts and outcomes, including harness fixes;
- confirmation that generated evidence, reports, and Patrol bundles are ignored and absent from the commit;
- requirement/issue links where applicable, remote branch and final SHA, pull-request URL/source/target, linked implementation item where applicable, conflict state, CI URL/status, and any documented generated-API exception;
- final evidence sharing result and exact accessible links in the pull-request description; API-only work uses contract evidence rather than invented video;
- reviewer-ready summary, release-order impact, and downstream requirements unblocked.

Validate the handoff against the selected requirement's acceptance criteria. Pull-request submission and `merge-ready` are delivery gates, not substitutes for acceptance. “Tests pass” does not replace contract or visual evidence. Internal ledger/handoff can retain recovery and dependency details; the pull-request description follows repository convention and communicates final behavior and reviewer-usable proof without correction history, local CI-equivalent totals, or internal release bookkeeping.

Pipeline policy is a delivery gate: backend pull requests require green CI. Frontend pull requests also require green CI unless red is directly caused by a linked unmerged backend change to the generated API it consumes. Record the backend pull request, generated API/client change, and failing job/log evidence establishing direct dependency. No other red result qualifies. Diagnose and repair in-scope failures; report genuine out-of-scope failures as blocked. Deployment and approvals are non-blocking unless explicitly required.

## 6. Advance and integrate

After each requirement is locally verified:

1. Verify the branch head and local evidence gates yourself; close submission immediately instead of waiting for other agents.
2. Mark `submitted` only after verifying remote branch, pull request, proof links, and conflict state. Use the verified remote branch/commit as the exact parent for newly unblocked work. A dependent frontend can use the locally generated client without waiting for upstream CI, merge, or publication. Apply pipeline policy separately and mark `merge-ready` only when it passes.
3. Append discoveries and proposals to architecture feedback. Never edit supplied architecture or design files. Give active or newly unblocked agents relevant feedback and design targets; pause work that depends on a material unresolved decision.
4. Dispatch newly unblocked requirements from the verified prerequisite commit. Do not ask a dependent agent to recreate or guess prerequisite work.
5. Keep independent submitted branches separate until an explicit integration point. When changes overlap, create an integration worktree/branch and run combined checks before declaring the group ready.
6. Record normal generated-client release order (backend merge, client publication, normal frontend dependency consumption) in the ledger and final handoff when applicable. Include it in a pull request only when a reviewer must coordinate release.

Do not merge, deploy, rotate secrets, or alter CI/CD just to advance orchestration unless explicitly authorized.

## Final report

Report requirements in order with final state, parentage, commit and pull-request links, evidence gates, acceptance readiness or pending prerequisites, recovery summary, and genuine blockers. Show which requirement unblocked each dependent branch and whether remaining work can proceed in parallel.

## Anti-patterns

- Asking the requester to classify backend versus frontend scope.
- Broadening or substituting selected scope because a parent issue or roadmap describes more work.
- Giving multiple agents the same mutable checkout, branch, or file ownership.
- Starting dependent work from the original base instead of a verified submitted prerequisite commit.
- Treating optional architecture/design context as mandatory, or omitting supplied context and required design inspection.
- Editing supplied architecture/design material or guessing through a material conflict.
- Treating the first failed command as a blocker or silently abandoning an agent.
- Faking a dependency boundary with hand-written HTTP, hard-coded secrets, or text-based selectors.
- Calling a local commit, test, or recording delivered before the remote branch, pull request, and final proof links are verified.
- Copying internal correction history, local CI-equivalent totals, or release/dependency bookkeeping into reviewer-facing descriptions.
- Treating a known pull-request conflict as resolved or merge-ready without authorization.
- Expanding local E2E work into deployment, pipeline, secret, or unrelated automation changes.
- Waiting for an upstream merge or client publication before local dependent integration, or repeatedly polling unchanged release state.

## Related skills

- `video-iterative-development` — required implementation workflow and evidence gates.
- Repository-documented Git worktree procedure — required isolation mechanics.
- `agent-orchestration` — general coordination patterns; this skill owns the specialized persistent requirement workflow when installed.
