---
name: record-evidence
description: Run for /record-evidence requests and before every delivery PR. Capture live UI video or actual CLI, API/performance, or agent-session output; record revision-bound results and publish hosted evidence in the PR description and a separate comment.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Record Evidence

Record actual behavior against the current code revision before any delivery PR is published. This phase is mandatory after implementation, verification, app testing, and code review for manual and Atomic delivery, including oneshot, bugfix, and each epic child PR. Repeat it after review feedback changes behavior. A failed assertion, missing capture, or unverified revision blocks `/describe-pr`: repair the change and recapture. Outside a task the skill stands alone.

For UI work, record the live session as video with the steps below. For non-UI work, capture the real terminal session, API/performance probe output, or agent transcript showing the command or tool call and its observed result. An assertion list without captured behavior is not evidence.

## Inputs

- **Test targets** (required): behaviors or flows to verify, phrased as testable statements.
- **Surface**: UI screen/device/browser, CLI terminal, API/performance probe, or agent session. Select what exposes the changed behavior; mixed changes may need several captures.
- **PR / issue** (optional): where to post. A task PR must eventually include the hosted capture in both its description and a distinct comment, even when the PR does not exist yet at recording time.

## Where evidence lives

Inside a task: `<task-root>/<slug>/evidence/<session-name>/` holds ignored support captures, while the local durable receipt is the next indexed `evidence.recording` iteration from `references/evidence_template.md`. The task root is ignored by the project `.gitignore`; never stage its capture files, receipt or `index.json`. Outside a task use `.artifacts/evidence/<session-name>/`. Upload captures to a durable, reviewer-accessible host; neither ignored local paths nor the receipt alone publish them.

UI recorder sessions produce `evidence.mp4`, `report.md`, `manifest.json`, `capture/`, `frames/`, and `events.jsonl`. Non-UI sessions keep the original captured transcript or probe output, invocation, environment, exit status, and a `report.md` with observed assertions under their session directory.

## The recorder

`EVIDENCE` below is `scripts/evidence.py` inside this skill's directory (for example `~/.agents/skills/record-evidence/scripts/evidence.py`). It needs Python 3.8+, `ffmpeg` and `ffprobe` with an H.264 encoder. Text overlays need Pillow (`python3 -m pip install pillow`) or ImageMagick; nothing depends on ffmpeg's text filters. Every command prints one JSON value (an array when several sessions are given); errors go to stderr as JSON with a non-zero exit.

| Command | Does |
|---|---|
| `doctor` | Checks ffmpeg, the overlay backend and font, and which sources are capturable now (`capture_sources`, `auto_source`). Exit 1 only when ffmpeg is unusable. |
| `devices` | Lists Android devices and AVDs, iOS simulators with state, and macOS screen indexes. |
| `boot android <avd> [--headless]` / `boot ios <name or udid> [--headless]` | Boots and waits for readiness; prints the serial or UDID. |
| `start --output DIR --title T [--source S] [--target X] [--label L] ...` | Starts the recorder under a supervisor; prints the session path. |
| `narrate SESSION... --message M [--hold S]` | Timestamps a narration line (up to 280 chars) shown until the next one. |
| `annotate SESSION... --type setup\|test_start\|assertion [--result passed\|failed\|untested] --message M` | Timestamps a test event (up to 80 chars). Several sessions at once share one message. |
| `stop SESSION [--caveats TEXT] [--video FILE]` | Stops the recorder, corrects timestamps, burns the overlay, writes `report.md` and `manifest.json`, prints `"verified": true`. |
| `render SESSION [--layout overlay\|panel] [--no-narration] [--no-cards]` | Re-renders from the raw capture with other overlay options. |
| `frames SESSION` | Extracts one PNG per test event into `frames/` for review. |
| `pair [SESSION] --before @N\|SECONDS --after @N\|SECONDS --out pair.png [--caption TEXT]` | Builds a labeled before/after image from two moments of the raw capture (`@N` is the Nth test event) or from two PNGs (`--before-file`, `--after-file`). |
| `compose --output DIR SESSION... [--label L]... [--direction h\|v] [--no-align] [--caveats TEXT]` | Stacks finalized sessions side by side, aligned by wall clock, with one shared narration track and merged results. |

