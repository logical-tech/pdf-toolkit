#!/usr/bin/env bash
# Builds a self-contained Ghostscript (used only for PDF/A export) as a Tauri sidecar:
# src-tauri/binaries/gs-<target-triple>. Third-party libraries come from the Ghostscript source tree and the
# init files are compiled into the binary, so it runs on machines without Homebrew or any Ghostscript install.
# Usage: scripts/build-ghostscript.sh <target-triple> [work-dir]
set -euo pipefail

VERSION=10.08.0
TAG=gs10080
SHA256=c20492bc8ebb96c87fa2e52a0926e1cda8cde95d66145e018ac713fed5da38cf

TARGET=${1:?target triple, e.g. aarch64-apple-darwin}
WORK=${2:-${RUNNER_TEMP:-/tmp}/ghostscript-build}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/src-tauri/binaries/gs-$TARGET"

if [[ -x "$OUT" ]]; then echo "already built: $OUT"; exit 0; fi

mkdir -p "$WORK"
cd "$WORK"
TARBALL=ghostscript-$VERSION.tar.xz
[[ -f $TARBALL ]] || curl -fsSL -o "$TARBALL" "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$TAG/$TARBALL"
echo "$SHA256  $TARBALL" | shasum -a 256 -c -
rm -rf "ghostscript-$VERSION"
tar xf "$TARBALL"
cd "ghostscript-$VERSION"

# Ghostscript's bundled libpng does not compile its ARM NEON filters in this build, so leave them out.
export CFLAGS="${CFLAGS:-} -O2 -DPNG_ARM_NEON_OPT=0"
CONFIGURE=(--without-x --disable-cups --disable-dbus --disable-gtk --disable-fontconfig --without-libidn --without-libpaper --without-tesseract --without-pdftoraster --with-drivers=FILES)
case "$TARGET" in
  x86_64-apple-darwin | aarch64-apple-darwin)
    ARCH=${TARGET%%-*}; [[ $ARCH == aarch64 ]] && ARCH=arm64
    export CC="clang -arch $ARCH" MACOSX_DEPLOYMENT_TARGET=11.0
    # Build-time helper tools must run on the build machine, whatever the target arch.
    export CCAUX=clang
    CONFIGURE+=(--host="${TARGET/aarch64/arm}" --build="$(uname -m | sed s/arm64/arm/)-apple-darwin")
    ;;
esac

./configure "${CONFIGURE[@]}" >/dev/null
make -j"$(getconf _NPROCESSORS_ONLN)" gs >/dev/null 2>build.log || { tail -40 build.log; exit 1; }
mkdir -p "$(dirname "$OUT")"
cp bin/gs "$OUT"
strip "$OUT" 2>/dev/null || true
echo "built $OUT ($(du -h "$OUT" | cut -f1))"
