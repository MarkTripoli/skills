---
name: record-evidence
description: Run for /record-evidence requests. Record narrated video proof of behavior while testing it live. Captures a desktop screen, Android emulator, iOS simulator, or headless browser; burns narration and pass/fail assertions into the video; composes several devices side by side; writes the report to attach to the PR and tracker.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Record Evidence

Record proof of behavior, narrate it, and attach it to the PR and tracker issue instead of claiming it in prose.

Inside a task this is an optional phase of the delivery workflow: it runs after implementation and before `describe-pr`, when the user inserts it (`/record-evidence` at the implementation gate, `with: [record-evidence]` in `task.md`, or `/run-task --with record-evidence`). Passed or untested evidence hands off to `/describe-pr`; a failed test hands off to `/iterate-implementation` with the plan, because failing evidence is feedback, not a pull request. Outside a task the skill stands alone and no phase follows.

The recording is the capture of you testing the app live: start the recorder, then drive the app yourself through each test target while adding narration and Jest-style assertions that the recorder timestamps and burns into the video. Every action in the video is the test being performed; a recording that does not show that live session is not evidence.

## Inputs

- **Test targets** (required): behaviors or flows to verify, phrased as testable statements.
- **Surfaces** (default: whatever `doctor` detects): desktop screen, Android emulator or device, iOS simulator, headless browser. Several at once are fine.
- **PR / issue** (optional): where to post. Omitted: deliver to the requester only.

## Where evidence lives

Inside a task: `.agents/tasks/<slug>/evidence/<session-name>/` (one directory per recorded surface, plus `composite/` for a side-by-side), and a numbered receipt `NN-evidence-<slug>.md` in the task directory written from `references/evidence_template.md`, which is how later phases and `run-task` see that this phase ran. Outside a task: `.artifacts/evidence/<session-name>/`; append `.artifacts/` to `.gitignore` when the file exists and lacks it. Recordings are uploaded, never committed; the receipt is a task artifact like any other.

Each session directory ends up with `evidence.mp4` (overlay burned in), `report.md`, `manifest.json`, `capture/` (raw footage), `frames/` (review stills), and `events.jsonl`.

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

### 0. Locate the task

Locate the task directory and read `task.md` per the conventions when the request belongs to a task; a standalone request needs none. In a task, the test targets come from the newest `implementation` artifact's summary and the plan or structure outline it implemented (the newest artifact of type `plan` or `structure-outline`), unless the user named other targets. Note the revision under test: `git rev-parse HEAD`, `git branch --show-current`, or the deployment URL.

### 1. Check the toolchain

```bash
python3 $EVIDENCE doctor
```

Read `capture_sources` and `overlay_ready` before choosing a path. No overlay backend: install Pillow, or continue and keep the assertion list in `report.md` as the record (the video then carries no burned-in text; the report says so).

### 2. Prepare each surface

Follow `references/device_setup.md` for the exact commands. In short:

- **Desktop**: maximize the window, close popups and unrelated panels, navigate to the starting state before recording unless setup itself is under test.
- **Android**: `boot android <avd> --headless` (or use a running emulator from `devices`), `adb install`, `adb shell am start`. Drive with `adb shell input tap|swipe|text|keyevent`, or Maestro.
- **iOS**: `boot ios "<name>" --headless`, `xcrun simctl install`, `xcrun simctl launch`. Drive with Maestro, `idb ui tap`, or XCUITest; `simctl` has no tap command.
- **Browser without a display**: write the Playwright `record.mjs` from the reference and run it right after `start --source external`.

### 3. Start one session per surface

```bash
python3 $EVIDENCE start \
  --output .agents/tasks/<slug>/evidence/<surface> \
  --title "<what is being verified>" \
  --source android --target emulator-5554 --label "Android" \
  --commit "$(git rev-parse HEAD)" --branch "$(git branch --show-current)" \
  --environment "<OS / browser / device / deployment>"
```

Keep the printed `session` path (`SESSION=...`). Use the same `--title` and distinct `--label` values for sessions you will compose. Add a `setup` annotation describing the starting state.

### 4. Test live, narrating and asserting

Perform every interaction on the live surface; the recording is that session. Work at a watchable pace: let the UI settle after each action so the state change is on video.

- Before each step, `narrate` what the viewer is about to see and why it matters, in one or two sentences. Read `references/narration_guide.md` for voice and timing.
- At each named test, `annotate --type test_start --message "It should ..."`.
- After each check, look at the screen, then `annotate --type assertion --result passed|failed|untested --message "..."`.
- Multi-device: pass every session path to the same `narrate` or `annotate` call when the statement applies to all of them; call per session when it does not. In a composite, pane-specific narration lines given within 3 s of each other share one footer entry, each prefixed with its pane label.
- When `doctor` lists an input tool for a surface (Maestro, idb, adb), use it. Mark a flow `untested` only when no actuator can drive it, or when driving it needs data you must not record.

Assertion rules: one assertion per meaningful state change; use "Precondition: ..." for starting state; keep messages high-signal (the recorder rejects over 80 characters); a test that cannot run is `untested` with the reason, never skipped silently; the timestamp records when you asserted, not whether it was true.

### 5. Stop and review

```bash
python3 $EVIDENCE stop "$SESSION" --caveats "<untested items and why; timing notes; or None.>"
python3 $EVIDENCE frames "$SESSION"
```