Sources (`--source auto` picks the first available in this order):

| Source | Captures | Needs |
|---|---|---|
| `screen` | The desktop: macOS `avfoundation` (Screen Recording permission for the terminal or agent host), Linux `x11grab` (`DISPLAY`) or `wf-recorder` (`WAYLAND_DISPLAY`, wlroots compositor). `--geometry WxH --offset X,Y` crops. | ffmpeg |
| `android` | One emulator or device (`--target <serial>`; optional when exactly one is connected). Uses `scrcpy --no-playback --record` when installed, otherwise `adb shell screenrecord` in 180 s segments. Works with `emulator -no-window`. | adb; scrcpy optional |
| `ios` | One booted simulator (`--target <name or udid>`; optional when exactly one is booted) through `xcrun simctl io recordVideo`. Works without Simulator.app open. | macOS, Xcode tools |
| `external` | No recorder. You record with Playwright (or any tool) and import the file at `stop --video path.webm`. | the browser tool |
| `test` | A synthetic pattern for toolchain smoke tests. Never present it as evidence; `stop` stamps that warning into the report. | ffmpeg |

Overlay: a 4 s title card (title, commit, branch, environment), the current narration line, a `TEST i/N` chip, a colored `PASS` / `FAIL` / `UNTESTED` toast per assertion, a running tally, and a 4 s summary card listing every test with its result. Single landscape captures get the overlay on the video; single portrait captures (phones) get a side panel with the same content; `--layout` forces either. Composites use a dashboard: each pane's chip, toast, and tally sit in a header above that pane and the narration in a footer, so nothing covers the video.

Crash safety: ffmpeg captures write MPEG-TS, so a killed recorder still yields playable footage. A supervisor process owns the recorder; `stop` asks it to finish gracefully, escalating only when it ignores the request. Nothing signals a bare PID. If the supervisor died and the recorder still runs, `stop` refuses and names the PID; if it never recorded what it started, `stop` waits for `--accept-untracked-recorder` after you have checked for a stray recorder yourself.

Timing: video zero is the recorder's real start (first bytes written, or its own "Recording started" line), not the moment `start` returned. `adb screenrecord` and `simctl recordVideo` emit frames only while the display changes; their timestamps stay correct mid-recording, and when the screen is static at the end the last frame is held to the true stop time. Both corrections appear under Notes in the report and as `timing` in `manifest.json`.

## Steps

### 0. Locate the task and bind the revision

Locate the task and read `task.md` and current indexed `implementation.receipt` and `planning.plan` or `planning.structure` when applicable. Include bug reproduction and review-feedback targets. Record the tested code commit SHA, branch, and PR head SHA when a PR exists. If uncommitted behavior-changing files are under test, commit them before capture; record the exact deployment/build identity for a remote surface. A later artifact-only commit may move the PR head without changing the tested behavior; compare the tested revision with the publication head and recapture if any behavior-changing code differs.

### 1. Check the UI toolchain when recording video

```bash
python3 $EVIDENCE doctor
```

Read `capture_sources` and `overlay_ready` before choosing a UI path. No overlay backend: install Pillow, or keep assertions in `report.md` and disclose that the video has no burned-in text. For non-UI work, use the capture path in step 4 instead of requiring ffmpeg or a screen source.

### 2. Prepare each surface

Follow `references/device_setup.md` for the exact commands. In short:

- **Desktop**: maximize the window, close popups and unrelated panels, navigate to the starting state before recording unless setup itself is under test.
- **Android**: `boot android <avd> --headless` (or use a running emulator from `devices`), `adb install`, `adb shell am start`. Drive with `adb shell input tap|swipe|text|keyevent`, or Maestro.
- **iOS**: `boot ios "<name>" --headless`, `xcrun simctl install`, `xcrun simctl launch`. Drive with Maestro, `idb ui tap`, or XCUITest; `simctl` has no tap command.
- **Browser without a display**: write the Playwright `record.mjs` from the reference and run it right after `start --source external`.

### 3. Start one UI recording per surface

