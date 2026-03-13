#!/bin/bash
# CCG Manage: lightweight context anchor — fires on ALL tool calls
# Injects a minimal but complete protocol reminder after context compression
# Output is intentionally terse (<10 lines) to avoid context bloat
# Always exits 0

# Find active manage session
ACTIVE_PLAN=""
for pf in .claude/plan/*/progress.md; do
  [ -f "$pf" ] || continue
  STATUS=$(grep "^## 状态:" "$pf" 2>/dev/null | sed 's/^## 状态: //')
  if [ "$STATUS" != "complete" ] && [ -n "$STATUS" ]; then
    ACTIVE_PLAN="$pf"
    break
  fi
done

[ -z "$ACTIVE_PLAN" ] && exit 0

PLAN_DIR=$(dirname "$ACTIVE_PLAN")
PHASE_GATE="$PLAN_DIR/phase-gate.md"

# Extract phase number
PHASE_LINE=$(grep "^## 当前阶段:" "$ACTIVE_PLAN" 2>/dev/null | head -1)
PHASE_NUM=$(echo "$PHASE_LINE" | grep -oP 'Phase \K[0-9]' | head -1)
PHASE_LABEL=${PHASE_LINE:-unknown}

echo "[ccg:manage] ACTIVE | Role=Lead (NO direct source edits) | $PHASE_LABEL"

# Output allowed + forbidden from phase-gate
if [ -f "$PHASE_GATE" ] && [ -n "$PHASE_NUM" ]; then
  ALLOWED=$(awk "/^## Phase $PHASE_NUM /,/^## Phase [0-9]/" "$PHASE_GATE" 2>/dev/null \
    | grep "^- 允许动作:" | sed 's/^- 允许动作: //')
  FORBIDDEN=$(awk "/^## Phase $PHASE_NUM /,/^## Phase [0-9]/" "$PHASE_GATE" 2>/dev/null \
    | grep "^- 禁止动作:" | sed 's/^- 禁止动作: //')
  MUST_UPDATE=$(awk "/^## Phase $PHASE_NUM /,/^## Phase [0-9]/" "$PHASE_GATE" 2>/dev/null \
    | grep "^- Worker返回后必更新:" | sed 's/^- Worker返回后必更新: //')
  [ -n "$ALLOWED"     ] && echo "[ccg:manage] Next:     $ALLOWED"
  [ -n "$FORBIDDEN"   ] && echo "[ccg:manage] Forbidden: $FORBIDDEN"
  [ -n "$MUST_UPDATE" ] && echo "[ccg:manage] On-return: update $MUST_UPDATE"
else
  echo "[ccg:manage] Protocol unclear — read runtime-protocol.md + phase-gate.md BEFORE any action"
fi

exit 0
