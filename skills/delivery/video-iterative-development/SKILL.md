---
name: video-iterative-development
description: Execute an orchestrator-specified authenticated E2E assignment through local API-contract, generated-client, Patrol/video-review, and pull-request loops without making delivery decisions.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Video-Iterative Development

Use this skill as the implementation worker for a complete assignment from `video-iterative-orchestration`. Execute the assigned backend-only, frontend-only, or cross-layer scope without reinterpreting it. When a user-visible flow exists, prove the real local contract—from backend response, through the generated client, to Android interaction—then capture visual evidence for review.

## Authority boundary and decision requests

The implementation agent executes; it does not make consequential delivery decisions. It must not choose or change source interpretation, ticket scope, product or design behavior, participating repositories or layers, dependency order, branch or PR topology, required evidence, deviations, blocker disposition, or final ticket state. It must not ask the prompter or another external owner to decide.

The agent may choose reversible, repository-conventional implementation mechanics that do not alter the assignment, including local code organization, command ordering, deterministic selector details, and diagnosis or retries for in-scope failures. If the assignment is missing required information, conflicts with an authoritative source or repository fact, or would require a consequential choice, return this structured request to the orchestrator and continue unaffected work:

```yaml
decision_request:
  observed_condition: <fact>
  assignment_clause: <missing or conflicting clause>
  evidence: <paths, commands, or redacted output>
  decision_needed: <one exact question for the orchestrator>
  affected_work: <work paused on that decision>
  unaffected_work_continued: <work still progressing>
```

Do not recommend or silently select an alternative in the request. If the assignment lacks its selected scope, write surface, branch and PR target, acceptance behavior, or evidence gate, return a `decision_request` before implementation.

## Use the supplied Figma visual bundle

When the assignment includes an `extract-figma-visuals` bundle, inspect its `metadata.json`, `screen.png`, and the named descendant images before changing UI code. Use the manifest's canonical node IDs and URLs to retrieve narrow implementation detail through Figma MCP; when implementing from that context, first follow Figma's mandatory `figma-design-to-code` guidance and call `get_design_context` for the relevant root or node. Do not re-export the frame, discard the bundle, or infer a design from text alone. Record which root and descendant images informed the implementation and visual review. Apply the orchestrator's recorded Figma resolution. If retrieved context conflicts with that resolution or exposes an unresolved product choice, return a `decision_request`; do not reinterpret the sources.

The bundle is an implementation reference, not final evidence. It does not replace the real Android recording, user-flow proof, or visual review required below.

## Follow repository UI rails

Read the participating repository's `AGENTS.md`, engineering guidance, UI/component inventory, localization rules, and documented validation commands before editing. Reuse public design-system controls and tokens; do not import internal components or introduce a feature-local replacement without a concrete requirement. Inspect the repository's read-only component inventory when available, including replacement contracts and public parameters. A missing component that changes the assignment's scope returns a `decision_request`.

Give touched interactive actions and state-reporting elements stable semantic identifiers, not one identifier for a container holding several actions. Keep service access in its owning layer, use repository localization, and follow its documented E2E key conventions. New public components receive required contract annotations, component stories, and reviewed golden coverage only when the repository requires them. Run the complete documented changed-line and component validation; an analyzer alone does not replace a configured lint plugin. Report inventory selections, command outcomes, applicable stories, reviewed images, and justified exceptions in the handoff.

## Use assigned feature-conformance rows

When the assignment includes a feature-contract path and relevant rows, treat those rows as the acceptance target for this ticket. Attach generated-client or service-boundary proof and journey or visual evidence to the corresponding rows in the handoff. Only the orchestrator may create or change `agent_decided`, `decision_needed`, or deviation records. If a row cannot be implemented as assigned, return a `decision_request` and continue unaffected rows. Do not claim a row delivered without its required evidence or an orchestrator-recorded `approved_deviation`.

## Execute the assigned change scope

Before implementation, inspect both repositories, their current API contract, generated-client dependency, and relevant UI flow to validate the assigned scope and identify its mechanics. Do not reclassify it:

