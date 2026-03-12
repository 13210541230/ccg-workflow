#!/bin/bash
# CCG Manage: PreToolUse hook for Task / Agent tools
# Injects current manage session progress state before spawning/waiting subagents
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

print_fallback_gate() {
  case "$1" in
    planning)
      echo "[ccg:manage] Next allowed action: merge planners, write zero-context plan, ask user for confirmation"
      echo "[ccg:manage] Hard stop: yes"
      echo "[ccg:manage] Forbidden actions:"
      echo "- spawn executor"
      echo "- claim approval without explicit user confirmation"
      ;;
    confirmed)
      echo "[ccg:manage] Next allowed action: start Phase 3 implementation from approved plan"
      echo "[ccg:manage] Hard stop: no"
      ;;
    analyzing)
      echo "[ccg:manage] Next allowed action: dispatch/resume analyzer workers and merge findings"
      echo "[ccg:manage] Hard stop: no"
      ;;
    executing)
      echo "[ccg:manage] Next allowed action: dispatch/resume executor for current approved scope"
      echo "[ccg:manage] Hard stop: no"
      ;;
    testing)
      echo "[ccg:manage] Next allowed action: gather fresh evidence and record it"
      echo "[ccg:manage] Hard stop: no"
      ;;
    reviewing)
      echo "[ccg:manage] Next allowed action: dispatch/resume reviewers and merge findings"
      echo "[ccg:manage] Hard stop: no"
      ;;
    blocked)
      echo "[ccg:manage] Next allowed action: prepare blocker report and ask user for direction"
      echo "[ccg:manage] Hard stop: yes"
      ;;
    complete)
      echo "[ccg:manage] Next allowed action: none"
      echo "[ccg:manage] Hard stop: yes"
      ;;
    *)
      echo "[ccg:manage] Next allowed action: finish initialization or clarification before routing workers"
      echo "[ccg:manage] Hard stop: no"
      ;;
  esac
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
TASK_NAME=$(basename "$PLAN_DIR")
PHASE_GATE="$PLAN_DIR/phase-gate.md"
RUNTIME_PROTOCOL="$PLAN_DIR/runtime-protocol.md"

echo "[ccg:manage] Active session: $TASK_NAME"
echo "[ccg:manage] Status: $STATUS"

if [ -f "$RUNTIME_PROTOCOL" ]; then
  echo "[ccg:manage] Reboot order: runtime-protocol.md -> phase-gate.md -> progress.md -> findings.md -> task_plan.md"
fi

if [ -f "$PHASE_GATE" ]; then
  CURRENT_PHASE=$(extract_field "$PHASE_GATE" "Current Phase")
  NEXT_ACTION=$(extract_field "$PHASE_GATE" "Next Allowed Action")
  HARD_STOP=$(extract_field "$PHASE_GATE" "Hard Stop")
  [ -n "$CURRENT_PHASE" ] && echo "[ccg:manage] Current phase: $CURRENT_PHASE"
  [ -n "$NEXT_ACTION" ] && echo "[ccg:manage] Next allowed action: $NEXT_ACTION"
  [ -n "$HARD_STOP" ] && echo "[ccg:manage] Hard stop: $HARD_STOP"

  if [ -n "$CURRENT_PHASE" ] && [ -n "$STATUS" ] && [ "$CURRENT_PHASE" != "$STATUS" ]; then
    echo "[ccg:manage] WARNING: phase-gate.md is out of sync with progress.md"
  fi

  REQUIRED_READS=$(extract_section "$PHASE_GATE" "Required Reads Before Decision" | head -4)
  if [ -n "$REQUIRED_READS" ]; then
    echo "[ccg:manage] Required reads before decision:"
    echo "$REQUIRED_READS"
  fi

  FORBIDDEN=$(extract_section "$PHASE_GATE" "Forbidden Actions" | head -3)
  if [ -n "$FORBIDDEN" ]; then
    echo "[ccg:manage] Forbidden actions:"
    echo "$FORBIDDEN"
  fi
else
  print_fallback_gate "$STATUS"
fi

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