```bash
python3 $EVIDENCE start \
  --output <task-root>/<slug>/evidence/<surface> \
  --title "<what is being verified>" \
  --source android --target emulator-5554 --label "Android" \
  --commit "$(git rev-parse HEAD)" --branch "$(git branch --show-current)" \
  --environment "<OS / browser / device / deployment>"
```

Keep the printed `session` path (`SESSION=...`). Use the same `--title` and distinct `--label` values for sessions you will compose. Add a `setup` annotation describing the starting state.

### 4. Test live, capturing each assertion

For UI work, perform every interaction on the live surface while recording. Work at a watchable pace: let the UI settle after each action so the state change is visible.

- Before each UI step, `narrate` what the viewer is about to see and why it matters; read `references/narration_guide.md` for voice and timing.
- At each named UI test, `annotate --type test_start --message "It should ..."`.
- After each UI check, look at the screen, then `annotate --type assertion --result passed|failed|untested --message "..."`.
- Multi-device: pass every session path to the same `narrate` or `annotate` call when the statement applies to all of them; call per session when it does not.
- When `doctor` lists an input tool for a surface (Maestro, idb, adb), use it. Mark a flow `untested` only when no actuator can drive it, or when driving it needs data you must not record.

For a CLI, start a terminal recorder such as `script` or `asciinema` before invoking the actual changed command. Save the resulting terminal transcript or recording, including the command, output, exit status, and a real success/failure transition; note the terminal/OS and tested revision in `report.md`. For an API or performance change, capture the executable probe, request parameters, response or error, status and measured values in `probe-output.txt`; include before/after measurements when the claim is comparative. For agent behavior, export the actual session excerpt showing the tool call, response, and outcome, with timestamps and revision. Preserve raw captured output rather than replacing it with a paraphrase. Redact secrets before hosting while retaining the result needed to verify the behavior.

One assertion per meaningful state change. A test that cannot run is `untested` with the reason, never skipped silently. Any failed required assertion blocks publication.

### 5. Stop and inspect UI recording; inspect non-UI captures

```bash
python3 $EVIDENCE stop "$SESSION" --caveats "<untested items and why; timing notes; or None.>"
python3 $EVIDENCE frames "$SESSION"
```

`stop` prints `"verified": true` on success. `finalization_failed`: fix the reported cause and run `stop` again (it does not signal the recorder twice). `recorder_lost`: follow the printed instruction. Open every PNG in `frames/` and confirm the state and the label are visible at each assertion; when timestamps look shifted, check `timing.offset_applied` in `manifest.json` and re-run `render` or, for external videos, `stop --force --video ... --video-offset S`. Fill Caveats with `--caveats` or edit `report.md`; the placeholder must not survive.

For non-UI work, close the terminal recorder and inspect the saved transcript, probe output, or agent export. Confirm the invoked command/tool call, real output, exit status, expected transitions, and secret redactions remain legible. Check the report against the capture; synthetic assertions or terminal output copied into a report without its original capture fail this step.

### 6. Compose multi-device UI recordings when applicable

```bash
python3 $EVIDENCE compose --output <task-root>/<slug>/evidence/composite \
  "$ANDROID" "$IOS" --label "Android" --label "iPhone 17" \
  --caveats "<per-pane caveats>"
```

Panes align by wall clock (a pane that started later shows a dark hold first); `--no-align` starts all at zero. Each pane keeps its own test chip, toasts, and tally in the header above it; narration merges into the footer (identical lines from several panes appear once; different lines within 3 s appear together with pane prefixes); the summary card lists every test prefixed with its pane label. Review `frames` on the composite as in step 5.

### 7. Record and publish the evidence