`stop` prints `"verified": true` on success. `finalization_failed`: fix the reported cause and run `stop` again (it does not signal the recorder twice). `recorder_lost`: follow the printed instruction. Open every PNG in `frames/` and confirm the state and the label are visible at each assertion; when timestamps look shifted, check `timing.offset_applied` in `manifest.json` and re-run `render` or, for external videos, `stop --force --video ... --video-offset S`. Fill Caveats with `--caveats` or edit `report.md`; the placeholder must not survive.

### 6. Compose multi-device recordings

```bash
python3 $EVIDENCE compose --output .agents/tasks/<slug>/evidence/composite \
  "$ANDROID" "$IOS" --label "Android" --label "iPhone 17" \
  --caveats "<per-pane caveats>"
```

Panes align by wall clock (a pane that started later shows a dark hold first); `--no-align` starts all at zero. Each pane keeps its own test chip, toasts, and tally in the header above it; narration merges into the footer (identical lines from several panes appear once; different lines within 3 s appear together with pane prefixes); the summary card lists every test prefixed with its pane label. Review `frames` on the composite as in step 5.

### 7. Post the evidence

- `report.md` is the report: result line, revision, environment, capture details, per-test table with timestamps, narration transcript, notes, caveats. Extend it rather than rewriting it.
- In a task, take the next artifact number and write `NN-evidence-<slug>.md` from `references/evidence_template.md`: set `status` to the worst result across every test (`passed`, `untested`, `failed`), fill `summary`, list every session's `report.md` and video path, copy the per-test table, the caveats, and where the video was posted. Save the file.
- Post the video and the result summary as a PR comment, or in the PR description when it is your PR. `gh pr comment` cannot attach a local video: upload `evidence.mp4` (or `composite.mp4`) through the PR comment box in an authenticated browser, or upload it to a host and link it. Reopen the comment and confirm the video plays before claiming it is posted.
- Attach the same video to the tracker issue with a one-line result.
- Send the report and recording to the requester.

## No computer-use tools? Drive another way

The recording rule holds unchanged; only the input mechanism differs.

- **Desktop with a display**: use `cua-driver` (macOS, Linux) as the actuator: `cua-driver doctor`, then per interaction `launch_app` or `get_window_state` (accessibility tree plus screenshot), act via `element_token`, `verify_state` for the postcondition; each `verify_state` maps to one `assertion`. Keep the bundled recorder for the video when `doctor` shows a screen source; otherwise `cua-driver recording start <dir>` / `stop` writes `<dir>/recording.mp4` (verify it exists; on Linux it needs ffmpeg).
- **Android**: `adb shell input ...` and `adb exec-out screencap -p` for looking, or Maestro flows.
- **iOS simulator**: Maestro (`maestro test flow.yaml`), `idb ui tap`, or the app's own UI tests; `xcrun simctl io <udid> screenshot` for looking.
- **Browser**: Playwright with `recordVideo`, imported through the `external` source.

## No GUI at all

Emulators and simulators run headless and record fine: `boot ... --headless` then the steps above. Browsers record through Playwright (`external`). Only when nothing can record video, keep the same discipline as files: number captures in test order with the assertion in the name (`01-precondition-signed-in.png`, `02-it-saves-on-blur-passed.png`), keep the capture script beside them so the run is repeatable, and write the same per-test table into `report.md` by hand.

## Non-UI changes still need evidence

- **API / performance**: a scripted probe with measured numbers (request counts per phase, latency before and after) saved as `probe-output.txt`.
- **Rendering / canvas / shader**: rendered frames plus pixel assertions (diff values), reviewed by eye and saved as PNGs.
- **Agent behavior**: the transcript excerpt showing the tool call and its response.
- **Bug fixes**: reproduce and capture the failure before writing the fix; that capture is the "before" half. `pair --before-file failure.png --after-file fixed.png --caption "..."` produces the labeled pair; inside one recording, `pair SESSION --before @1 --after @3` uses the frames at those test events.

## Guardrails

- The video shows the actual session being driven live. Never present scripted playback, stitched clips, or synthetic footage as a recording.
- Never record a half-covered or tiled window; maximize first.
- Never record a screen showing secrets, tokens, customer data, or payment details; mark that flow `untested` and say why.
- Narration describes what the viewer sees and what it proves; it never claims what the screen does not show.
- When verifying a fix, show or reference the old failure alongside the new success.
- Always state the exact commit, branch, or deployment tested against.

## Capture hygiene

- Confirm the server or build you probe is yours: `lsof -i :<port>` (or `ss -ltnp "sport = :<port>"`), then `ps -p <pid> -o args=`; on devices, `adb shell dumpsys package <id> | grep versionName` or `xcrun simctl get_app_container <udid> <bundle>`.
- Evidence complements the repository's checks (typecheck, build, tests); it never replaces them.
- Evidence directories are never committed.

## Final response

Choose the template by situation and use it only:

- In a task, every test passed or untested: `references/evidence_final_answer.md`, which hands off to `/describe-pr`.
- In a task, any test failed: `references/evidence_failed_answer.md`, which hands off to `/iterate-implementation @{plan_file}`; `{plan_file}` is the name of the plan or structure outline being implemented.
- No task: `references/evidence_standalone_answer.md`, which ends with `/show-me` because no phase follows.

`{artifact_link}` is a relative Markdown link to the receipt, `[NN-evidence-slug.md](.agents/tasks/<slug>/NN-evidence-slug.md)`. `{report_link}` is a relative Markdown link to `report.md` of the session (or the composite), relative to the repository root, or to the current directory when there is no task directory. `{summary}` is the receipt's `summary`.

If the invoking prompt named a reply file, write this complete reply to it verbatim after printing it.