- **Backend-only:** change and directly verify the server contract; do not invent a frontend change. Use an existing UI flow only when the assignment requires it as evidence.
- **Frontend-only:** consume the existing generated client and contract; do not regenerate the client or change the backend. Return a `decision_request` if implementation exposes a contract gap.
- **Cross-layer:** make the smallest backend contract change, regenerate the client, then implement the dependent frontend behavior.

The E2E proof must cover the assigned changed layer and its real dependency boundary. For an assigned API-only change with no meaningful user-visible flow, contract-oriented valid and invalid request/response evidence is sufficient; do not manufacture a video-only UI change. If repository inspection shows that the assigned scope cannot produce the required behavior, return a `decision_request` instead of adding another layer.

Keep PR descriptions reviewer-focused and follow the repository's PR template. For Jira epic work, link the implementation Subtask when present and its parent Story; QA acceptance remains on the Story. State the ticket, final implemented behavior, and applicable proof links. For UI changes with mapped Figma, name each changed area and whether its reviewed result matches the mapped frame. Do not add negative-scope boilerplate such as “no OpenAPI/client change” or “no invented UI/video proof”; iteration history such as “Correction applied”; local test counts, lint, format, or hook results that the pipeline already reports; or internal source-branch, dependency, and release-impact bookkeeping. Include an exception only when it creates a concrete reviewer action, compatibility concern, or release coordination requirement.

## Commit and push discipline

Follow the assignment's commit plan and named push boundaries. Require `push_policy: final_verified_batch`, `final_push_authorized: true`, `checkpoint_pushes: prohibited`, `additional_boundary_authority: orchestrator`, and `missing_boundary_state: decision_request_not_blocked`. If one is absent or different without an explicit replacement policy, return a `decision_request` and continue unaffected local work. Do not call the ticket blocked.

The final verified-batch boundary is standing authority and an instruction to push once after the assignment's local verification and evidence gates pass. Do not ask the prompter or orchestrator to approve it again. Until those gates pass, keep working locally in `active` or recovery state; not having pushed yet is expected and never a blocker.

Preserve adopted history and perform only the assigned lineage reconciliation; preserving history does not require committing or pushing every recovery attempt. Existing remote commits remain unchanged, but a branch already being published does not require later experiments to become commits or pushes.

Keep selector experiments, temporary waits, debug logging, harness probes, and other diagnostic edits in the working tree until their outcome is known. Remove superseded attempts before committing. Do not commit a recovery attempt merely because the branch already has a remote; commit only changes that remain in the intended final diff: a coherent product or contract change with its durable regression coverage, a required generated artifact, or a final test-harness change needed to prove the feature. When an interruption-safe checkpoint is useful, record a redacted patch or notes under the ignored evidence directory instead of creating a branch commit. Never include secrets or transient runtime values.

Several meaningful commits may remain local and be pushed together. Push the final verified batch once without another permission request. Push earlier or again only at an assignment-named boundary: a remote dependency handoff or a coherent review correction. Runtime leasing, evidence preservation, or one successful diagnostic step does not justify a push. Before pushing, inspect the outgoing commits and final diff; do not publish diagnostic-only or superseded commits. If another push boundary is needed, return a `decision_request` before pushing and continue unaffected work; the missing boundary is not a blocker.

Do not amend, rebase, force-push, or otherwise rewrite existing remote history to clean up an earlier commit sequence without explicit authorization. Continue with ordinary correction commits when the remote history already exists.

## Execute authorized external actions

The assignment's named push and submission boundaries are workflow authorization for the assigned branch, PR, and evidence. They do not bypass a runtime-managed approval gate. When the command runner requires approval for an authorized push, PR operation, or evidence upload, immediately retry that same narrowly scoped operation through the runner's managed approval or escalation mechanism, naming the exact destination and purpose. Let the runtime surface its approval control when one is required.

