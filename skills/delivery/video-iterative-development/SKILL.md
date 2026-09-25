---
name: video-iterative-development
description: Deliver authenticated end-to-end requirements across backend APIs and frontend clients, with verified browser and Android evidence for user-visible flows.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Video-Iterative Development

Use for authenticated end-to-end requirements touching a backend API, Flutter frontend, or both. Inspect all relevant repositories and choose the smallest scope yourself: backend-only, frontend-only against the existing contract, or cross-layer. For a user-visible flow, prove the real local contract (backend response → generated client → frontend interaction) and capture reviewable visual evidence.

## Select scope first

Inspect the requirement, relevant repositories, current API contract, generated-client dependency, and UI flow before implementing. Record the selected layers and why unchanged layers need no work; do not ask the requester to classify scope.

- **Backend-only:** change and directly verify the server contract. Do not invent a frontend change; use an existing UI flow only when it meaningfully exercises the contract.
- **Frontend-only:** consume the existing generated client and contract. Regenerate or change the backend only when the requirement exposes a real contract gap.
- **Cross-layer:** make the smallest contract change, regenerate the client, and implement dependent frontend behavior.

E2E proof covers each changed layer and its real dependency boundary. For API-only work without a meaningful user flow, provide valid and invalid contract evidence instead of manufacturing UI or video work. Put scope and unchanged-layer rationale in the internal handoff or orchestration ledger.

PR descriptions are reviewer-focused, follow the repository template, and state final behavior plus applicable proof links. Avoid internal iteration history, negative-scope boilerplate, local test/lint totals already available elsewhere, and branch/dependency/release bookkeeping unless a concrete reviewer action or compatibility concern requires it. When an issue tracker is used, link the relevant GitHub Issue or tracker item according to repository convention; issue text defines scope, and implementation tasks do not replace its acceptance criteria.

## Correcting an unmerged pull request

Compare the pull request source branch with its target before editing. Artifacts introduced only by the unmerged change (migration, route, generated client, API field, UI component, test, or harness) are mutable: correct, rename, or remove the original so the final diff is right. Do not add compensating artifacts for an intermediate implementation. Anything on the target branch, merged, deployed, or externally consumed follows normal compatibility and forward-migration policy. If origin is unclear, inspect the source/target diff and history. Prefer a normal follow-up commit; do not rewrite remote history or force-push without explicit authorization. Re-run applicable clean-state migration or generation checks and replace superseded proof with evidence of corrected behavior.

## Workflow

1. Inspect the requirement and relevant repositories; define observable frontend behavior and the authenticated HTTP contract where applicable. For every changed API, specify request, valid response, authorization rules, and at least one invalid request or credential outcome.
2. Prepare only required local dependencies. Start the backend when the flow needs it, configure local runtime values, and confirm the frontend resolves the intended generated client. Keep secrets and transient values outside the repository.
3. For backend changes, make the smallest contract change that fits repository conventions. Add focused automated tests and directly verify authenticated valid and invalid HTTP cases against the local server.
4. For API or client changes, update the API definition and regenerate the client. When consuming a local generated client, prove the frontend resolves it rather than a stale published package or hand-written HTTP calls.
5. For frontend changes, implement UI and state handling with the applicable generated client. Add stable semantic identifiers for each E2E action and assertion.
6. When authentication is required, automate it as scenario setup: use the documented renewal path and existing local runtime credentials before each run, then authenticate through the real frontend flow. A renewal `401` triggers diagnosis of base URL, request shape, documented credential source and injection, and safe logs; it alone does not prove renewal is unavailable. Never print, commit, or extract secrets from a running process.
7. Run relevant E2E proof. For a meaningful UI flow, exercise the real authenticated user journey in Chrome and Android, including in-scope navigation that makes the feature discoverable. For API-only work, use direct contract proof. Iterate on product code or harness configuration until the selected scope behaves as intended.
8. Finalize and visually review evidence as described below. A passing UI test without clear behavior and styling in the recording is not sufficient.
9. Produce scoped proof: backend request-to-response evidence including an invalid case when backend behavior changes; final frontend UI evidence when UI changes. Commit and push, open the applicable pull request, and place validated final evidence links in its description. Do not report delivery as submitted until the remote branch, pull request, and proof links are confirmed. Record generated-client release order in the handoff only when relevant.

