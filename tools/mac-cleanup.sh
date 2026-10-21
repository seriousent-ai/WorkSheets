#!/usr/bin/env bash
# mac-cleanup.sh — weekly developer-machine cleanup for macOS.
#
# Usage:
#   ./tools/mac-cleanup.sh                  run everything
#   ./tools/mac-cleanup.sh --dry-run        show what would be removed + sizes, delete nothing
#   ./tools/mac-cleanup.sh --aggressive     also remove Xcode Archives, all simulators' data
#                                           and ignore the staleness window for build dirs
#   ./tools/mac-cleanup.sh --with-sudo      also thin Time Machine local snapshots (asks for password)
#   ./tools/mac-cleanup.sh --days N         build dirs (node_modules etc.) untouched for N days (default 30)
#   ./tools/mac-cleanup.sh --install-weekly schedule it with launchd, Sundays 10:00
#   ./tools/mac-cleanup.sh --uninstall-weekly
#
# Env: CLEAN_ROOTS="/path/a:/path/b"  directories scanned for stale build artifacts.
#
# Never touched: Documents, Desktop, Downloads, Docker volumes, Xcode Archives (unless
# --aggressive), source code, git repos, anything outside the paths listed below.

set -o pipefail

DRY=0; AGGR=0; SUDO=0; DAYS=30
LABEL="com.user.mac-cleanup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
LOG="$HOME/Library/Logs/mac-cleanup.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --aggressive) AGGR=1; DAYS=0 ;;
    --with-sudo) SUDO=1 ;;
    --days) shift; DAYS="${1:?--days needs a number}" ;;
    --install-weekly)
      mkdir -p "$HOME/Library/LaunchAgents"
      cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SELF</string></array>
  <key>StartCalendarInterval</key><dict><key>Weekday</key><integer>0</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
      launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"
      echo "Scheduled: every Sunday 10:00 (runs if the Mac is awake). Log: $LOG"; exit 0 ;;
    --uninstall-weekly)
      launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "Weekly schedule removed."; exit 0 ;;
    -h|--help) sed -n '2,19p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname)" != "Darwin" ] && [ -z "$MAC_CLEANUP_FORCE" ]; then
  echo "This script is for macOS." >&2; exit 1
fi

TOTAL_KB=0
have() { command -v "$1" >/dev/null 2>&1; }
say() { printf '\n==> %s\n' "$*"; }
free_kb() { df -k "${1:-$HOME}" | awk 'NR==2{print $4}'; }
human() { awk -v k="$1" 'BEGIN{split("KB MB GB TB",u," ");i=1;while(k>=1024&&i<4){k/=1024;i++}printf "%.1f %s",k,u[i]}'; }

# remove <path> — measures, then deletes (unless --dry-run)
remove() {
  local p="$1" kb
  [ -e "$p" ] || return 0
  kb=$(du -sk "$p" 2>/dev/null | awk '{print $1}'); kb=${kb:-0}
  [ "$kb" -gt 0 ] || return 0
  TOTAL_KB=$((TOTAL_KB + kb))
  printf '  %10s  %s\n' "$(human "$kb")" "$p"
  [ "$DRY" -eq 1 ] || rm -rf "$p" 2>/dev/null
}

