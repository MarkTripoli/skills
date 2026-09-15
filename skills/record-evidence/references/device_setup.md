# Device and browser setup

Exact commands for each surface. `EVIDENCE` is the path to `scripts/evidence.py`. Every `boot` and `start` call prints JSON; keep the identifiers it returns.

## Android emulator

Requirements: Android SDK with `adb` and `emulator` on `PATH` or under `ANDROID_HOME`; an AVD (`python3 $EVIDENCE devices` lists them). `scrcpy` on `PATH` is optional and gives gap-free recordings of any length; without it the recorder uses `adb shell screenrecord` in 180 s segments (a short gap at each boundary is noted in the report).

```bash
python3 $EVIDENCE boot android <avd-name> --headless        # prints {"serial": "emulator-5554", ...}
adb -s emulator-5554 install -r path/to/app.apk
adb -s emulator-5554 shell am start -n com.example.app/.MainActivity
```

`--headless` passes `-no-window -no-audio -gpu swiftshader_indirect`; drop it when a visible window is wanted. Extra emulator arguments go after `--` (`boot android Pixel_8 --headless -- -wipe-data`). A running emulator is used as is: `devices` shows its serial. When a restored snapshot leaves adb `unauthorized` for 20 s, `boot` kills it and cold boots once (`-no-snapshot-load`); the result carries `"cold_boot": true`. Right after boot give the system a few seconds, read `am start`'s output (`Starting: Intent` on success, `Error` otherwise), and take a screenshot before the first assertion.

Drive and look:

```bash
adb -s $SERIAL shell input tap 540 1200
adb -s $SERIAL shell input swipe 540 1600 540 600 400
adb -s $SERIAL shell input text 'hello%sworld'            # %s is a space
adb -s $SERIAL shell input keyevent KEYCODE_BACK
adb -s $SERIAL exec-out screencap -p > look.png            # inspect before asserting
adb -s $SERIAL shell uiautomator dump /sdcard/ui.xml && adb -s $SERIAL pull /sdcard/ui.xml   # element bounds
```

Maestro (`maestro test flow.yaml`, `maestro studio`) drives Android and iOS with the same YAML; it is a valid actuator as long as you run it while the recorder captures the session.

Record:

```bash
python3 $EVIDENCE start --output <dir>/android --source android --target $SERIAL --label "Android" --title "..." ...
```

Notes: `screenrecord` only emits frames when the display changes; the recorder holds the last frame to the real stop time and reports it. `--geometry 720x1600` asks the device for a smaller recording when the default is too heavy.

## iOS simulator

Requirements: macOS with Xcode command line tools (`xcrun simctl`). Recording works with the simulator booted headless; Simulator.app is not needed.

```bash
python3 $EVIDENCE devices                                   # names, UDIDs, runtime, state
python3 $EVIDENCE boot ios "iPhone 16" --headless           # prints {"udid": "...", ...}
xcrun simctl install $UDID path/to/App.app                  # a simulator build (x86_64 or arm64 for the host)
xcrun simctl launch $UDID com.example.app
xcrun simctl openurl $UDID "myapp://route"                  # deep links
```

Drop `--headless` to open Simulator.app on that device. Booting can take a minute on first launch of a runtime; `boot` waits for `bootstatus`.

Drive and look: `simctl` has no tap or type command. Use one of:

- Maestro: `maestro --device $UDID test flow.yaml` (taps, text, swipes, assertions by accessibility label).
- idb (`brew install idb-companion`, `pip install fb-idb`): `idb ui tap 200 400 --udid $UDID`, `idb ui text "hello"`, `idb ui describe-all` for the accessibility tree.
- The app's own XCUITest target: `xcodebuild test -destination "id=$UDID"`.
- `xcrun simctl io $UDID screenshot look.png` to inspect before asserting.

Record:

```bash
python3 $EVIDENCE start --output <dir>/ios --source ios --target "$UDID" --label "iPhone 16" --title "..." ...
```

Notes: `simctl recordVideo` writes the file only when it stops, and like `screenrecord` it emits frames only while the display changes; the recorder takes video zero from its "Recording started" line and holds the last frame to the real stop time. Status bar values can be pinned for clean footage: `xcrun simctl status_bar $UDID override --time 9:41 --batteryLevel 100`.

## Desktop screen

