#!/bin/bash
# CCG Manage: PostToolUse hook for Task / Agent tools
# Reminds Claude to execute the post-phase protocol after subagent returns
# Conditional: only fires when an active manage session exists
# Always exits 0 — stdout feeds into Claude's context

extract_field() {
  local file="$1"
  local key="$2"
  grep "^$key:" "$file" 2>/dev/null | head -1 | sed "s/^$key:[[:space:]]*//"
}

extract_section() {
  local file="$1"
  local section="$2"
  awk -v header="## $section" '
    $0 == header { in_section=1; next }
    /^## / && in_section { exit }
    in_section && NF { print }
  ' "$file" 2>/dev/null
}

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
PHASE_GATE="$PLAN_DIR/phase-gate.md"

echo "[ccg:manage] Tool returned. Persist state before the next routing decision."

if [ -f "$PHASE_GATE" ]; then
  CURRENT_PHASE=$(extract_field "$PHASE_GATE" "Current Phase")
  NEXT_ACTION=$(extract_field "$PHASE_GATE" "Next Allowed Action")
  HARD_STOP=$(extract_field "$PHASE_GATE" "Hard Stop")
  [ -n "$CURRENT_PHASE" ] && echo "[ccg:manage] Current phase: $CURRENT_PHASE"
  [ -n "$NEXT_ACTION" ] && echo "[ccg:manage] Next allowed action: $NEXT_ACTION"
  [ -n "$HARD_STOP" ] && echo "[ccg:manage] Hard stop: $HARD_STOP"

  AFTER_RETURNS=$(extract_section "$PHASE_GATE" "After Worker Returns")
  if [ -n "$AFTER_RETURNS" ]; then
    echo "[ccg:manage] After worker returns:"
    echo "$AFTER_RETURNS"
  fi
else
  echo "[ccg:manage] After worker returns:"
  echo "- append key findings to findings.md"
  echo "- update progress.md timeline and status"
  echo "- sync worker/session registry"
  echo "- read task_plan.md + progress.md before any routing decision"
fi

if [ "$STATUS" = "planning" ]; then
  echo "[ccg:manage] Planning phase must remain in Hard Stop until the user confirms."
fi

echo "[ccg:manage] State dir: $PLAN_DIR/"

exit 0
