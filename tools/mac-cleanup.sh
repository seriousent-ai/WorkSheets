#!/usr/bin/env bash
# mac-cleanup.sh — scheduled developer-machine cleanup for macOS.
#
# Usage:
#   ./tools/mac-cleanup.sh                  run everything
#   ./tools/mac-cleanup.sh --dry-run        show what would be removed + sizes, delete nothing
#   ./tools/mac-cleanup.sh --find-apps      list project folders on this Mac (to fill in APP_DIRS)
#   ./tools/mac-cleanup.sh --aggressive     also remove Xcode Archives, all simulator data, and
#                                           ignore the staleness window for build dirs
#   ./tools/mac-cleanup.sh --with-sudo      also thin Time Machine local snapshots (asks for password)
#   ./tools/mac-cleanup.sh --days N         build dirs (node_modules etc.) untouched for N days (default 30)
#   ./tools/mac-cleanup.sh --report         also size ~/Library folders in the closing report (slow)
#   ./tools/mac-cleanup.sh --install-schedule [--on 1,3,5]
#                                           schedule with launchd at 10:00 on those weekdays
#                                           (0=Sun … 6=Sat, default 0). --install-weekly is the same.
#   ./tools/mac-cleanup.sh --uninstall-schedule
#
# Config: ~/.mac-cleanup.conf (optional, shell syntax), e.g.
#   APP_DIRS="$HOME/Developer/app1:$HOME/Developer/app2:$HOME/Developer/app3:$HOME/Developer/app4"
#   CLEAN_ROOTS="$HOME/Developer"        # extra places scanned for stale build artifacts
#   RUNTIME_DAYS=30                      # simulator runtimes unused this long are deleted
#
# Never touched: Documents, Desktop, Downloads, the Trash, Docker volumes, Xcode Archives (unless
# --aggressive), source code, uncommitted work, anything outside the paths listed below.

set -o pipefail

DRY=0; AGGR=0; SUDO=0; DAYS=30; REPORT=0; INSTALL=0; SCHED_DAYS=0; FIND=0
APP_DIRS="${APP_DIRS:-}"; CLEAN_ROOTS="${CLEAN_ROOTS:-}"; RUNTIME_DAYS="${RUNTIME_DAYS:-30}"
CONF="$HOME/.mac-cleanup.conf"
[ -f "$CONF" ] && . "$CONF"
LABEL="com.user.mac-cleanup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
LOG="$HOME/Library/Logs/mac-cleanup.log"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --aggressive) AGGR=1; DAYS=0 ;;
    --with-sudo) SUDO=1 ;;
    --report) REPORT=1 ;;
    --find-apps) FIND=1 ;;
    --days) shift; DAYS="${1:?--days needs a number}" ;;
    --on) shift; SCHED_DAYS="${1:?--on needs weekday numbers, e.g. 1,3,5}" ;;
    --install-weekly|--install-schedule) INSTALL=1 ;;
    --uninstall-weekly|--uninstall-schedule)
      launchctl unload "$PLIST" 2>/dev/null; rm -f "$PLIST"; echo "Schedule removed."; exit 0 ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$FIND" -eq 1 ]; then
  echo "Project folders under $HOME (add the ones that are your apps to APP_DIRS in $CONF):"
  find "$HOME" -maxdepth 4 \( -path "$HOME/Library" -o -path "$HOME/.*" -o -name node_modules -o -name .git -o -name Pods \) -prune -o \
    \( -name package.json -o -name '*.xcodeproj' -o -name Package.swift -o -name pubspec.yaml -o -name firebase.json \) -print 2>/dev/null |
    while IFS= read -r f; do dirname "$f"; done | sort -u |
    while IFS= read -r d; do printf '  %8s  %s\n' "$(du -sh "$d" 2>/dev/null | awk '{print $1}')" "$d"; done
  exit 0
fi

if [ "$INSTALL" -eq 1 ]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  INTERVALS=""
  OLDIFS=$IFS; IFS=','
  for d in $SCHED_DAYS; do
    INTERVALS="$INTERVALS<dict><key>Weekday</key><integer>$d</integer><key>Hour</key><integer>10</integer><key>Minute</key><integer>0</integer></dict>"
  done
  IFS=$OLDIFS
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/bash</string><string>$SELF</string></array>
  <key>StartCalendarInterval</key><array>$INTERVALS</array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict></plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null; launchctl load "$PLIST"
  echo "Scheduled for weekday(s) $SCHED_DAYS (0=Sun) at 10:00 — runs when the Mac wakes if it was asleep. Log: $LOG"
  exit 0
fi

if [ "$(uname)" != "Darwin" ] && [ -z "$MAC_CLEANUP_FORCE" ]; then
  echo "This script is for macOS." >&2; exit 1
fi

TOTAL_KB=0
TALLY="${TMPDIR:-/tmp}/mac-cleanup.$$"
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

