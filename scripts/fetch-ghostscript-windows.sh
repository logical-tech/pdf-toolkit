#!/usr/bin/env bash
# Windows sidecar for PDF/A export: Artifex's official 64-bit build, unpacked from its installer (building
# Ghostscript with MSVC in CI is far more fragile). Produces src-tauri/binaries/gs-x86_64-pc-windows-msvc.exe and
# gsdll64.dll, which tauri.windows.conf.json installs next to it. Runs in Git Bash on the Windows runner, or on macOS
# for a local cross-build (brew install sevenzip).
set -euo pipefail

TAG=gs10080
SHA256=52a91b8bf09298788d7a57b9206127026c23eacd75405f0a131e26dc381dce50
ROOT=$(cd "$(dirname "$0")/.." && pwd)
OUT="$ROOT/src-tauri/binaries"

if [[ -f "$OUT/gs-x86_64-pc-windows-msvc.exe" && -f "$OUT/gsdll64.dll" ]]; then echo "already present"; exit 0; fi

WORK=${RUNNER_TEMP:-/tmp}/ghostscript-win
mkdir -p "$WORK" "$OUT"
cd "$WORK"
[[ -f installer.exe ]] || curl -fsSL -o installer.exe "https://github.com/ArtifexSoftware/ghostpdl-downloads/releases/download/$TAG/${TAG}w64.exe"
echo "$SHA256  installer.exe" | { command -v sha256sum >/dev/null && sha256sum -c - || shasum -a 256 -c -; }
$(command -v 7z || command -v 7zz) x -y -ounpacked installer.exe >/dev/null
cp unpacked/bin/gswin64c.exe "$OUT/gs-x86_64-pc-windows-msvc.exe"
cp unpacked/bin/gsdll64.dll "$OUT/gsdll64.dll"
echo "ghostscript ready in $OUT"