## Operating rules

- Keep iteration and recording local. Limit work to the feature contract and client integration; do not change pipelines, deployment, secret management, or unrelated automation to make E2E work.
- Keep a long-running build, Patrol run, and recorder lifecycle in the same retained terminal session. Reattach until Patrol exits; a quiet or released build phase does not prove the evidence run finished.
- Auth renewal is scenario setup, not a manual prerequisite. Short-lived or single-use test codes trigger inspection of the documented renewal path and existing runtime configuration, not an owner-action request. Diagnose renewal failures using controlled launch settings, request metadata, and redacted logs. Never commit codes or renewal credentials.
- Drive login through the real frontend path. If browser renewal needs a private request header, configure local backend CORS for that header and verify preflight.
- Use accessibility identifiers or equivalent semantic selectors. Avoid visible text when duplicated, dynamic, localized, or present in multiple surfaces. Prefer deterministic selectors and explicit waits over arbitrary sleeps.
- The test and final video must show the same user-visible flow. Unit tests or screenshots alone do not substitute for interaction proof. Start final UI evidence from the normal authenticated surface and use the real entry path when discoverability is in scope. Direct routes, deep links, state injection, or service calls are valid setup or focused iteration tools, not substitutes for final entry-path proof. If that path is out of scope, record why in the handoff.
- Select the required Android app flavor and use an API address reachable from the emulator (commonly `10.0.2.2` for a standard emulator), not the emulator's own `localhost`. Supply it through local runtime configuration.
- Keep raw evidence locally for diagnosis; share only concise final reviewer-ready videos. Before capture, ignore the evidence directory (for example `.agent-evidence/`) and generated Patrol bundle (often `integration_test/test_bundle.dart`); ensure recordings, reports, and bundles are absent from the commit.
- Claim `E2E-evidence-ready` only after applicable gates pass: reviewed Chrome and Android video for a meaningful UI flow, authenticated valid/invalid contract evidence for changed backend behavior, or contract evidence for API-only work.

## Success and merge gates

`E2E-evidence-ready` means scoped local proof is complete; it does not mean the pull request is approved or ready to merge.

`submitted` means a clean final commit is on the remote source branch, the pull request targets the intended branch, and its description contains the applicable final proof links. API-only work may link contract evidence or summarize it; UI work links validated final videos. Local commits, passing tests, and local videos alone are not delivery.

After submission, inspect the pull request's terminal CI result. Backend changes require green CI before `merge-ready`. Frontend changes also require green CI, except when a failing check is directly caused by a linked, unmerged backend change to the generated API the frontend consumes. Record the backend pull request, generated API/client change, and failing job evidence establishing that direct dependency. Unrelated or adjacent failures do not qualify. Diagnose and fix in-scope failures; report out-of-scope failures with exact job evidence. Deployment status and approvals are non-blocking.

## Local full-stack checks

Before Patrol, establish each applicable check and diagnose the first failure before proceeding.

| Check | Required proof | If it fails |
| --- | --- | --- |
| Backend reachability | Local health and feature endpoints respond at the configured base URL. | Report effective base URL, server status, and transport error; do not misclassify it as a UI failure. |
| Auth renewal | Fresh test code comes through the documented local renewal path; real frontend login reaches authenticated state. | Inspect setup, controlled runtime configuration, renewal request shape, and redacted logs; distinguish host/config, renewal, CORS, and login-flow failures without exposing secrets. |
| Contract behavior | Direct local requests show expected authenticated response and invalid case. | Report request shape, status, and safe response summary; fix contract before UI. |
| Client resolution | Frontend dependency graph resolves the regenerated local client and UI uses its API. | Report resolved package path/version and generation error; do not replace the generated client with hand-written HTTP. |
| Android launch | Intended flavor starts with a backend address reachable from the emulator. | Report flavor, build task, and effective API host; do not blame the feature for task selection or `localhost` errors. |
| E2E targeting | Every action and assertion finds one stable semantic identifier. | Identify missing or ambiguous identifiers and fix them rather than falling back to brittle text selection. |

