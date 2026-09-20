#!/bin/sh
set -eu
serial=${1:-emulator-5560}
initial_name=${2-}
[ "$serial" = emulator-5560 ] || { echo 'refusing unauthorized Android target' >&2; exit 2; }
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${ANDROID_HOME:=$HOME/Library/Android/sdk}"
export ANDROID_HOME

# Keep transient Gradle outputs outside the checked-in fixture and always remove them.
build_root=$(mktemp -d "${TMPDIR:-/tmp}/jev-ui-android-build.XXXXXX")
cleanup() { rm -rf "$build_root"; }
trap cleanup EXIT HUP INT TERM
gradle -p "$root" --project-cache-dir "$build_root/.gradle" -PjevFixtureBuildDir="$build_root" :app:assembleDebug
adb -s "$serial" install -r "$build_root/app/build/outputs/apk/debug/app-debug.apk"
adb -s "$serial" shell am force-stop ai.typesafe.jevfixture
if [ -n "$initial_name" ]; then adb -s "$serial" shell am start -n ai.typesafe.jevfixture/.MainActivity --es JEV_UI_INITIAL_NAME "$initial_name" >/dev/null; else adb -s "$serial" shell monkey -p ai.typesafe.jevfixture 1 >/dev/null; fi
printf '%s\n' '{"platform":"android","serial":"emulator-5560","package":"ai.typesafe.jevfixture","installed":true,"launched":true}'