# remove_tally <path> — same as remove, but safe inside a pipe (sizes go to $TALLY)
remove_tally() {
  local p="$1" kb
  kb=$(du -sk "$p" 2>/dev/null | awk '{print $1}'); kb=${kb:-0}
  [ "$kb" -gt 0 ] || return 0
  printf '  %10s  %s\n' "$(human "$kb")" "$p"
  echo "$kb" >> "$TALLY"
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

# ---------------------------------------------------------------- Xcode + simulators
say "Xcode and simulators"
remove "$HOME/Library/Developer/Xcode/DerivedData"
remove "$HOME/Library/Developer/Xcode/iOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/watchOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/tvOS DeviceSupport"
remove "$HOME/Library/Developer/Xcode/UserData/Previews"
remove "$HOME/Library/Developer/XCPGDevices"
remove "$HOME/Library/Caches/com.apple.dt.Xcode"
remove "$HOME/Library/Developer/CoreSimulator/Caches"
remove "$HOME/Library/Logs/CoreSimulator"
if have xcrun; then
  run xcrun simctl delete unavailable
  # simulator OS images nobody has launched in N days (re-downloadable from Xcode > Settings > Components)
  run xcrun simctl runtime delete --notUsedSinceDays "$RUNTIME_DAYS"
  [ "$AGGR" -eq 1 ] && { remove "$HOME/Library/Developer/Xcode/Archives"; run xcrun simctl erase all; }
fi

# ---------------------------------------------------------------- your apps
say "Your apps (APP_DIRS): build output, tool caches, git garbage"
if [ -z "$APP_DIRS" ]; then
  echo "  none configured yet. Run:  ./tools/mac-cleanup.sh --find-apps"
  echo "  then put the folders in $CONF as:  APP_DIRS=\"/path/one:/path/two\""
else
  OLDIFS=$IFS; IFS=':'; set -- $APP_DIRS; IFS=$OLDIFS
  for app in "$@"; do
    if [ ! -d "$app" ]; then echo "  missing folder, skipped: $app"; continue; fi
    echo "  $app"
    find "$app" -maxdepth 6 \( -name node_modules -o -name .git \) -prune -o -type d \
      \( -name .next -o -name .nuxt -o -name .svelte-kit -o -name .turbo -o -name .parcel-cache -o -name .vite \
         -o -name .expo -o -name .gradle -o -name coverage -o -name __pycache__ -o -name .pytest_cache \
         -o -name .mypy_cache -o -name .ruff_cache -o -name DerivedData \
         -o -path '*/ios/build' -o -path '*/android/build' -o -path '*/android/app/build' \) -prune -print0 2>/dev/null |
      while IFS= read -r -d '' dir; do remove_tally "$dir"; done
    # compact git history storage (loose objects, stale packs); never touches working files or commits
    if [ -d "$app/.git" ] && have git; then
      gb=$(du -sk "$app/.git" 2>/dev/null | awk '{print $1}')
      if [ "$DRY" -eq 1 ]; then echo "  (dry-run) git gc --prune=now in $app"
      else
        git -C "$app" gc --prune=now --quiet 2>/dev/null
        ga=$(du -sk "$app/.git" 2>/dev/null | awk '{print $1}')
        [ "${gb:-0}" -gt "${ga:-0}" ] && { echo "$((gb - ga))" >> "$TALLY"; printf '  %10s  git gc %s\n' "$(human $((gb - ga)))" "$app"; }
      fi
    fi
  done
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
[ -n "$APP_DIRS" ] && ROOTS="$ROOTS:$APP_DIRS"
OLDIFS=$IFS; IFS=':'; set -- $ROOTS; IFS=$OLDIFS
SEEN=":"
for root in "$@"; do
  [ -d "$root" ] || continue
  # skip folders already covered by an earlier root, so nothing is listed (or counted) twice
  covered=0
  OLDIFS=$IFS; IFS=':'
  for s in $SEEN; do [ -n "$s" ] && case "$root/" in "$s"/*) covered=1 ;; esac; done
  IFS=$OLDIFS
  [ "$covered" -eq 1 ] && continue
  SEEN="$SEEN$root:"
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
    remove_tally "$dir"
  done
done

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

# ---------------------------------------------------------------- Time Machine
if [ "$SUDO" -eq 1 ] && have tmutil; then
  say "Time Machine local snapshots"
  run sudo tmutil thinlocalsnapshots / 999999999999 4
fi

# ---------------------------------------------------------------- summary
if [ -f "$TALLY" ]; then
  TOTAL_KB=$((TOTAL_KB + $(awk '{s+=$1} END{print s+0}' "$TALLY")))
  rm -f "$TALLY"
fi
AFTER=$(free_kb)
say "Done"
if [ "$DRY" -eq 1 ]; then
  echo "  Would remove about $(human "$TOTAL_KB") directly (tool-managed caches such as brew/docker/go are extra)."
else
  echo "  Removed about $(human "$TOTAL_KB") directly.  Free space: $(human "$BEFORE") -> $(human "$AFTER")  (net $(human $((AFTER - BEFORE))))"
fi

# interactive runs only: scanning big folders is slow and pointless in the background
if [ -t 1 ]; then
  say "Biggest folders left in your home (review these yourself — not touched)"
  if [ "$REPORT" -eq 1 ]; then
    du -sk "$HOME"/* "$HOME"/Library/* 2>/dev/null
  else
    du -sk "$HOME"/* 2>/dev/null
  fi | sort -rn | head -12 | awk '{k=$1; $1=""; printf "  %8.1f GB %s\n", k/1048576, $0}'
  [ -d "$HOME/Library/Application Support/MobileSync/Backup" ] &&
    echo "  Note: old iPhone/iPad backups live in ~/Library/Application Support/MobileSync/Backup"
fi