Do not replace that mechanism with a conversational request for the prompter to say “go ahead,” and do not return a `decision_request`, `recovery_exhausted`, or blocker merely because managed approval is required. Never weaken, evade, or broaden the runtime approval. Only an explicit denial returned by the managed approval attempt is an external-action failure; preserve its exact redacted tool response, keep the ticket non-terminal, and return it to the orchestrator for focused recovery. A warning, an inferred private-information concern, or an unattempted escalation is not a denial.

After every external action, verify the resulting remote state rather than trusting command exit alone: resolve the remote branch commit, fetch the PR through GitHub, and verify uploaded proof from the PR description and authenticated download. Return those facts in the handoff for the orchestrator's submission-closure gate.

## Correcting an unmerged PR

For a review-correction task, compare the PR source branch with its target before changing an artifact. Anything introduced only by the unmerged PR—including a migration, route, generated client, API field, UI component, test, or harness—is mutable. Correct, rename, or remove the original artifact so the final PR diff is right; do not add a compensating artifact solely to preserve compatibility with the PR's intermediate implementation. A normal follow-up commit is sufficient; do not rewrite remote history or force-push unless explicitly authorized.

Anything already on the target branch, merged, deployed, or externally consumed follows the repository's normal compatibility and forward-migration policy. If the origin of an artifact is unclear, inspect the target/source diff and history before proceeding; do not assume an unreleased exception. Re-run clean-state migration or generation checks as applicable, then replace the affected final proof with evidence of the corrected behavior.

## Select the documented local runtime

A repository-defined singleton full-stack container is optional, not a collection prerequisite. The assignment names `runtime_mode: shared_canonical` or `runtime_mode: isolated_local`. Apply the lease rules below only to `shared_canonical`. With `isolated_local`, use the assigned repository-documented local setup, ports and owned processes; preserve source identity, readiness, fixture, authentication, and evidence checks without inventing a company host topology. Missing project-specific configuration is a diagnosis trigger, not permission to install company defaults.

## Use only the orchestrator-granted canonical runtime

Source worktrees may progress in parallel. The repository's canonical full-stack dev container does not: it accepts one assigned branch or commit at a time, under an orchestrator-owned runtime lease. The assignment must explicitly say whether this worker holds that lease.

Without the lease, do not mount or switch source in the canonical container; start, stop, or restart its services; apply migrations or fixtures to its local data; authenticate against it; run Android E2E; or record evidence. Complete all unaffected source-only work, then return:

```yaml
runtime_lease_request:
  ticket: <assigned ticket>
  exact_sources: <repository worktrees, branches, and commits ready to deploy>
  required_runtime_work: <migration, fixture, probes, E2E, and evidence still needed>
  unaffected_work_completed: <implementation and non-runtime verification already complete>
```

With the lease, use only the assignment's repository-documented dev-container topology, standard ports, complete environment source, migrations, fixtures, probes, Android runner, and evidence path. Treat an IDE compound launch configuration as declarative process data. Read it, resolve every command, argument, working directory, environment value, dependency, and readiness condition, then start the complete topology directly with shell and retained-session tools. Do not check the host for, install, invoke, or report the absence of VS Code, `code`, or another editor launcher. Editor availability is unrelated to whether the documented topology can run. A direct launch that preserves the complete configuration is the canonical runtime, not an alternate or partial manual topology.

After launch, account for every configured process and run the documented readiness probes. If one process fails, diagnose and recover that process while preserving the topology. Return a `decision_request` only when the configuration itself is irreconcilably ambiguous or the complete topology cannot be reproduced after concrete recovery attempts; never return one because a convenience launcher is absent. Do not create another backend instance, select alternate ports, add a CORS or forwarding bridge, rewrite a Host header, or relaunch only a subset of the environment.

Before Android E2E, prove the exact assigned source and commit are mounted, the documented environment is active, migrations and fixtures match the ticket, the canonical host-side health and feature probes pass, and the Android-facing connectivity or version probe returns the expected success response. Host-side health alone is insufficient. Never compensate for a failed probe by injecting connectivity, authentication, navigation, or other application state.

