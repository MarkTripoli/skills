# Drivers and non-UI capture

## No computer-use tools? Drive another way

The recording rule holds unchanged; only the input mechanism differs.

- **Desktop with a display**: use `cua-driver` (macOS, Linux) as the actuator: `cua-driver doctor`, then per interaction `launch_app` or `get_window_state` (accessibility tree plus screenshot), act via `element_token`, `verify_state` for the postcondition; each `verify_state` maps to one `assertion`. Keep the bundled recorder for the video when `doctor` shows a screen source; otherwise `cua-driver recording start <dir>` / `stop` writes `<dir>/recording.mp4` (verify it exists; on Linux it needs ffmpeg).
- **Android**: `adb shell input ...` and `adb exec-out screencap -p` for looking, or Maestro flows.
- **iOS simulator**: Maestro (`maestro test flow.yaml`), `idb ui tap`, or the app's own UI tests; `xcrun simctl io <udid> screenshot` for looking.
- **Browser**: Playwright with `recordVideo`, imported through the `external` source.

## No GUI at all

Emulators and simulators run headless and record video: `boot ... --headless` then the steps above. Browsers record through Playwright (`external`). If UI video cannot be captured, repair the recorder or access; screenshots and assertions alone do not satisfy UI evidence. A non-UI change instead uses the real terminal or probe output below, with captured input, output, exit status, and revision.

## Non-UI changes still need captured evidence

Before any non-UI capture, run `mkdir -p .agents/tasks/<slug>/evidence && printf '*\n' > .agents/tasks/<slug>/evidence/.gitignore` so raw output stays ignored; `start` does this only for UI sessions.

- **CLI**: create `.agents/tasks/<slug>/evidence/cli/`, then start `script -q .agents/tasks/<slug>/evidence/cli/terminal-session.txt` (or the platform's equivalent terminal recorder). Type the changed command against real inputs, immediately type `printf 'exit=%s\n' "$?"`, and exit the recorder. Keep the command, stdout/stderr, exit status, and before/after behavior relevant to acceptance in the transcript; inspect it for readable output and secrets before upload. Cite its output lines in `report.md`.
- **API / performance**: run a repeatable probe and save its real requests, responses, exit status, and measured numbers (such as request counts per phase or latency before and after) as `probe-output.txt`; include the probe command or script and environment.
- **Rendering / canvas / shader**: capture rendered frames and pixel assertions (diff values), review by eye, and save as PNGs; interactive UI also requires live video.
- **Agent behavior**: capture the actual agent input, tool call, tool response, and observable outcome in a redacted `agent-transcript.txt`, with source run identification.
- **Bug fixes**: capture the real failure before fixing product or check source, then the current passing behavior. A `pair` image can supplement but never replace an existing UI's live before/after composite.
