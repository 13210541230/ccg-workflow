#!/bin/bash
# CCG Manage: PreToolUse hook for Task / Agent tools
# Injects phase-aware protocol summary before spawning/waiting subagents
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
PHASE_GATE="$PLAN_DIR/phase-gate.md"

echo "[ccg:manage] ── Protocol Snapshot ── Task: $TASK_NAME"
echo "[ccg:manage] Status: $STATUS"

# Extract current phase number from progress.md
CURRENT_PHASE_LINE=$(grep "^## 当前阶段:" "$ACTIVE_PLAN" 2>/dev/null | head -1)
if [ -z "$CURRENT_PHASE_LINE" ]; then
  CURRENT_PHASE_LINE=$(grep "current_phase\|Phase [0-9]" "$ACTIVE_PLAN" 2>/dev/null | head -1)
fi
echo "[ccg:manage] Phase: ${CURRENT_PHASE_LINE:-unknown}"

# Extract phase number (0-5) from the line
PHASE_NUM=$(echo "$CURRENT_PHASE_LINE" | grep -oP 'Phase \K[0-9]' | head -1)

# Show phase-gate protocol for current phase
if [ -f "$PHASE_GATE" ] && [ -n "$PHASE_NUM" ]; then
  # Extract the section for the current phase
  SECTION=$(awk "/^## Phase $PHASE_NUM /,/^## Phase [0-9]/" "$PHASE_GATE" 2>/dev/null | grep -v "^## Phase [0-9]" | head -6)
  if [ -n "$SECTION" ]; then
    echo "[ccg:manage] Gate for Phase $PHASE_NUM:"
    echo "$SECTION" | while IFS= read -r line; do
      [ -n "$line" ] && echo "  $line"
    done
  fi
else
  # Fallback: show required reading if phase-gate not found
  echo "[ccg:manage] WARNING: phase-gate.md not found — read runtime-protocol.md + phase-gate.md before proceeding"
fi

# Hard Stop detection
if [ -f "$PHASE_GATE" ] && [ -n "$PHASE_NUM" ]; then
  HARD_STOP=$(awk "/^## Phase $PHASE_NUM /,/^## Phase [0-9]/" "$PHASE_GATE" 2>/dev/null | grep "^- Hard Stop:" | sed 's/^- Hard Stop: //')
  if [ -n "$HARD_STOP" ] && [ "$HARD_STOP" != "无" ]; then
    echo "[ccg:manage] ⚠ HARD STOP: $HARD_STOP"
  fi
fi

# Show recent timeline (last 2 entries)
TIMELINE=$(grep "^\- \[" "$ACTIVE_PLAN" 2>/dev/null | tail -2)
if [ -n "$TIMELINE" ]; then
  echo "[ccg:manage] Recent:"
  echo "$TIMELINE" | while IFS= read -r line; do echo "  $line"; done
fi

# Required reading files reminder
echo "[ccg:manage] Required reads on reboot: runtime-protocol.md → phase-gate.md → progress.md"

exit 0