For backend-to-frontend integration, a pushed unmerged backend commit and client generated from that checkout are valid local inputs. A frontend may use that client through a local path dependency for implementation, E2E, evidence, and pull-request submission. Do not wait for the backend pull request to merge or the client to publish; those are separate release gates. After publication, return to the normal dependency path. A local path dependency proves local integration only, not publication or consumer resolution.

## Evidence helper

`scripts/evidence.py` captures Android emulator video and finalizes imported browser recordings as validated MP4. It does not drive a browser; Patrol owns interaction and pass/fail reporting. It uses Python's standard library plus `ffmpeg` and `ffprobe`; Android capture additionally requires `adb`.

## Reviewer-ready evidence

Separate raw lifecycle capture from final proof. Raw capture may include build, install, launch, and authentication for diagnosis; keep it local. Final proof is a concise recording of a real reviewer-relevant scenario, normally about 15–45 seconds: stable initial state, meaningful actions, visible result, and held final state. Include startup or login only when required by the feature.

For final proof, pre-warm the emulator, build, install, and complete non-requirement setup without recording. Then run the same live scenario under a retained-session readiness barrier: the runner waits at a known initial UI state while the recorder starts, then continues visible interaction. Prefer a test/harness checkpoint; otherwise use a stable semantic identifier, optionally combined with the app package in foreground. Process launch alone is not readiness. If the harness cannot safely pause, do an uncaptured warm-up run followed by a second recorded run of the real scenario.

Evidence pacing belongs in the test harness, not product code or post-processing. Hold the stable initial state, each material transition, and final asserted state long enough for a first-time reviewer (typically 1–2 seconds). Evidence mode uses the same selectors, requests, assertions, and visible flow as normal verification. Do not replace real E2E proof with captions, synthetic zooms, altered playback speed, or cinematic edits.

```bash
EVIDENCE=<skill-dir>/scripts/evidence.py
python3 "$EVIDENCE" doctor
python3 "$EVIDENCE" start --output .agent-evidence/<flow>/android --source android
# Run the live Patrol scenario.
python3 "$EVIDENCE" stop <session>
# Optional checkpoints for a long recording.
python3 "$EVIDENCE" frames --video <session>/evidence.mp4 --output <session>/frames --at 10,25,40
```

Keep the Android runner and recorder lifecycle in one retained shell session. The following is for raw diagnostic capture and preserves Patrol's exit status:

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

Final pull-request proof must not blindly use the raw sequence above because it records launcher, install, and startup. Pre-warm first, coordinate Patrol and recorder startup through a readiness barrier, and stop after the final state is held. Keep the supervisor flow in the same retained shell session.

If the normal Android launcher aborts (for example, exit code `-6`), restart one emulator headlessly with software rendering and wait for boot:

```bash
emulator -avd <avd-name> -no-window -gpu swiftshader_indirect &
EMULATOR_PID=$!
adb wait-for-device
adb shell getprop sys.boot_completed
```

Keep the emulator process in the retained terminal session through evidence capture; stop it deliberately afterward.

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

## Visual review and sharing

Review the final video after each passing run: stable opening, interaction, and held final state. A first-time reviewer should understand the initial state, each meaningful action, and why the final state satisfies the requirement without pausing. If startup dominates or transitions are too fast, treat the recording as diagnostic-only and recapture with a readiness boundary and suitable pacing.

Check resolved visual tokens as well as behavior. Compare controls with the product design contract rather than framework defaults. Correct styling mismatches, rerun, and review evidence on both platforms.

Before sharing, use `ffprobe` to confirm each final video has a readable video stream and positive duration. File size or successful transfer does not prove playability. If validation fails, recapture. Share final video through the repository's established evidence/artifact location or another authorized accessible URL, then link it from the pull request description. Keep raw recordings local and out of source control; do not invent an upload endpoint or commit large generated recordings.
