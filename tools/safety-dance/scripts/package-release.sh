#!/bin/sh
set -eu
usage() { echo "usage: $0 --version VERSION --os OS --arch ARCH --binary PATH --out DIR" >&2; exit 2; }
version= os= arch= binary= out=
while [ "$#" -gt 0 ]; do
  case "$1" in
    --version) version=${2-}; shift 2;; --os) os=${2-}; shift 2;; --arch) arch=${2-}; shift 2;;
    --binary) binary=${2-}; shift 2;; --out) out=${2-}; shift 2;; *) usage;;
  esac
done
[ -n "$version" ] && [ -n "$os" ] && [ -n "$arch" ] && [ -f "$binary" ] && [ -n "$out" ] || usage
semver_re='^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)(\.(0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*))*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$'
if ! printf '%s\n' "$version" | grep -Eq "$semver_re"; then
	echo "invalid semantic version: $version" >&2
	exit 1
fi
mkdir -p "$out"
out=$(CDPATH= cd -- "$out" && pwd)
binary_dir=$(CDPATH= cd -- "$(dirname "$binary")" && pwd)
binary="$binary_dir/$(basename "$binary")"
name="safety-dance_${version}_${os}_${arch}"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
toolroot=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cp "$toolroot/LICENSE" "$stage/LICENSE"
if ! (cd "$toolroot" && env -u GOOS -u GOARCH go run ./scripts/generate-notices.go) > "$stage/THIRD_PARTY_NOTICES.md"; then
	echo "unable to generate dependency notices from the module graph" >&2
	exit 1
fi
if [ "$os" = windows ]; then cp "$binary" "$stage/safety-dance.exe"; (cd "$stage" && zip -q "$out/$name.zip" safety-dance.exe LICENSE THIRD_PARTY_NOTICES.md)
else cp "$binary" "$stage/safety-dance"; tar -C "$stage" -czf "$out/$name.tar.gz" safety-dance LICENSE THIRD_PARTY_NOTICES.md; fi
(cd "$out" && sha256sum safety-dance_${version}_${os}_${arch}.*) > "$out/checksums.txt"
