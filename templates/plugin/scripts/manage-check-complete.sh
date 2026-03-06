#!/bin/bash
# CCG Manage: Stop hook — check for incomplete manage sessions
# Warns if stopping with active tasks still in progress
# Always exits 0 — stdout feeds into Claude's context

FOUND_INCOMPLETE=0

for pf in .claude/plan/*/progress.md; do
  [ -f "$pf" ] || continue
  DIR=$(dirname "$pf")
  TASK=$(basename "$DIR")
  STATUS=$(grep "^## 状态:" "$pf" 2>/dev/null | sed 's/^## 状态: //')

  if [ "$STATUS" = "complete" ] || [ -z "$STATUS" ]; then
    continue
  fi

  FOUND_INCOMPLETE=1
  echo "[ccg:manage] INCOMPLETE task: '$TASK' (status: $STATUS)"

  # Show what phase we're in
  LAST_TIMELINE=$(grep "^\- \[" "$pf" 2>/dev/null | tail -1)
  if [ -n "$LAST_TIMELINE" ]; then
    echo "[ccg:manage] Last activity: $LAST_TIMELINE"
  fi

  # Count errors
  ERROR_LINES=$(grep "^|" "$pf" 2>/dev/null | grep -v "^| 时间\|^|---" | wc -l)
  if [ "$ERROR_LINES" -gt 0 ]; then
    echo "[ccg:manage] Unresolved errors: $ERROR_LINES"
  fi

  echo "[ccg:manage] State files: $DIR/"
done

if [ "$FOUND_INCOMPLETE" -eq 1 ]; then
  echo "[ccg:manage] WARNING: Stopping with incomplete tasks. Progress is saved in state files."
  echo "[ccg:manage] Resume with: /ccg:manage (reads existing state files to continue)"
fi

exit 0
