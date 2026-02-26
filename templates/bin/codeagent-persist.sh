#!/bin/bash
# codeagent-persist: tees codeagent-wrapper output to persistent file
# Fallback for Claude Code TaskOutput temp file loss.
# Usage: same as codeagent-wrapper (all args forwarded)

_D="$HOME/.claude/.ccg/outputs"
mkdir -p "$_D" 2>/dev/null

# Cleanup: remove files older than 1 hour, keep max 20
find "$_D" -name "*.txt" -mmin +60 -delete 2>/dev/null
_N=$(ls -1 "$_D"/*.txt 2>/dev/null | wc -l)
[ "$_N" -gt 20 ] && ls -1t "$_D"/*.txt | tail -n +21 | xargs rm -f 2>/dev/null

_SD="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -f "$_SD/codeagent-wrapper.exe" ] && _B="$_SD/codeagent-wrapper.exe" || _B="$_SD/codeagent-wrapper"

_F="$_D/$(date +%Y%m%d-%H%M%S)-$$.txt"
"$_B" "$@" | tee "$_F"
exit ${PIPESTATUS[0]}
