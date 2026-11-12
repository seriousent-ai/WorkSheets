#!/usr/bin/env bash
# mac-health.sh — read-only health check for a Mac. Changes nothing.
#
# Usage:
#   ./tools/mac-health.sh            print the report
#   ./tools/mac-health.sh --quick    skip the macOS update check (it needs the network and is slow)
#   ./tools/mac-health.sh --log      append the report to ~/Library/Logs/mac-health.log
#   ./tools/mac-health.sh --notify   show a macOS notification only when something needs attention
#
# The scheduled cleanup (mac-cleanup.sh --log) runs this with --log --notify at the end.

set -o pipefail

QUICK=0; LOGTO=0; NOTIFY=0
LOG="$HOME/Library/Logs/mac-health.log"
DISK_MIN_PCT=15      # warn below this % free
DISK_MIN_GB=50       # ...or below this many GB free
UPTIME_MAX_DAYS=14   # warn if not restarted for this long
BACKUP_MAX_DAYS=7    # warn if the last Time Machine backup is older
BATTERY_MIN_PCT=80   # warn if maximum battery capacity drops below this
BATTERY_MAX_CYCLES=900

while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --log) LOGTO=1 ;;
    --notify) NOTIFY=1 ;;
    -h|--help) sed -n '2,10p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

if [ "$(uname)" != "Darwin" ] && [ -z "$MAC_HEALTH_FORCE" ]; then
  echo "This script is for macOS." >&2; exit 1
fi

if [ "$LOGTO" -eq 1 ]; then
  mkdir -p "$(dirname "$LOG")"
  exec >>"$LOG" 2>&1
fi

have() { command -v "$1" >/dev/null 2>&1; }
WARNINGS=""; NWARN=0
ok()   { printf '  OK    %-22s %s\n' "$1" "$2"; }
info() { printf '  --    %-22s %s\n' "$1" "$2"; }
warn() { printf '  WARN  %-22s %s\n' "$1" "$2"; WARNINGS="${WARNINGS}${3:-$1}; "; NWARN=$((NWARN + 1)); }
now=$(date +%s)

echo "mac-health $(date '+%Y-%m-%d %H:%M')"

# ---- disk space
DISK_PATH=/System/Volumes/Data; [ -d "$DISK_PATH" ] || DISK_PATH="$HOME"
read -r total avail <<EOF
$(df -k "$DISK_PATH" | awk 'NR==2{print $2, $4}')
EOF
if [ -n "$total" ] && [ "$total" -gt 0 ]; then
  pct=$((avail * 100 / total)); gb=$((avail / 1048576))
  if [ "$pct" -lt "$DISK_MIN_PCT" ] || [ "$gb" -lt "$DISK_MIN_GB" ]; then
    warn "Disk space" "${gb} GB free (${pct}%)" "disk space is low (${gb} GB free)"
  else
    ok "Disk space" "${gb} GB free (${pct}%)"
  fi
fi

# ---- time since last restart
boot=$(sysctl -n kern.boottime 2>/dev/null | sed -n 's/^{ *sec = \([0-9]*\),.*/\1/p')
if [ -n "$boot" ]; then
  days=$(( (now - boot) / 86400 ))
  if [ "$days" -gt "$UPTIME_MAX_DAYS" ]; then
    warn "Last restart" "${days} days ago" "restart is overdue (${days} days)"
  else
    ok "Last restart" "${days} days ago"
  fi
fi

# ---- battery
if have system_profiler; then
  bat=$(system_profiler SPPowerDataType 2>/dev/null)
  cycles=$(printf '%s\n' "$bat" | awk -F': ' '/Cycle Count/{print $2; exit}')
  cond=$(printf '%s\n' "$bat" | awk -F': ' '/Condition/{print $2; exit}')
  cap=$(printf '%s\n' "$bat" | awk -F': ' '/Maximum Capacity/{gsub(/%/,"",$2); print $2; exit}')
  if [ -n "$cycles$cond$cap" ]; then
    detail="${cond:-n/a}, ${cap:-?}% capacity, ${cycles:-?} cycles"
    if { [ -n "$cond" ] && [ "$cond" != "Normal" ]; } || { [ -n "$cap" ] && [ "$cap" -lt "$BATTERY_MIN_PCT" ]; } || { [ -n "$cycles" ] && [ "$cycles" -gt "$BATTERY_MAX_CYCLES" ]; }; then
      warn "Battery" "$detail" "battery is wearing out ($detail)"
    else
      ok "Battery" "$detail"
    fi
  fi