Immediately before Patrol, run the assignment's project-local ADB stability preflight against its assigned device serial. It must produce seven successful samples across 60 seconds; every sample must report `adb get-state` as `device` and `sys.boot_completed` as `1`. Abort before Patrol if any sample fails. Final evidence is valid only from a run preceded by this passing preflight.

If Patrol reports `device offline`, classify the run as Android harness instability, not an authentication or product failure. Invalidate its result and recording, restart only the canonical assigned emulator, rerun the complete preflight, and retry Patrol once. If that retry fails, return `recovery_exhausted` with the redacted ADB and Patrol evidence; do not change application or authentication behavior to compensate.

After the final runtime-dependent check and evidence capture, stop every runtime, Patrol, emulator, recorder, and bridge process started by this assignment. Preserve evidence and report persistent state without resetting or destroying it unless the assignment or repository guidance authorizes that action. Return:

```yaml
runtime_release:
  ticket: <assigned ticket>
  exact_sources: <deployed repository commits>
  runtime_commands: <canonical switch/start commands used>
  data_state: <migrations and fixtures applied; persistent state retained>
  probes: <host-side and Android-facing results>
  evidence: <final local evidence paths>
  owned_processes_stopped: <yes or exact remaining process>
  residual_state: <what the next lease owner must account for>
```

The orchestrator validates this report and grants the next lease. Do not keep the runtime while waiting for pipeline, review, merge, or client publication; later correction work re-enters the queue.

## Workflow

1. Validate the assignment against both repositories without changing its scope. When assigned an adopted interrupted worktree, inspect its complete committed and uncommitted diff first and preserve conforming work as the implementation baseline. When supplied, inspect the relevant feature-conformance rows, source-change classification, and Figma visual bundle before planning UI work. Implement the assigned observable frontend behavior and explicit authenticated HTTP contract where applicable. State the request, valid response, authorization rules, and at least one invalid request or credential outcome for every changed API. Return contradictions through `decision_request` and continue unaffected work.
2. Prepare source-only dependencies needed by the assigned scope, then use the canonical full-stack runtime only while holding its orchestrator-granted lease. Read the participating repositories' `AGENTS.md` and maintained setup helpers for the exact dev-container switch/start, migration, fixture, canonical port, host-side and Android-facing probes, generation, runtime-define, and Patrol commands. Those files are the project-specific operational authority. Deploy the assigned feature worktree and commit through that complete documented runtime contract; do not reproduce it selectively in another process or topology. Apply documented migrations and required fixtures only to its selected local test data. Configure required local runtime values and, when relevant, confirm the frontend resolves the intended generated API-client package. Keep secrets and transient runtime values outside the repository.
3. If the backend changes, inspect recent comparable endpoints and the repository's engineering guide before adding endpoint behavior. Implement the smallest contract change that follows those conventions. Add focused automated tests, then run the documented verification commands and verify the authenticated valid and invalid HTTP cases directly against the local server.
4. If the API contract or client changes, regenerate the OpenAPI schema and client with the repository's pinned commands. Treat generated files as exact generator output: do not hand-edit or format them afterward. Run generation a second time and confirm it leaves the generated files unchanged. When the frontend consumes the client locally, verify that it resolves the generated local package—not a stale published dependency or hand-written HTTP calls.
5. If the frontend changes, implement the UI and state handling with the applicable generated client. Add stable semantic identifiers for each E2E interaction and assertion point.
6. When the scenario authenticates, automate test authentication as setup: use the repository's documented fixture or credential source and renewal path to obtain the standard test login code before every run, pass the documented values through Android runtime configuration, then authenticate through the actual frontend flow. Invoking that standard renewal and reading its documented local configuration source are within the task's authority; never wait for an owner to send or approve a short-lived code. Unset shell variables or Dart defines mean only that the current process has not received the values. Locate and inject them through the documented path; do not classify them as unavailable access. If renewal returns `401`, diagnose the effective base URL, endpoint/request shape, documented credential source and injection path, and safe server/client logs without printing secret values; a `401` alone does not establish that the renewal facility is absent. Do not inspect, dump, or extract credentials from a running process.
7. Run the relevant E2E proof. For a meaningful UI flow, execute the real authenticated user journey in Chrome and Android for applicable browser and Android surfaces, including every user-visible entry/navigation action that makes the feature discoverable and reachable; otherwise run the direct contract proof for API-only work. Iterate on product code or harness configuration until the selected scope behaves as intended.
8. Record, finalize, and visually review UI runs using the evidence workflow below. Treat a passing UI test without clear behavior and styling in the recording as a failed iteration.
9. Produce scoped PR evidence: backend request-to-response proof including an invalid case when the backend changes, and final frontend UI proof when the UI changes. At the assignment's submission boundary, push the coherent local commit batch once, open or update the applicable PR, upload validated final proof, and place the returned evidence links in the corresponding PR descriptions. These assigned-branch submission actions are part of this workflow and need no separate prompter authorization. Do not report the requirement as delivered before this submission closure is complete. Record client-publication release order in the handoff; put it in the PR only when a reviewer must coordinate that release.

