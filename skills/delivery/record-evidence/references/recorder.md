# Recorder

The recorder needs Python 3.8+, `ffmpeg` and `ffprobe` with an H.264 encoder. Text overlays need Pillow (`python3 -m pip install pillow`) or ImageMagick; nothing depends on ffmpeg's text filters. Every command prints one JSON value (an array when several sessions are given); errors go to stderr as JSON with a non-zero exit.

| Command | Does |
|---|---|
| `doctor` | Checks ffmpeg, the overlay backend and font, and which sources are capturable now (`capture_sources`, `auto_source`). Exit 1 only when ffmpeg is unusable. |
| `devices` | Lists Android devices and AVDs, iOS simulators with state, and macOS screen indexes. |
| `boot android <avd> [--headless]` / `boot ios <name or udid> [--headless]` | Boots and waits for readiness; prints the serial or UDID. |
| `start --output DIR --title T [--source S] [--target X] [--label L] ...` | Starts the recorder under a supervisor; prints the session path. |
| `narrate SESSION... --message M [--hold S]` | Timestamps a narration line (up to 280 chars) shown until the next one. |
| `annotate SESSION... --type setup\|test_start\|assertion [--result passed\|failed\|untested] --message M` | Timestamps a test event (up to 80 chars). Several sessions at once share one message. |
| `stop SESSION [--caveats TEXT] [--video FILE] [--max-height N]` | Stops the recorder, corrects timestamps, burns the overlay, writes `report.md` and `manifest.json`, prints `"verified": true`. |
| `render SESSION [--layout overlay\|panel] [--no-narration] [--no-cards] [--max-height N]` | Re-renders from the raw capture with other overlay options. |
| `frames SESSION` | Extracts one PNG per selected test event into `frames/` for review when needed. PNGs are at most 1920x720 (`--max-width`, `--max-height`; `pair --height`). |
| `pair [SESSION] --before @N\|SECONDS --after @N\|SECONDS --out pair.png [--caption TEXT]` | Builds a bounded labeled before/after image from two moments of the raw capture (`@N` is the Nth test event) or two PNG files (`--before-file`, `--after-file`). |
| `compose --output DIR SESSION... [--label L]... [--direction h\|v] [--size N] [--max-height N] [--max-width N] [--no-align] [--caveats TEXT]` | Stacks finalized sessions side by side, aligned by wall clock, with one shared narration track and merged results. |

Sources (`--source auto` picks the first available in this order):

| Source | Captures | Needs |
|---|---|---|
| `screen` | The desktop: macOS `avfoundation` (Screen Recording permission for the terminal or agent host), Linux `x11grab` (`DISPLAY`) or `wf-recorder` (`WAYLAND_DISPLAY`, wlroots compositor). `--geometry WxH --offset X,Y` crops. | ffmpeg |
| `android` | One emulator or device (`--target <serial>`; optional when exactly one is connected). Uses `scrcpy --no-playback --record` when installed, otherwise `adb shell screenrecord` in 180 s segments. Works with `emulator -no-window`. | adb; scrcpy optional |
| `ios` | One booted simulator (`--target <name or udid>`; optional when exactly one is booted) through `xcrun simctl io recordVideo`. Works without Simulator.app open. | macOS, Xcode tools |
| `external` | No recorder. You record with Playwright (or any tool) and import the file at `stop --video path.webm`. | the browser tool |
| `test` | A synthetic pattern for toolchain smoke tests. Never present it as evidence; `stop` stamps that warning into the report. | ffmpeg |

Overlay: a title card (title, commit, branch, environment), the current narration line, a `TEST i/N` chip, a colored `PASS` / `FAIL` / `UNTESTED` toast per assertion, a running tally, and a summary card listing every test with its result. Single landscape captures get the overlay on the video; single portrait captures (phones) get a side panel with the same content; `--layout` forces either. Composites use a dashboard: each pane's chip, toast, and tally sit in a header above that pane and the narration in a footer, so nothing covers the video.

Crash safety: ffmpeg captures write MPEG-TS, so a killed recorder still yields playable footage. A supervisor process owns the recorder; `stop` asks it to finish gracefully, escalating only when it ignores the request. Nothing signals a bare PID. If the supervisor died and the recorder still runs, `stop` refuses and names the PID; if it never recorded what it started, `stop` waits for `--accept-untracked-recorder` after you have checked for a stray recorder yourself.

Timing: video zero is the recorder's real start (first bytes written, or its own "Recording started" line), not the moment `start` returned. `adb screenrecord` and `simctl recordVideo` emit frames only while the display changes; their timestamps stay correct mid-recording, and when the screen is static at the end the last frame is held to the true stop time. Both corrections appear under Notes in the report and as `timing` in `manifest.json`.

Output is capped at 720 px high (compose: 1920 px wide); `--max-height 0` keeps native size, and `--size` or `--max-width` override pane sizing. Source capture geometry (`--geometry WxH`) does not change the cap.
