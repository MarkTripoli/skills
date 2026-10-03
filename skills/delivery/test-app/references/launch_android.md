# Android emulator

## Launch

`adb devices` must list one running emulator or device; when none is listed, start the first AVD (`emulator -list-avds`, `emulator -avd <name> -no-audio &`, `adb wait-for-device`). An `.apk` in `target` is installed with `adb install -r <path>` and launched with `adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1`; a package name in `target` is launched directly. Without `target`, run `./gradlew installDebug` and launch the `applicationId` from the app module's `build.gradle`.

## Drive

Write one Maestro flow per step to a temporary directory outside the repository (`mktemp -d`), `appId` the package, commands `tapOn`, `inputText`, `assertVisible`, `scroll`; run `maestro test <flow.yaml>` (`maestro --device <serial> test` when several are connected). Read the screen with `maestro hierarchy` and keep the excerpt around the elements the step names. Screenshot: `adb exec-out screencap -p > <task dir>/app-test/SN.png`. `maestro` missing: drive with `adb shell input` and `adb shell uiautomator dump`; no driver: `blocked`.