## Operating rules

- Keep all iteration and recording local.
- On an adopted `In Progress` or `Code Review` branch, continue that branch and PR. Do not reset, clean, replace, or reimplement conforming work merely because the previous run ended before handoff.
- For an existing PR, work in its adopted worktree and use its repository-documented dev container and verification commands. Create another test environment only for a concrete, recorded reason that does not bypass the canonical-runtime lease.
- Treat an assigned Figma visual bundle as read-only input. Compare the relevant root and descendant references during visual review; do not attach them to the PR or commit them to product code.
- Keep the task scoped to the feature contract and its client integration. Do not change pipelines, deployment, secret-management systems, or unrelated automation merely to make local E2E work.
- Treat the canonical full-stack dev container as a singleton. Runtime waiting is scheduling, not a failure; continue source-only work and request the lease instead of creating an alternate instance, port, bridge, proxy, or partial manual launch.
- Keep a long-running Android build, Patrol run, and recorder lifecycle in the **same terminal session**. If the terminal tool yields a live session while Flutter builds, reattach to that session until Patrol exits; a quiet or released build phase is not evidence that the Android test finished.
- Treat authentication renewal as scenario setup, not a manual prerequisite. Test invite/login codes can be single-use, so discover and invoke the documented local renewal mechanism using the repository's documented fixture or credential source before every scenario. Pass the repository-documented Patrol inputs through Android runtime configuration. Unset process variables, an expired or absent short-lived code, and a renewal `401` are diagnosis triggers, not blockers or owner-action requests. Investigate through documented configuration, controlled launch settings, request metadata, and redacted logs, not by reading running-process credentials. Never commit a code or its renewal credentials, and never ask for or accept either through Slack.
- Drive login through the real frontend path. Wait for the app's real connectivity and authentication readiness, then use its ordinary controls and callbacks. Never force a connectivity notifier, authenticated session, navigation state, or equivalent product state and present the resulting run as final evidence.
- Use semantic identifiers (for example, accessibility identifiers or Flutter semantics labels) for test actions and assertions. Do not rely on visible text when it can be duplicated, dynamic, localized, or mounted in more than one surface.
- Use the same user-visible flow in the test and in the video; do not substitute a unit test or a screenshot-only check for interaction proof.
- Final UI proof must start from the normal authenticated surface and perform the actual user entry path (for example, navigation, FAB/action, and selection steps) when that path makes the feature discoverable. Direct routes, panel toggles, deep links, state injection, and direct service calls are allowed for setup or focused downstream iteration tests, but cannot replace that entry path in final evidence. If an entry path is explicitly out of scope, record the reason in the PR.
- Prefer deterministic selectors and explicit waits over text scraping or arbitrary sleeps; short intentional pauses are appropriate when needed to make before/after states reviewable in a recording.
- For Android, select the explicit app flavor required by the project and configure the API base URL with the emulator's host-reachable address (commonly `10.0.2.2` for the standard Android emulator), never the emulator's own `localhost`. Supply it through local runtime configuration rather than hard-coding it into product code.
- Preserve raw evidence for debugging, but attach only concise final proof videos to the PR.
- Before generating evidence, add the target project's evidence directory (for example, `.agent-evidence/`) and Patrol's generated `test_bundle.dart` path (usually `integration_test/test_bundle.dart`) to its `.gitignore`. Verify the feature branch is clean of generated recordings, reports, and bundles before committing.
- Do not claim `E2E-evidence-ready` until the scoped proof gate passes: reviewed Chrome and Android video for applicable meaningful UI flows, and authenticated valid/invalid contract evidence for backend behavior that changed. API-only work needs contract proof, not invented UI/video work.