fi

# ---- Time Machine
tm=$(defaults read /Library/Preferences/com.apple.TimeMachine 2>/dev/null)
if [ -n "$tm" ]; then
  last=$(printf '%s\n' "$tm" | grep -o '"[0-9]\{4\}-[0-9][0-9]-[0-9][0-9] [0-9:]*' | tail -1 | tr -d '"')
  if [ -n "$last" ]; then
    ts=$(date -j -f "%Y-%m-%d %H:%M:%S" "$last" +%s 2>/dev/null || date -d "$last UTC" +%s 2>/dev/null)
    bdays=$(( (now - ts) / 86400 ))
    if [ "$bdays" -gt "$BACKUP_MAX_DAYS" ]; then
      warn "Time Machine backup" "last backup ${bdays} days ago" "no Time Machine backup for ${bdays} days"
    else
      ok "Time Machine backup" "last backup ${bdays} days ago"
    fi
  else
    warn "Time Machine backup" "no backups found" "Time Machine has no backups"
  fi
else
  info "Time Machine backup" "could not read settings (not set up, or not permitted)"
fi

# ---- macOS updates
if [ "$QUICK" -eq 0 ] && have softwareupdate; then
  su=$(softwareupdate -l 2>&1)
  n=$(printf '%s\n' "$su" | grep -c '^\* Label:')
  if [ "$n" -gt 0 ]; then
    warn "macOS updates" "$n available" "$n macOS update(s) available"
  elif printf '%s\n' "$su" | grep -q "No new software available"; then
    ok "macOS updates" "up to date"
  else
    info "macOS updates" "could not check"
  fi
fi

# ---- FileVault (disk encryption)
if have fdesetup; then
  fv=$(fdesetup status 2>/dev/null | head -1)
  case "$fv" in
    *"is On"*) ok "FileVault" "on" ;;
    *"is Off"*) warn "FileVault" "off" "FileVault disk encryption is off" ;;
  esac
fi

# ---- kernel panics in the last 30 days
panics=$(find /Library/Logs/DiagnosticReports -name '*.panic' -mtime -30 2>/dev/null | wc -l | tr -d ' ')
if [ "${panics:-0}" -gt 0 ]; then
  warn "Kernel panics" "$panics in the last 30 days" "$panics crash(es) of the whole system in 30 days"
else
  ok "Kernel panics" "none in 30 days"
fi

# ---- memory (information only)
swap=$(sysctl -n vm.swapusage 2>/dev/null | sed -n 's/.*used = \([0-9.]*[MG]\).*/\1/p')
[ -n "$swap" ] && info "Swap in use" "$swap"
top=$(ps -axo rss=,comm= 2>/dev/null | awk '{r=$1; $1=""; sub(/^ /,""); n=split($0,a,"/"); s[a[n]]+=r} END{for(k in s) printf "%d %s\n", s[k], k}' | sort -rn | head -5 |
  awk '{r=$1; $1=""; sub(/^ /,""); printf "%s %.1f GB, ", $0, r/1048576}' | sed 's/, $//')
[ -n "$top" ] && info "Top memory users" "$top"

# ---- summary
if [ "$NWARN" -eq 0 ]; then
  echo "  Result: all good"
else
  echo "  Result: $NWARN thing(s) need attention"
fi

if [ "$NOTIFY" -eq 1 ] && [ "$NWARN" -gt 0 ] && have osascript; then
  msg=$(printf '%s' "$WARNINGS" | sed 's/; $//; s/"/ /g')
  osascript -e "display notification \"$msg\" with title \"Mac health: $NWARN thing(s) need attention\"" >/dev/null 2>&1
fi
exit 0
