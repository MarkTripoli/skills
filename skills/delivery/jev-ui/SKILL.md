---
name: jev-ui
description: Control an explicitly selected browser or Android UI through bounded JEV decisions and verify postconditions.
---

Read the [writing guide](https://github.com/MarkTripoli/skills/blob/main/shared/WRITING.md) and the [collection conventions](https://github.com/MarkTripoli/skills/blob/main/shared/CONVENTIONS.md) before drafting, revising, or replying; a checkout of the collection has both under `shared/`.

# JEV UI

`jev-ui` runs a bounded observe, choose, validate, act, observe loop against an isolated browser session or an explicitly selected Android device/emulator. Invoke `node scripts/jev-ui.mjs --help`; provide a goal, expected postconditions, and a browser URL or native `--target` ID. Browser control requires Node 22+, `agent-browser`, and TypeSafe credentials (`TYPESAFE_API_KEY`, `TYPESAFE_API_KEY_FILE`, or `~/.config/typesafe/api_key`). Android control requires `adb`. A separately configured text helper may supply validated field text.

The controller accepts only indexed known operation and target values returned by the current observation. It does not accept selectors, coordinates, commands, code, or screenshot input. Screenshots and recordings remain evidence artifacts and never enter JEV state. Each run has finite action and model budgets and ends exactly `passed`, `failed`, or `blocked`; `DONE` passes only when an independently observed non-editable control satisfies every expected postcondition.

Native targets are never selected implicitly: pass `--target` and review the returned serial. The generic controller does not start recording; pair live runs with `record-evidence` when capture is required. Do not present a desktop browser as an Android device. See [browser setup](references/browser-setup.md) and [result schema](references/result-schema.md).

## Generic Android consumer

Launch the caller-selected app yourself, then pass both its device identity and app identity to the production controller. These commands observe and control the actual Android surface; they do not use the acceptance harness. For text entry, set `JEV_UI_TEXT_HELPER` to a JSON command array that prints `{"text":"..."}`.

```sh
adb -s "$ANDROID_SERIAL" shell monkey -p "$ANDROID_APP" 1
node scripts/jev-ui.mjs --platform android --target "$ANDROID_SERIAL" --app "$ANDROID_APP" --goal 'Complete the selected app task' --expected 'Expected status'
```

`ANDROID_SERIAL` and `ANDROID_APP` are caller inputs, not fixture defaults. The selected Android serial must be visible to `adb`.