## Success gate

`E2E-evidence-ready` means the scoped local proof above is complete. It does **not** mean that an PR is `submitted_verified`.

`submitted` means the clean final commit is on its remote source branch, an PR for that branch exists against the intended target, and the PR description contains the final applicable proof links. An API-only change needs its contract evidence link or summary; a UI change needs its validated final video link(s). Do not call local commits, passing tests, or local videos delivered before they are `submitted`.

## PR pipeline status

After submission, report an PR pipeline status only if it is already available. Do not wait for a terminal result, diagnose or retry a failed pipeline solely for delivery, or treat a missing, pending, or failed pipeline as a blocker. Local verification, final proof, submission, and conformance remain the delivery requirements. If an available result reveals a defect in the submitted change, send the finding to the orchestrator for a separate correction decision. Deployment status, approvals, and merge-conflict indicators remain observations for the orchestrator.

## Local full-stack integration checks

Before running Patrol, establish these facts and stop to diagnose the first one that is false:

| Check | Required proof | If it fails |
| --- | --- | --- |
| Runtime lease and topology | The orchestrator granted this ticket the singleton canonical-runtime lease, and the documented dev-container topology, environment source, and standard ports are in use. | Continue source-only work and return a `runtime_lease_request`. Do not start or alter runtime state and do not create an alternate topology. |
| Backend identity and data | The canonical local backend runs the exact assigned feature commit with applicable migrations and scenario fixtures or seeded templates. | Redeploy the assigned source through the documented dev-container flow and apply its documented setup to the selected local data. Do not mutate an unrelated service or start another instance. |
| Backend reachability | Host-side health and feature probes pass at the canonical base URL, and the Android-facing connectivity or version probe returns the expected success response. | Report the effective URLs, forwarded host when applicable, server status, and transport or host-validation error. Restore the documented runtime contract; do not call it a UI failure or inject application state. |
| Auth renewal | A fresh test code is obtained through the documented local fixture or credential source and renewal path, its required runtime values are injected, and the real frontend login reaches an authenticated state. | Treat unset environment variables or Dart defines as incomplete setup. Inspect the documented fixture/credential source, controlled launch/runtime injection, renewal endpoint/request shape, and redacted logs; attempt the local flow and distinguish an expired/single-use code, a `401` from wrong host/config/credential injection, renewal-facility failure, and login-flow failure. Do not inspect a running process for secrets or ask an owner for a code before those checks. |
| Contract behavior | Direct local requests show the expected authenticated response and an expected invalid case. | Report the request shape, status, and safe response summary; fix the backend contract before changing the UI. |
| Client resolution | The frontend dependency graph resolves the regenerated local client, and the UI uses its API. | Report the resolved package path/version and generation error; never mask it with a hand-written HTTP client. |
| Android launch | The intended flavor builds and starts with a host-reachable backend address. | Report the selected flavor, Gradle task, and effective API host; do not blame the feature for task selection or `localhost` errors. |
| ADB stability | The assigned device passes seven `device` and boot-complete samples across 60 seconds immediately before Patrol. | Abort before Patrol. Restart only the canonical assigned emulator, rerun the full preflight, and retry once; a `device offline` run is harness instability, not auth or product evidence. |
| E2E targeting | Each action and assertion finds one stable semantic identifier. | Report the missing or ambiguous identifier and add/fix it instead of choosing a brittle text selector. |