- macOS: grant Screen Recording to the terminal or agent host app (System Settings, Privacy & Security). `doctor` lists screen indexes; `--screen-index N` picks one. Retina captures are large; `stop --max-height 1440` downsizes the render.
- Linux X11 / XWayland: `DISPLAY` set (and `XAUTHORITY` when recording over SSH into a desktop session, usually `~/.Xauthority`); `xdpyinfo` or `xrandr` supplies the screen size, or pass `--geometry WxH`. Verified on Ubuntu 22.04 with Xorg and a static ffmpeg build in `~/bin` (no root needed).
- Linux Wayland: `wf-recorder` on `PATH` and a wlr-screencopy compositor (Sway, Hyprland, river, Wayfire, labwc, dwl, niri). GNOME and KDE Wayland are not capturable this way. `doctor` names the missing piece. Known limits: wf-recorder does not build against ffmpeg 9 (checked September 2026), and a compositor with no connected monitor (`hyprctl -j monitors` prints `[]`) has nothing to capture; in both cases capture X11 windows through XWayland or record the browser with Playwright.
- Windows: any ffmpeg build (`gdigrab`). Not exercised; written from ffmpeg's documentation.

`--geometry WxH --offset X,Y` crops to a region on every grabber; prefer maximizing the window and recording the whole screen.

## Browser without a display (Playwright, imported as `external`)

Playwright is installed beside the script, inside the evidence directory (never committed), so the project's dependencies stay untouched. `npx --package=playwright node record.mjs` does not work: Node resolves `import "playwright"` from the script's own `node_modules`, not from the npx cache.

Start the session first so its clock is running, then create the Playwright context immediately; the video's zero is taken as the moment `start` returned (adjust with `stop --video-offset S` when the frame check shows drift, or `--align end` when the video ended exactly at `stop`).

```bash
mkdir -p <dir>/web && cd <dir>/web
npm init -y >/dev/null && npm install --no-audit --no-fund playwright && npx playwright install chromium
SESSION=$(python3 $EVIDENCE start --output <dir>/web/session --source external --label "Chromium" --title "..." | python3 -c 'import json,sys;print(json.load(sys.stdin)["session"])')
EVIDENCE=$EVIDENCE node record.mjs "$SESSION"
python3 $EVIDENCE stop "$SESSION" --video video/*.webm --caveats "..."
```

Minimal `record.mjs` that annotates through the recorder as it goes (verified against a local page):

```js
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";

const [session] = process.argv.slice(2);
const EVIDENCE = process.env.EVIDENCE; // path to evidence.py
const note = (...args) => execFileSync("python3", [EVIDENCE, ...args, session], { stdio: "ignore" });

const browser = await chromium.launch(); // add { args: ["--no-sandbox"] } in containers that report "No usable sandbox"
const context = await browser.newContext({ recordVideo: { dir: new URL("./video/", import.meta.url).pathname, size: { width: 1280, height: 720 } }, viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

note("narrate", "--message", "We open the settings page and switch the theme to dark. It should apply without a reload.");
await page.goto("http://localhost:3000/settings");
note("annotate", "--type", "setup", "--message", "Signed in, on the settings page");
note("annotate", "--type", "test_start", "--message", "It should apply dark mode when toggled");
await page.getByRole("switch", { name: "Dark mode" }).click();
await page.waitForTimeout(800); // let the change settle on video
const dark = await page.evaluate(() => document.documentElement.classList.contains("dark"));
note("annotate", "--type", "assertion", "--result", dark ? "passed" : "failed", "--message", "Theme switched to dark without a reload");

await context.close(); // finalizes the .webm
await browser.close();
```

Note the argument order: the recorder wants `annotate SESSION --type ...`, and `note()` appends the session last, which argparse accepts. Confirm the server you hit is your build (`lsof -i :3000`, then `ps -p <pid> -o args=`) before recording.

## Multiple devices at once

Start one session per device with the same `--title` and distinct `--label`; annotate all of them in one call when the statement applies to every device (`narrate "$A" "$B" --message ...`), or one when it does not. After `stop` on each, `compose --output <dir>/composite "$A" "$B" --label ... --label ...` builds the side-by-side with a shared narration track. Panes align by wall clock; `--no-align` starts them together. `--direction v` stacks vertically; `--size` sets the pane height (or width for `v`).
