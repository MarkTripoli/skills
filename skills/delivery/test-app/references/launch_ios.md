# iOS simulator

## Launch

`xcrun simctl list devices booted -j`; when nothing is booted, boot the first available iPhone (`xcrun simctl list devices available -j`, then `xcrun simctl boot <udid>` and `xcrun simctl bootstatus <udid> -b`). A `.app` path in `target` is installed with `xcrun simctl install booted <path>` and launched with `xcrun simctl launch booted <bundle id>` (the bundle id is `CFBundleIdentifier` in the app's `Info.plist`); a bundle id in `target` is launched directly. Without `target`, build the scheme the repository names for a simulator destination (`xcodebuild -scheme <scheme> -destination 'generic/platform=iOS Simulator' -derivedDataPath <temp dir> build`) and install the resulting `.app`.

## Drive

Write one Maestro flow per step to a temporary directory outside the repository (`mktemp -d`), `appId` the bundle id, commands `tapOn`, `inputText`, `assertVisible`, `scroll`; run `maestro test <flow.yaml>` (`maestro --device <udid> test` when several are connected). Read the screen with `maestro hierarchy` and keep the excerpt around the elements the step names. Screenshot: `xcrun simctl io booted screenshot <task dir>/app-test/SN.png`. `maestro` missing: drive with `idb ui tap` and `idb ui describe-all`; no driver: `blocked`.