For a local backend-to-frontend E2E dependency, a pushed unmerged backend source commit and the generated client from that source checkout are valid inputs. The frontend may use that client through a local path dependency to implement, run E2E, record evidence, push, and open its PR. Do not wait for the backend pipeline, backend PR merge, or client publication; after publication, the frontend returns to normal dependency consumption.

Keep local path dependencies limited to the E2E integration workflow. The normal release path remains the published generated client; do not treat a successful local path dependency as proof that publication or consumer resolution works.

## Evidence helper

Use `scripts/evidence.py` to capture the Android emulator and finalize the recording as a validated MP4. Patrol remains the source of test-step timing, interaction, and pass/fail reporting.

## Reviewer-ready evidence

Distinguish raw lifecycle capture from final PR proof. A raw recording may begin before emulator boot, build, install, app launch, or authentication and is useful for diagnosing failures; retain it locally when useful, but never attach it as the final proof. Final proof must not contain emulator boot, build, install, launcher, app startup, or login footage unless that exact stage is part of the ticket's acceptance criteria. It is a concise recording of the reviewer-relevant scenario, normally about 15–45 seconds: stable initial state, meaningful actions, visible result, and a held final state.

For final proof, boot and pre-warm the emulator, build, install, launch, authenticate, and complete any non-requirement setup before recording. Start the recorder only after the app has reached the known stable initial UI state, then continue with the visible interaction. Prefer a test/harness checkpoint for that boundary; otherwise use a stable semantic identifier, optionally combined with the app package being foregrounded. Process launch alone is not readiness. If the existing harness cannot pause safely at that boundary, use an uncaptured warm-up run followed by a second recorded execution of the real scenario.

Evidence pacing belongs in the test harness, not product code or post-processing. In evidence mode, use one intentional one-second presentation hold at the stable initial state, each material transition, and the final asserted state. Do not stack that hold with another pacing delay at the same checkpoint. Functional waits may last until the asserted UI state exists, but must not add another presentation pause after it settles. Keep the normal verification run fast when useful, but make the evidence-mode run use the same selectors, requests, assertions, and visible flow. Do not substitute captions, synthetic zooms, playback-speed changes, or an edited cinematic for a real E2E proof.

```bash
EVIDENCE=<skill-dir>/scripts/evidence.py
python3 "$EVIDENCE" doctor
python3 "$EVIDENCE" start --output .agent-evidence/<flow>/android --source android
# Run the live Patrol scenario.
python3 "$EVIDENCE" stop <session>
# Only for a long recording, extract selected review checkpoints.
python3 "$EVIDENCE" frames --video <session>/evidence.mp4 --output <session>/frames --at 10,25,40
```

Keep every Android runner/recorder lifecycle in one retained shell session; do not run its coordinated steps as independently sandboxed terminal calls, because the recorder process and its PID can be released before finalization. The following is appropriate for a raw diagnostic lifecycle capture. Preserve Patrol's status while still finalizing the recording:

```bash
EVIDENCE=<skill-dir>/scripts/evidence.py
EVIDENCE_ROOT="$(pwd)/.agent-evidence/<flow>"
SESSION="$(python3 "$EVIDENCE" start --output "$EVIDENCE_ROOT/android" --source android | jq -r .session)"
patrol test --device=<android-device> --target=<test-target>
PATROL_STATUS=$?
python3 "$EVIDENCE" stop "$SESSION"
FINALIZE_STATUS=$?
[ "$PATROL_STATUS" -ne 0 ] && exit "$PATROL_STATUS"
exit "$FINALIZE_STATUS"
```

For final PR proof, do not use the raw sequence above: it records launcher, install, and startup time. Pre-warm first, then coordinate Patrol and `evidence.py start` through the readiness barrier described above, and run `evidence.py stop` after the one-second final-state hold. Keep that complete supervisor flow in the same retained shell session.

