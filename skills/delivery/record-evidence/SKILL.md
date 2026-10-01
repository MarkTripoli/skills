---
name: record-evidence
description: Record authentic pre-mutation baselines with /record-evidence --baseline and inspected current evidence before publication. Capture only task-scoped UI video, terminal output, API probes, or agent transcripts; seal revision-bound receipts and verified hosted captures.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# Record Evidence

Record the behavior against the delivered revision. UI evidence is a live video of the interaction, not assertions alone; CLI, API/performance, and agent behavior require captured terminal sessions, probe output, or tool-call transcripts with the observed result. The PR description and a distinct PR comment both link directly to the verified hosted capture.

Delivery has two capture boundaries: `/record-evidence --baseline` before the first source or check mutation, and `/record-evidence` after current verification and review. Both use the same recorder. Final recording hands off to `/iterate-evidence` for the bounded inspection/repair gate, never directly to publication. Outside delivery, recording remains standalone and grants no repair authority.

## Inputs

- **Test targets** (required): behaviors or flows to verify, phrased as testable statements; in a task derive them from the change and acceptance criteria when not supplied.
- **Surfaces** (default: the changed behavior): live UI uses a desktop screen, Android emulator or device, iOS simulator, or headless browser; non-UI uses a captured terminal session, API/performance probe output, or agent tool transcript.
- **PR / issue** (optional outside a task): where to post. Every delivery PR requires a direct hosted capture URL in its description and a distinct comment, including when the PR is created after capture.
- **Mode**: `--baseline` freezes delivery policy and captures existing behavior before mutation. Default captures the implemented revision. A task that delivers an PR requires both receipts, including oneshot, bugfix, and epic children.

## Where evidence lives

Capture into external scratch outside the resolved task root. Durable `evidence.baseline`/`evidence.recording` iterations contain provenance metadata only; allocate, stage and record through the conventions. Never upload task files, reports or receipts. Retain baseline/current original captures and samples through inspection and repair; remove scratch after delivery completes with verified hosted PR readback.
- Existing UI uses authentic `BEFORE` and current `AFTER` sessions, composed with those labels and `--no-align`. Existing non-UI retains failing/baseline and current original output.
- New behavior needs an explicit policy exemption, never a fabricated baseline.
- The PR body and distinct same-PR comment are durable publication proof, not local receipts.