- UI `report.md` records result, revision, environment, capture details, per-test timestamps, narration, and caveats. For non-UI work, make the same report point to the original terminal transcript, probe output, or agent-session export and the command/tool invocation and exit status.
- Upload the actual video or non-UI capture to a durable reviewer-accessible location for a task PR. For GitHub attachment, use an authenticated browser's PR editor/comment upload; `gh pr comment` cannot attach a local video. Another host is acceptable if reviewers can open the URL. If only GitHub PR uploads are available and no PR exists, create a draft PR with committed code as an upload container, following the conventional title/base rules in `/describe-pr`; keep it draft until evidence and both links are verified. Open the hosted URL and verify it displays/plays the capture. A local path, summary, or ignored file is insufficient.
- Record the next immutable local `evidence.recording` iteration through the conventions' Recording an artifact flow using `references/evidence_template.md`. Set `status` to the worst result; include the tested code SHA, branch, PR head SHA if available, capture type, test results, caveats, session files, and verified hosted capture URL. Keep the canonical path and `index.json` ignored.
- Hand the verified hosted URL and receipt to `/describe-pr`, which publishes it in the PR description **and** a distinct PR comment and verifies both rendered links and the comment URL, whether the PR existed before recording or is created afterward. Attach the same capture to a tracker issue when applicable.
- Before publication, compare the current PR head with the tested revision. Artifact-only commits may advance the head; if behavior-changing code differs, recapture against the new revision and record a new `evidence.recording` iteration. A failed assertion, capture/upload failure, inaccessible hosted URL, or stale code revision blocks publication; repair and recapture, not a prose claim.
- Send the report and hosted capture to the requester.

## No computer-use tools? Drive another way

The recording rule holds unchanged; only the input mechanism differs.

- **Desktop with a display**: use `cua-driver` (macOS, Linux) as the actuator: `cua-driver doctor`, then per interaction `launch_app` or `get_window_state` (accessibility tree plus screenshot), act via `element_token`, `verify_state` for the postcondition; each `verify_state` maps to one `assertion`. Keep the bundled recorder for the video when `doctor` shows a screen source; otherwise `cua-driver recording start <dir>` / `stop` writes `<dir>/recording.mp4` (verify it exists; on Linux it needs ffmpeg).
- **Android**: `adb shell input ...` and `adb exec-out screencap -p` for looking, or Maestro flows.
- **iOS simulator**: Maestro (`maestro test flow.yaml`), `idb ui tap`, or the app's own UI tests; `xcrun simctl io <udid> screenshot` for looking.
- **Browser**: Playwright with `recordVideo`, imported through the `external` source.

## When UI video is unavailable

Headless emulators and simulators can still record video; browsers record through Playwright (`external`). If no video path can capture a changed UI, report the missing recorder or access permission and block PR publication until it is available. Screenshots may supplement but cannot replace the live video. CLI, API, performance, and agent-session work instead use their original terminal output, measured probe, or transcript from step 4.


For a bug fix, keep the pre-fix failure and post-fix success together in the evidence report. A UI recording may use `pair` for labeled before/after frames; a CLI/API fix uses captured failing and passing runs. Bind the post-fix result to the tested revision.

## Guardrails

- The video shows the actual session being driven live. Never present scripted playback, stitched clips, or synthetic footage as a recording.
- Never record a half-covered or tiled window; maximize first.
- Never record a screen showing secrets, tokens, customer data, or payment details; mark that flow `untested` and say why.
- Narration describes what the viewer sees and what it proves; it never claims what the screen does not show.
- When verifying a fix, show or reference the old failure alongside the new success.
- Always state the exact tested code commit, branch, and PR head when present; recapture after a behavior-changing head update.

## Capture hygiene

- Confirm the server or build you probe is yours: `lsof -i :<port>` (or `ss -ltnp "sport = :<port>"`), then `ps -p <pid> -o args=`; on devices, `adb shell dumpsys package <id> | grep versionName` or `xcrun simctl get_app_container <udid> <bundle>`.
- Evidence complements the repository's checks (typecheck, build, tests); it never replaces them.
- Evidence directories and task receipts are never committed; the repository `.gitignore` excludes the task root.

## Final response

Choose the template by situation and use it only:

- In a task, every required test passed and capture/revision/host checks passed: `references/evidence_final_answer.md`, which hands off to `/describe-pr`.
- In a task, a test failed or capture/revision/host verification failed: use `references/evidence_failed_answer.md` when a plan exists, or state the precise blocker and repair path for a oneshot/bugfix; do not hand off to `/describe-pr`.
- No task: `references/evidence_standalone_answer.md`, which ends with the recording's state and attachment action because no delivery step follows.

`{artifact_link}` is the receipt's canonical task-root-relative path. `{report_link}` is a relative link to the session/composite `report.md`. `{summary}` is the receipt's `summary`. A legacy task without `index.json` follows the conventions' legacy rules.