If the normal Android launcher aborts (for example, exit code `-6`), restart a single emulator headlessly with software rendering before recording, then wait for it to boot:

```bash
emulator -avd <avd-name> -no-window -gpu swiftshader_indirect &
EMULATOR_PID=$!
adb wait-for-device
adb shell getprop sys.boot_completed
```

Keep that emulator process in its retained terminal session for the subsequent recording; stop it deliberately after the evidence run.

For Chrome, use Patrol's bundled web runner and video output:

```bash
EVIDENCE_ROOT="$(pwd)/.agent-evidence/<flow>"
RAW_RESULTS="$EVIDENCE_ROOT/chrome/results"
RAW_REPORT="$EVIDENCE_ROOT/chrome/report"
patrol test --device=chrome \
  --web-video=on \
  --web-headless \
  --web-executable-path="${PATROL_WEB_EXECUTABLE_PATH:-/snap/bin/chromium}" \
  --web-browser-args='["--no-sandbox"]' \
  --web-results-dir="$RAW_RESULTS" \
  --web-report-dir="$RAW_REPORT" \
  --target=<test-target>
```

Use absolute paths rooted in the target project: Patrol 4.6.1 may resolve relative web result/report paths from its cached `web_runner` directory. When invoking the Patrol web runner directly, use the same settings: `PATROL_WEB_EXECUTABLE_PATH`, `PATROL_WEB_HEADLESS=true`, `PATROL_WEB_BROWSER_ARGS='["--no-sandbox"]'`, and `PATROL_WEB_VIDEO=on`. Do not add a separate Playwright install or browser lifecycle unless the project lacks Patrol's web runner.

After Patrol finishes, import its raw `.webm` or `.mp4` through an `external` evidence session with `stop <session> --video <recording>`. The helper validates and normalizes the recording; Patrol reports behavior.

### Playwright host-platform preflight

If Patrol's bundled runner fails before launching Chromium because Playwright rejects the detected Linux platform, set its supported compatibility target in that shell and retry:

```bash
export PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
```

Use this only after an unsupported-host preflight error. It does not replace the Patrol web-runner settings, and `--web-executable-path` alone does not skip browser-install preflight.

## Visual proof review

Review the final proof itself after each passing run, including the stable opening, interaction, and held final state. It must be understandable to a first-time reviewer without pausing: they should be able to identify the initial state, each meaningful action, and why the final state satisfies the requirement. Reject and re-record any proof that contains non-required emulator boot, build, install, launcher, app startup, or login footage, or that stacks presentation holds beyond the one-second pacing rule.

Check resolved visual tokens as well as behavior. Compare controls against the product's design contract rather than a framework's semantic defaults—for example, a primary action may require the product's blue/on-blue token pair even when the framework renders its default primary action green. Correct a styling mismatch, then re-run and re-review evidence on each required platform.

## GitHub evidence publication

Before sharing, validate each final video with `ffprobe`: require a readable video stream and positive duration. File size or successful transfer alone is not playability. Re-record invalid proof; keep raw recordings local and out of source control.

Use the repository's authorized GitHub evidence location or hosting mechanism. GitHub's `gh pr edit` does not upload local videos: never invent an attachment endpoint or paste a local path as hosted proof. After upload, download the hosted capture using the access required by that host, compare its expected byte count and SHA-256 with the validated local file, and check playability again. Fetch the current PR body with `gh pr view <pr-number> --json body,headRefOid,headRefName,baseRefName,url`, verify the exact proof references at the final head, and verify the separate evidence comment when required by the repository publication contract.

Follow installed `record-evidence`, `iterate-evidence`, and `describe-pr` publication contracts when the repository uses them. This workflow never weakens their current-head, required-surface, baseline, terminal-proof, hosted-readback, or hook gates. Keep scratch captures outside the ignored task root and remove uploaded scratch files only after successful hosted readback. An API-only change uses real contract proof rather than manufacturing a UI recording.