UI sessions contain `evidence.mp4`, `report.md`, `manifest.json`, raw footage under `capture/`, and `events.jsonl`. Extract bounded review frames for required state claims. Non-UI sessions retain the actual input, output, exit status, and reproducible command in addition to `report.md`. A prose report is not a capture.

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
| `stop SESSION [--caveats TEXT] [--video FILE] [--max-height N]` | Stops the recorder, corrects timestamps, burns the overlay, writes `report.md` and `manifest.json`, prints `"verified": true`. Final media defaults to 720 pixels high; `--max-height 0` keeps native height. |
| `render SESSION [--layout overlay\|panel] [--no-narration] [--no-cards] [--max-height N]` | Re-renders from the raw capture with other overlay options; defaults to 720 pixels high and accepts `--max-height 0` for native height. |
| `frames SESSION` | Extracts one bounded PNG per selected test event into `frames/` for review when needed. |
| `pair [SESSION] --before @N\|SECONDS --after @N\|SECONDS --out pair.png [--caption TEXT]` | Builds a bounded labeled before/after image from two moments of the raw capture (`@N` is the Nth test event) or two PNG files (`--before-file`, `--after-file`). |
| `compose --output DIR SESSION... [--label L]... [--direction h\|v] [--size N] [--max-height N] [--max-width N] [--no-align] [--caveats TEXT]` | Stacks finalized sessions side by side, aligned by wall clock, with one shared narration track and merged results. Defaults to 720 pixels high and a 1920-pixel width limit. |

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
Steps 1–6 apply to UI recording. Non-UI work uses [captured output](#non-ui-changes-still-need-captured-evidence), inspects that output, and joins step 7. It needs neither ffmpeg nor a synthetic video.

### 0. Freeze or load the delivery boundary

In a task, read `task.md` and the selected plan, outline, reproduction, or implementation artifact. For delivery, read [the evidence commands](references/delivery_contract.md). Optionally run `status` to see what publication still lacks. Standalone recording derives targets from the request and skips sealing.

With `--baseline`, derive stable surface IDs, targets, expectations, and `existing`/`new` classifications from the approved task. Save the policy through the helper. Capture existing behavior now (best before product edits; after edits, capture it from a temporary `git worktree add <tmp> <base-sha>` and pass that SHA as `baseline_commit`), inspect it, and record and seal the next `evidence.baseline` metadata iteration. A bug's authentic failing result is a valid baseline, not failed recording. New-only work still saves policy plus the explicit exemption receipt; no fabricated old screen. Reproduction may reuse the captured failure when its source, environment, targets, and hashes match.

Without `--baseline`, load that sealed policy and baseline and capture the current source/build. A missing baseline is captured from the base commit in a temporary worktree, never by resetting the checkout or backdating a receipt. A new repair capture never replaces the original baseline. A surface that cannot be captured is recorded `untested` with a reason.

Record source identity using the helper and prove the running build loaded it with observed process/build/deployment output. Record the environment and exact probe. HEAD alone does not identify dirty source or a stale server.

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
  --output <external-scratch>/<surface> \
  --title "<what is being verified>" \
  --source <screen|android|ios|external> --label "<policy surface>" \
  --commit "$(git rev-parse HEAD)" --branch "$(git branch --show-current)" \
  --environment "<OS / browser / device / deployment>"
```

Keep the printed session path. Baseline mode records only the original `BEFORE` session; final mode records only the current `AFTER` session and references the saved baseline. Net-new work records one current-state session. Use policy targets and meaningful assertions; record starting state before the first interaction. Select only requested surfaces: web-only work does not boot Android or iOS merely because `doctor` detects them.

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

`verified: true` proves media finalization, not correct behavior. Read [inspection acceptance](../iterate-evidence/references/inspection_acceptance.md), then open each required target's recorded state and the initial state of each session. Inspect intervals rather than sparse stills for temporal claims. Save exact sample paths, hashes, timestamps, observed pixels, and viewer/tool trace references. For non-UI evidence, read the retained output and cite decisive lines. Missing viewing capability blocks the affected proof.

On `finalization_failed` or `recorder_lost`, preserve the failure and name the repair/access prerequisite. For shifted timestamps, use manifest timing and rerender the same footage, or correct external import with observed offset. A rerender is not a new capture. Keep the original media and explain the correction.

### 6. Compose the required comparison

```bash
python3 $EVIDENCE compose --output <external-scratch>/composite \
  "$BEFORE" "$AFTER" --label "BEFORE" --label "AFTER" \
  --no-align --caveats "<per-session caveats>"
```

Existing UI final evidence uses this comparison, selecting the original sealed baseline and current session for the same surface. `--no-align` starts both at their own zero; wall-clock alignment would insert the entire development gap. Inspect the resulting composite and its `BEFORE`/`AFTER` labels before upload. Baseline mode and new-only work skip this step.

Cross-device composition is separate and only applies when the task requires several devices. Keep surface identities, source sessions, and per-pane results; do not substitute a cross-device montage for the required before/after comparison. Review frames stay local.

The default composite is sized for review screens: `compose` uses a 720-pixel maximum output height and caps a default horizontal composite at 1920 pixels wide. `--max-height` overrides the height; `--max-height 0` keeps native height and removes the default width cap unless `--max-width` is set. `--size` explicitly overrides default pane sizing, and `--max-width` changes or disables (`0`) the width bound.

For a `/deliver` UI task, capture each requested policy-scoped device as a real session, with start, changed-state and final screenshots. Record device name and viewport. A cross-device composite may supplement those sessions, but cannot replace either. If a required surface cannot be exercised, mark it `untested` with the reason; incomplete required proof blocks ready publication and belongs in Known limits. The PR description's `## UI Evidence` section must contain the direct media URLs; a comment alone is insufficient.

### 7. Host the capture and record provenance

Read [the strict publication proof policy](https://github.com/MarkTripoli/skills/blob/main/shared/publication-proof-policy.md) before hosting. Preserve tested/current-head full SHAs, substantive passing recorded tests/cues, paired recording types/direct capture URLs in the full PR body and distinct same-PR comment. Original text must include the real invocation, observed stdout (including Node stdout, `OK`, `[]` or `true`), tested SHA and final successful exit/status. A preliminary success never overrides a trailing failure. For interactive script captures, immediately run `printf 'exit=%s\n' "$?"` after the changed command; the shell trailer alone does not prove it passed. Text readback caps at 8 MiB, UI at 128 MiB with ffprobe/ffmpeg frame decode; fetch complete HTTP 200 bytes, never a prefix. Existing custom publication hooks still run.


1. Save `report.md` with tested source/build, environment, commands/interactions, observed results and timestamps or output lines, device/viewport and capture filenames when relevant, and limits. Include the result line, per-test table, narration transcript, and caveats. Standalone recording stops at its report and requested attachment procedure; steps 2–6 are delivery checkpoints only.
2. Record the immutable indexed receipt from `references/evidence_template.md`. Baseline uses `type: evidence-baseline`; final uses `type: evidence`. List each requested device session and its video and screenshot paths and direct URLs. Retain failed and blocked outcomes; `untested` results keep their reason.
3. Build the JSON record in [the contract reference](references/delivery_contract.md) from actual files and observations. In baseline mode, seal it now; no upload is required. Final mode first completes step 4.
4. For final delivery, upload each required surface's video and representative screenshots to an authorized host with direct links. An authenticated PR upload box or another host returning direct URLs can be used; `gh pr comment` cannot attach local media. Remove any placeholder upload comment. Open every direct file URL and inspect playback/readability; retain that observation in the finished receipt. Add the URLs/local captures to the input and run `seal`, which computes hashes and verifies hosted bytes, media, policy, and revision. A comment permalink, upload response, or URL string alone is insufficient.
5. On a missing capture without a reason, missing inspection, or revision mismatch, save the blocker and stop. Unreadable, redirected-to-login, mismatched or incomplete hosted bytes block sealing and ready publication; record the exact prerequisite. A failed behavior result retains its recording and routes to bounded repair; do not repair product source inside this skill.
6. Keep returned seal details in the reply without changing the sealed receipt. Baseline hands back to the caller; final hands off to `/iterate-evidence`. Only successful current-revision inspection supports `/describe-pr`.

`describe-pr` later publishes the selected direct URLs in both the PR description and a distinct comment, then verifies both. Leave the sealed evidence receipt unchanged; publication links belong in the PR description. A standalone recording posts only to explicitly requested destinations, reopens them, and has no automatic delivery handoff. Attach the same video to the tracker issue with a one-line result when the task requests it, and send the report and recording to the requester when requested.

## No computer-use tools? Drive another way

The recording rule holds unchanged; only the input mechanism differs.

- **Desktop with a display**: use `cua-driver` (macOS, Linux) as the actuator: `cua-driver doctor`, then per interaction `launch_app` or `get_window_state` (accessibility tree plus screenshot), act via `element_token`, `verify_state` for the postcondition; each `verify_state` maps to one `assertion`. Keep the bundled recorder for the video when `doctor` shows a screen source; otherwise `cua-driver recording start <dir>` / `stop` writes `<dir>/recording.mp4` (verify it exists; on Linux it needs ffmpeg).
- **Android**: `adb shell input ...` and `adb exec-out screencap -p` for looking, or Maestro flows.
- **iOS simulator**: Maestro (`maestro test flow.yaml`), `idb ui tap`, or the app's own UI tests; `xcrun simctl io <udid> screenshot` for looking.
- **Browser**: Playwright with `recordVideo`, imported through the `external` source.

## No GUI at all

Emulators and simulators run headless and record video: `boot ... --headless` then the steps above. Browsers record through Playwright (`external`). If UI video cannot be captured, repair the recorder or access; screenshots and assertions alone do not satisfy UI evidence. A non-UI change instead uses the real terminal or probe output below, with captured input, output, exit status, and revision.

## Non-UI changes still need captured evidence

- **CLI**: create `<external-scratch>/cli/`, then start `script -q <external-scratch>/cli/terminal-session.txt` (or the platform's equivalent terminal recorder). Type the changed command against real inputs, immediately type `printf 'exit=%s\n' "$?"`, and exit the recorder. Keep the command, stdout/stderr, exit status, and before/after behavior relevant to acceptance in the transcript; inspect it for readable output and secrets before upload. Cite its output lines in `report.md`.
- **API / performance**: run a repeatable probe and save its real requests, responses, exit status, and measured numbers (such as request counts per phase or latency before and after) as `probe-output.txt`; include the probe command or script and environment.
- **Rendering / canvas / shader**: capture rendered frames and pixel assertions (diff values), review by eye, and save as PNGs; interactive UI also requires live video.
- **Agent behavior**: capture the actual agent input, tool call, tool response, and observable outcome in a redacted `agent-transcript.txt`, with source run identification.
- **Bug fixes**: capture the real failure before fixing product or check source, then the current passing behavior. A `pair` image can supplement but never replace an existing UI's live before/after composite.

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
- Evidence directories remain ignored; their recordings are not committed.

## Final response

Choose the template by situation and use it only:

- Delivery baseline sealed: use `references/evidence_baseline_answer.md`, filling `{next_command}` with `/iterate-implementation` (task-only) or the plan's implementation skill. Report the policy, baseline receipt, inspected targets/exemptions, and source revision. If called inside a mutation skill, return the checkpoint to that caller before it dispatches any edits.
- Delivery final sealed: `references/evidence_final_answer.md` hands off to `/iterate-evidence` for inspection, including captured failures. The default repair allowance is three; this skill consumes none.
- Missing capture/inspection/hosting/baseline: report the exact blocked prerequisite and saved partial artifacts, without a publication handoff.
- Standalone: `references/evidence_standalone_answer.md`, with observed state and requested attachment action only.

`{artifact_link}` is the full task-root-relative canonical receipt path selected through index.json. `{report_link}` is a relative Markdown link to `report.md` of the session (or the composite), relative to the repository root, or to the current directory when there is no task directory. `{summary}` is the receipt's `summary`.
