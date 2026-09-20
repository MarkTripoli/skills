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
case "$version" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) echo "invalid semantic version: $version" >&2; exit 1;;
esac
case "$version" in *[!0-9.]*) echo "invalid semantic version: $version" >&2; exit 1;; esac
oldIFS=$IFS; IFS=.; set -- $version; IFS=$oldIFS
[ "$#" -eq 3 ] && [ -n "$1" ] && [ -n "$2" ] && [ -n "$3" ] || { echo "invalid semantic version: $version" >&2; exit 1; }
mkdir -p "$out"
name="safety-dance_${version}_${os}_${arch}"
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
toolroot=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cp "$toolroot/LICENSE" "$stage/LICENSE"
if ! (cd "$toolroot" && go run ./scripts/generate-notices.go) > "$stage/THIRD_PARTY_NOTICES.md"; then
	echo "unable to generate dependency notices from the module graph" >&2
	exit 1
fi
if [ "$os" = windows ]; then cp "$binary" "$stage/safety-dance.exe"; (cd "$stage" && zip -q "$out/$name.zip" safety-dance.exe LICENSE THIRD_PARTY_NOTICES.md)
else cp "$binary" "$stage/safety-dance"; tar -C "$stage" -czf "$out/$name.tar.gz" safety-dance LICENSE THIRD_PARTY_NOTICES.md; fi
(cd "$out" && sha256sum safety-dance_${version}_${os}_${arch}.*) > "$out/checksums.txt"
