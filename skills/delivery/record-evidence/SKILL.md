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
- **Surfaces**: UI screen/device/browser, CLI terminal, API/performance probe, or agent session. Derive all required surfaces from changed behavior and acceptance criteria, not source file extensions. Record at least one authentic capture per required surface; compose related UI devices into a single inspectable video when appropriate.
- **PR / issue** (optional outside a task): a task PR ultimately needs every hosted capture in its full description and a distinct same-PR comment. A standalone recording needs no PR; a supplied tracker issue receives a link to the already hosted capture.

## Where evidence lives

Capture into temporary scratch storage outside the configured task root; never save or upload the recording, report, receipt, description, frames, or raw transcript from `.agent/tasks/` or `.agents/tasks/`. The durable review evidence is each directly hosted recording plus concise per-test observations in the full PR description and separate PR comment. A standalone request has its hosted recording and answer without a fabricated PR/comment.

UI recorder sessions produce `evidence.mp4`, `report.md`, `manifest.json`, `capture/`, `frames/`, and `events.jsonl` in scratch storage. Non-UI sessions keep the original captured transcript or probe output, invocation, environment, exit status, and a scratch report until hosted inspection succeeds.

For a task PR, the full body and separate comment bind `- result: passed`, tested full SHA, current-head full SHA and each `recording` type/`capture` URL pair. The body also has a `### Recorded tests` table (`| Test | Result | Capture | Cue |`), with one substantive passed row per capture (`primary` for a sole unlabeled pair), timestamps or output-line cues, and honest caveats. A failed or required-untested test blocks passed publication. Missing, stale, unreadable or mismatched proof blocks readiness.


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
  --output <scratch-dir>/<surface> \
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
python3 $EVIDENCE compose --output "$TMPDIR/evidence-composite" \
  "$ANDROID" "$IOS" --label "Android" --label "iPhone 17" \
  --caveats "<per-pane caveats>"
```

Panes align by wall clock (a pane that started later shows a dark hold first); `--no-align` starts all at zero. Each pane keeps its own test chip, toasts, and tally in the header above it; narration merges into the footer (identical lines from several panes appear once; different lines within 3 s appear together with pane prefixes); the summary card lists every test prefixed with its pane label. Review `frames` on the composite as in step 5.

### 7. Record and publish the evidence

- Inspect the scratch report for tested SHA, environment, exact invocation/interaction, per-test results and timestamp/output-line cue, caveats, and original capture filename. The report is scratch for drafting, not a published artifact or proof by itself.
- Upload the actual video or original terminal/API/agent transcript for **each required surface** to a supported direct host: GitHub user-attachments (via authenticated PR editor/comment upload) or a raw gist. `gh pr comment` cannot attach a local video. Open the hosted object and inspect its bytes/content: UI must play as live video, not a screenshot; text must preserve the original invocation, tested SHA, successful exit/status/outcome, and observed output. A URL, MIME header, HTML page, screenshot, or self-declared result alone is insufficient. Other hosts require explicit gate support; tell the requester rather than claim readiness.
- For a task PR, publish matching result, tested/current-head SHAs, and every recording/capture pair in a **separate PR comment and full PR body**. Use `- recording: <type>`/`- capture: <URL>` for one surface; for mixed surfaces use paired `- recording <label>: <type>`/`- capture <label>: <URL>` with distinct lowercase-hyphenated labels. Include the same direct URLs/types in both locations, a `- comment: <permalink on this PR>` in the body, and the Recorded tests table with passing row per label (`primary` for unlabeled). `/describe-pr` completes the full body and readback; a pending comment is only for a draft. Read back the exact comment and final body; never treat a wrong-PR permalink as proof.
- If the PR does not yet exist and only an attachment can host the capture, create a draft PR as an upload container following `/describe-pr`. Compare head to tested revision; only metadata-only movement can retain the capture, and behavior changes require recapture. Any failed assertion, upload/inspection failure, or missing required capture blocks ready publication and `/describe-pr`.
- If a tracker issue was supplied, post the **already hosted** direct capture links and brief observed results there, then read the issue comment back. Do not upload task data. For a standalone request without a PR, host and inspect the captures, send URLs/results directly to the requester, attach the hosted URLs to a supplied issue if any, and finish without inventing a PR description or comment.

## No computer-use tools? Drive another way

The recording rule holds unchanged; only the input mechanism differs.

- **Desktop with a display**: use `cua-driver` (macOS, Linux) as the actuator: `cua-driver doctor`, then per interaction `launch_app` or `get_window_state` (accessibility tree plus screenshot), act via `element_token`, `verify_state` for the postcondition; each `verify_state` maps to one `assertion`. Keep the bundled recorder for the video when `doctor` shows a screen source; otherwise `cua-driver recording start <dir>` / `stop` writes `<dir>/recording.mp4` (verify it exists; on Linux it needs ffmpeg).
- **Android**: `adb shell input ...` and `adb exec-out screencap -p` for looking, or Maestro flows.
- **iOS simulator**: Maestro (`maestro test flow.yaml`), `idb ui tap`, or the app's own UI tests; `xcrun simctl io <udid> screenshot` for looking.
- **Browser**: Playwright with `recordVideo`, imported through the `external` source.

## When UI video is unavailable

Headless emulators and simulators can still record video; browsers record through Playwright (`external`). If no video path can capture a changed UI, report the missing recorder or access permission and block PR publication until it is available. Screenshots may supplement but cannot replace the live video. CLI, API, performance, and agent-session work instead use their original terminal output, measured probe, or transcript from step 4.


For a bug fix, retain actual pre-fix failure and post-fix success in scratch for inspection and include both observations in hosted proof; when the before/after material cannot fit the selected recording, host an additional authentic capture. A UI pair of frames may supplement but never replace live video; CLI/API fixes need original failing/passing runs. Bind post-fix success to tested SHA.

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
- Scratch captures and reports are deleted after hosted readback; no task-local evidence receipt or recording is created or committed.

## Final response

Choose the situation's template; list **all** hosted capture URLs, tested SHA, current head if a PR exists, each test's result and cue, caveats, and issue/comment links only when those exist. Scratch reports are inspected and removed after hosted readback, never cited as links.

- Task success with every required behavior passed and hosted captures inspected: `references/evidence_final_answer.md`; hand off to `/describe-pr` after publication/readback (or state that the draft awaits final publication by `/describe-pr`).
- Task failure or capture/revision/host blocker: `references/evidence_failed_answer.md` when a plan exists, with `/iterate-implementation` next for implementation failure; for oneshot/bugfix, report the exact blocker and repair command/phase without handing off to `/describe-pr`.
- Standalone without a task or PR: `references/evidence_standalone_answer.md`; host and return the capture/results and optional issue comment, with no fabricated PR/comment and no next phase.