# remove_contents <dir> [exclude-glob] — empties a directory but keeps it
remove_contents() {
  local d="$1" skip="$2" item
  [ -d "$d" ] || return 0
  for item in "$d"/* "$d"/.[!.]*; do
    [ -e "$item" ] || continue
    [ -n "$skip" ] && case "$(basename "$item")" in $skip) continue ;; esac
    remove "$item"
  done
}

# run <cmd...> — run a tool command unless --dry-run
run() {
  if [ "$DRY" -eq 1 ]; then echo "  (dry-run) $*"; else "$@" 2>&1 | sed 's/^/  /'; fi
}

echo "mac-cleanup $(date '+%Y-%m-%d %H:%M')  dry-run=$DRY aggressive=$AGGR stale-days=$DAYS"
BEFORE=$(free_kb)

# ---------------------------------------------------------------- Xcode
say "Xcode"
remove "$HOME/Library/Developer/Xcode/DerivedData"
remove "$HOME/Library/Developer/Xcode/iOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/watchOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/tvOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/UserData/Previews"
remove "$HOME/Library/Developer/XCPGDevices"
remove "$HOME/Library/Caches/com.apple.dt.Xcode"
remove "$HOME/Library/Developer/CoreSimulator/Caches"
if have xcrun; then
  run xcrun simctl delete unavailable
  [ "$AGGR" -eq 1 ] && { remove "$HOME/Library/Developer/Xcode/Archives"; run xcrun simctl erase all; }
fi

# ---------------------------------------------------------------- package managers
say "Package-manager caches"
if have brew; then
  run brew autoremove
  run brew cleanup --prune=all -s
fi
have npm  && run npm cache clean --force
have pnpm && run pnpm store prune
have yarn && run yarn cache clean
have bun  && run bun pm cache rm
remove "$HOME/.npm/_cacache"
remove "$HOME/.bun/install/cache"
remove "$HOME/Library/Caches/Yarn"
remove "$HOME/Library/pnpm/store"
remove "$HOME/Library/Caches/pip"
remove "$HOME/Library/Caches/pypoetry"
remove "$HOME/Library/Caches/uv"
have conda && run conda clean --all -y
have pod && run pod cache clean --all
remove "$HOME/Library/Caches/CocoaPods"
remove "$HOME/.gradle/caches"
remove "$HOME/.gradle/daemon"
remove "$HOME/.android/cache"
remove "$HOME/.cargo/registry/cache"
remove "$HOME/.cargo/registry/src"
remove "$HOME/.cargo/git/checkouts"
have go && run go clean -cache -testcache -modcache
remove "$HOME/.m2/repository"
remove "$HOME/.composer/cache"
remove "$HOME/.gem/cache" 2>/dev/null

# ---------------------------------------------------------------- Docker
say "Docker (images/containers/build cache — volumes are kept)"
if have docker && docker info >/dev/null 2>&1; then
  run docker system prune -af
  run docker builder prune -af
else
  echo "  Docker not running — skipped (start Docker Desktop to include it)"
fi

# ---------------------------------------------------------------- stale build artifacts
say "Stale build artifacts untouched for >${DAYS} days (node_modules, .next, target, Pods, venv caches)"
ROOTS="${CLEAN_ROOTS:-$HOME/Developer:$HOME/Projects:$HOME/Code:$HOME/dev:$HOME/src:$HOME/repos:$HOME/work:$HOME/Sites:$HOME/Documents/GitHub}"
OLDIFS=$IFS; IFS=':'; set -- $ROOTS; IFS=$OLDIFS
for root in "$@"; do
  [ -d "$root" ] || continue
  find "$root" -maxdepth 7 -type d \( -name node_modules -o -name .next -o -name .nuxt -o -name .turbo \
      -o -name .parcel-cache -o -name __pycache__ -o -name target -o -name Pods -o -name build \
      -o -name .gradle \) -prune -mtime +"$DAYS" -print0 2>/dev/null |
  while IFS= read -r -d '' dir; do
    parent=$(dirname "$dir")
    case "$(basename "$dir")" in
      target) [ -f "$parent/Cargo.toml" ] || continue ;;
      Pods)   [ -f "$parent/Podfile" ] || continue ;;
      build)  [ -f "$parent/build.gradle" ] || [ -f "$parent/build.gradle.kts" ] || [ -f "$parent/CMakeLists.txt" ] || continue ;;
      node_modules) [ -f "$parent/package.json" ] || continue ;;
    esac
    # subshell from the pipe: print here, accumulate via the temp file
    kb=$(du -sk "$dir" 2>/dev/null | awk '{print $1}'); kb=${kb:-0}
    [ "$kb" -gt 0 ] || continue
    printf '  %10s  %s\n' "$(human "$kb")" "$dir"
    echo "$kb" >> "${TMPDIR:-/tmp}/mac-cleanup.$$"
    [ "$DRY" -eq 1 ] || rm -rf "$dir" 2>/dev/null
  done
done
if [ -f "${TMPDIR:-/tmp}/mac-cleanup.$$" ]; then
  TOTAL_KB=$((TOTAL_KB + $(awk '{s+=$1} END{print s+0}' "${TMPDIR:-/tmp}/mac-cleanup.$$")))
  rm -f "${TMPDIR:-/tmp}/mac-cleanup.$$"
fi

# ---------------------------------------------------------------- editor + app caches
say "Editor and app caches"
for app in Code "Code - Insiders" Cursor Windsurf; do
  base="$HOME/Library/Application Support/$app"
  for sub in Cache CachedData CachedExtensionVSIXs Code\ Cache GPUCache logs; do
    remove "$base/$sub"
  done
done
remove_contents "$HOME/Library/Caches" "com.apple.*"
remove_contents "$HOME/Library/Logs"
remove "$HOME/Library/Application Support/CrashReporter"
remove_contents "$HOME/Library/Logs/DiagnosticReports"

# ---------------------------------------------------------------- Trash
say "Trash"
remove_contents "$HOME/.Trash"

# ---------------------------------------------------------------- Time Machine
if [ "$SUDO" -eq 1 ] && have tmutil; then
  say "Time Machine local snapshots"
  run sudo tmutil thinlocalsnapshots / 999999999999 4
fi

# ---------------------------------------------------------------- summary
AFTER=$(free_kb)
say "Done"
if [ "$DRY" -eq 1 ]; then
  echo "  Would remove about $(human "$TOTAL_KB") directly (tool-managed caches such as brew/docker/go are extra)."
else
  echo "  Free space: $(human "$BEFORE") -> $(human "$AFTER")  (reclaimed $(human $((AFTER - BEFORE))))"
fi

say "Biggest folders left in your home (review these yourself — not touched)"
du -sk "$HOME"/* "$HOME"/Library/* 2>/dev/null | sort -rn | head -12 |
  awk '{k=$1; $1=""; printf "  %8.1f GB %s\n", k/1048576, $0}'
[ -d "$HOME/Library/Application Support/MobileSync/Backup" ] &&
  echo "  Note: old iPhone/iPad backups live in ~/Library/Application Support/MobileSync/Backup"
echo "  Note: old simulator runtimes can be removed in Xcode > Settings > Components."
