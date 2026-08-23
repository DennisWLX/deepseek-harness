#!/usr/bin/env bash
#
# Build the packaged Node sidecar and the macOS Tauri application. The script
# detects the host architecture, puts the active Rust toolchain on PATH, and
# validates the Node/pnpm prerequisites before starting either build.

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"

build_dmg=0
skip_sidecar=0
arch="${DSH_DESKTOP_ARCH:-}"

usage() {
  cat <<'EOF'
Usage: ./apps/desktop/build-desktop.sh [options]

Options:
  --arch=x64|arm64  Build for an explicit macOS architecture. Default: host.
  --dmg             Also create a DMG. Default: build only the .app.
  --skip-sidecar    Skip the Node sidecar build. Use for Rust-only changes.
  -h, --help        Show this help text.

The sidecar builder runs the repository build before packaging unless
--skip-sidecar is supplied.
EOF
}

die() {
  printf 'build-desktop: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --arch=*) arch="${1#--arch=}" ;;
    --arch)
      shift
      [ "$#" -gt 0 ] || die '--arch requires x64 or arm64'
      arch="$1"
      ;;
    --dmg) build_dmg=1 ;;
    --skip-sidecar) skip_sidecar=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1 (run with --help)" ;;
  esac
  shift
done

[ "$(uname -s)" = 'Darwin' ] || die 'this packaging script supports macOS only'

case "${arch:-$(uname -m)}" in
  x86_64) arch='x64' ;;
  x64) arch='x64' ;;
  arm64|aarch64) arch='arm64' ;;
  *) die "unsupported architecture: ${arch:-$(uname -m)}" ;;
esac

missing=()
command -v node >/dev/null || missing+=('node (>=22.19, or >=24)')
if ! command -v pnpm >/dev/null; then
  corepack enable >/dev/null 2>&1 || true
fi
command -v pnpm >/dev/null || missing+=('pnpm')
command -v rustup >/dev/null || missing+=('rustup')
if [ "${#missing[@]}" -gt 0 ]; then
  die "missing required tool: ${missing[*]}"
fi

if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit((major === 22 && minor >= 19) || major >= 24 ? 0 : 1)'; then
  die 'node must be 22.19 or newer, or 24 or newer'
fi

cargo_path="$(rustup which cargo)"
toolchain_dir="$(dirname "$cargo_path")"
export PATH="$toolchain_dir:$PATH"
command -v cargo >/dev/null || die 'cargo is missing from the active Rust toolchain'
command -v rustc >/dev/null || die 'rustc is missing from the active Rust toolchain'

bundle_args=('--bundles' 'app')
if [ "$build_dmg" -eq 1 ]; then
  bundle_args=('--bundles' 'app,dmg')
fi

cd "$repo_root"
echo "build-desktop: architecture=$arch bundles=${bundle_args[1]}"

if [ "$skip_sidecar" -eq 0 ]; then
  echo 'build-desktop: building Node sidecar'
  pnpm exec tsx scripts/build-desktop-sidecar.ts "--targets=node24-macos-$arch"
else
  echo 'build-desktop: skipping Node sidecar'
fi

echo 'build-desktop: building Tauri application'
pnpm --filter @deepseek-ai/dsh-desktop-runtime exec tauri build "${bundle_args[@]}"

app_bundle="$repo_root/apps/desktop/src-tauri/target/release/bundle/macos/DeepSeek Harness.app"
[ -d "$app_bundle" ] || die "expected bundle missing: $app_bundle"
echo "build-desktop: app bundle: $app_bundle"
if [ "$build_dmg" -eq 1 ]; then
  dmg_dir="$repo_root/apps/desktop/src-tauri/target/release/bundle/dmg"
  [ -d "$dmg_dir" ] || die "expected DMG directory missing: $dmg_dir"
  echo "build-desktop: dmg bundle: $dmg_dir"
fi
