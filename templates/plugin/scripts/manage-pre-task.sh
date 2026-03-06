#!/bin/bash
# CCG Manage: PreToolUse hook for Task tool
# Injects current manage session progress state before spawning/waiting subagents
# Conditional: only fires when an active manage session exists
# Always exits 0 — stdout feeds into Claude's context

# Find active manage session (status != complete)
ACTIVE_PLAN=""
for pf in .claude/plan/*/progress.md; do
  [ -f "$pf" ] || continue
  STATUS=$(grep "^## 状态:" "$pf" 2>/dev/null | sed 's/^## 状态: //')
  if [ "$STATUS" != "complete" ] && [ -n "$STATUS" ]; then
    ACTIVE_PLAN="$pf"
    break
  fi
done

if [ -z "$ACTIVE_PLAN" ]; then
  exit 0
fi

PLAN_DIR=$(dirname "$ACTIVE_PLAN")
TASK_NAME=$(basename "$PLAN_DIR")

echo "[ccg:manage] Active session: $TASK_NAME"
echo "[ccg:manage] Status: $STATUS"

# Show recent timeline entries (last 3)
TIMELINE=$(grep "^\- \[" "$ACTIVE_PLAN" 2>/dev/null | tail -3)
if [ -n "$TIMELINE" ]; then
  echo "[ccg:manage] Recent timeline:"
  echo "$TIMELINE"
fi

# Show error count if any
ERROR_COUNT=$(grep -c "^|" "$PLAN_DIR/progress.md" 2>/dev/null | tail -1)
if [ "$ERROR_COUNT" -gt 2 ]; then
  ACTUAL=$((ERROR_COUNT - 2))  # subtract header rows
  if [ "$ACTUAL" -gt 0 ]; then
    echo "[ccg:manage] Errors logged: $ACTUAL"
  fi
fi

exit 0
