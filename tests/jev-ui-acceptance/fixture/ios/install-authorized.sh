#!/bin/sh
set -eu
udid=${1:-7A023F51-F0DA-4179-868B-19207E433651}
initial_name=${2-}
[ "$udid" = 7A023F51-F0DA-4179-868B-19207E433651 ] || { echo 'refusing unauthorized iOS simulator' >&2; exit 2; }
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Keep transient Xcode output outside the checked-in fixture and always remove it.
build_root=$(mktemp -d "${TMPDIR:-/tmp}/jev-ui-ios-build.XXXXXX")
cleanup() { rm -rf "$build_root"; }
trap cleanup EXIT HUP INT TERM
xcodebuild -project "$root/JEVFixture.xcodeproj" -scheme JEVFixture -sdk iphonesimulator -configuration Debug -derivedDataPath "$build_root" CODE_SIGNING_ALLOWED=NO build >/dev/null
app="$build_root/Build/Products/Debug-iphonesimulator/JEVFixture.app"
xcrun simctl install "$udid" "$app"
xcrun simctl terminate "$udid" ai.typesafe.jevfixture 2>/dev/null || true
if [ -n "$initial_name" ]; then xcrun simctl launch "$udid" ai.typesafe.jevfixture --args --JEV_UI_INITIAL_NAME "$initial_name" >/dev/null; else xcrun simctl launch "$udid" ai.typesafe.jevfixture >/dev/null; fi
printf '%s\n' '{"platform":"ios","udid":"7A023F51-F0DA-4179-868B-19207E433651","bundle":"ai.typesafe.jevfixture","installed":true,"launched":true,"simulator":true}'
