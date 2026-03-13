#!/bin/bash
# CCG Manage: PostToolUse hook for Task / Agent tools
# Reminds Claude to execute the post-phase protocol after subagent returns
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

echo "[ccg:manage] Worker returned. Execute post-phase protocol NOW:"
echo "  1. Extract process log -> findings.md"
echo "  2. Log errors -> progress.md error table"
echo "  3. 3-Strike check (same worker >= 3 failures?)"
echo "  4. Sync plan deviations -> task_plan.md"
echo "  5. Session log -> progress.md session table"
echo "  6. Update status + timeline, report to user"
echo "[ccg:manage] State dir: $PLAN_DIR/"

exit 0
