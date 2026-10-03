---
name: jev-ui
description: Drives an explicitly selected browser, Android device or emulator, or iOS simulator through a bounded observe, choose, validate, act loop and verifies the expected postconditions in a JSON receipt. Use when a task needs a model-driven UI run with a goal and expected outcome; not for hand-written test steps (use /test-app) or video capture (use /record-evidence).
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# JEV UI

`jev-ui` runs a bounded observe, choose, validate, act, observe loop against an isolated browser session or an explicitly selected Android device/emulator or iOS simulator. Run `node scripts/jev-ui.mjs --help`; provide a goal, expected postconditions, and a browser URL or native `--target` ID. Do not read the scripts; run them and read the JSON receipt ([result schema](references/result-schema.md)). A separately configured text helper may supply validated field text.

Defaults: 10 actions, 10 model calls (`--max-actions`, `--max-models`); native and helper commands time out at 15 s (`JEV_UI_NATIVE_TIMEOUT_MS`, `JEV_UI_TEXT_TIMEOUT_MS`).

Requirements:

- Browser: Node 22+, `agent-browser`, and TypeSafe credentials (`TYPESAFE_API_KEY`, `TYPESAFE_API_KEY_FILE`, or `~/.config/typesafe/api_key`). See [browser setup](references/browser-setup.md).
- Android: `adb`.
- iOS: `xcrun`, `idb`, and an `IDB_COMPANION` socket for an authorized simulator.

The controller accepts only indexed known operation and target values returned by the current observation. It does not accept selectors, coordinates, commands, code, or screenshot input. Screenshots and recordings remain evidence artifacts and never enter JEV state. Each run has finite action and model budgets and ends exactly `passed`, `failed`, or `blocked`; `DONE` passes only when an independently observed non-editable control satisfies every expected postcondition.

Targets are never chosen implicitly: pass `--target` (and `--app` for native) and review the returned serial, app, and PID identity. The generic controller does not start recording; pair live runs with `record-evidence` when capture is required. Do not present a desktop browser as a native device. For text entry, set `JEV_UI_TEXT_HELPER` to a JSON command array that prints `{"text":"..."}`.

## Native consumers

`--target` and `--app` are caller inputs, never fixture defaults. Launch the caller-selected app yourself, then run the controller; the companion socket is caller-owned and the controller never starts one.

| Platform | Launch | Run |
| --- | --- | --- |
| Android | `adb -s "$ANDROID_SERIAL" shell monkey -p "$ANDROID_APP" 1` | `node scripts/jev-ui.mjs --platform android --target "$ANDROID_SERIAL" --app "$ANDROID_APP" --goal 'Complete the selected app task' --expected 'Expected status'` |
| iOS simulator | `xcrun simctl launch "$IOS_UDID" "$IOS_BUNDLE_ID"` | `IDB_COMPANION=/path/to/idb-companion.sock node scripts/jev-ui.mjs --platform ios --target "$IOS_UDID" --app "$IOS_BUNDLE_ID" --goal 'Complete the selected app task' --expected 'Expected status'` |

The Android serial must be visible to `adb`.
