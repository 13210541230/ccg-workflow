#!/bin/bash
# CCG Manage: PostToolUse hook for Task / Agent tools
# Reminds Claude of phase-specific post-worker protocol after subagent returns
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
PHASE_GATE="$PLAN_DIR/phase-gate.md"

echo "[ccg:manage] Worker returned. Post-phase protocol:"

# Extract current phase number
CURRENT_PHASE_LINE=$(grep "^## 当前阶段:" "$ACTIVE_PLAN" 2>/dev/null | head -1)
PHASE_NUM=$(echo "$CURRENT_PHASE_LINE" | grep -oP 'Phase \K[0-9]' | head -1)

# Phase-specific post-worker checklist
case "$PHASE_NUM" in
  0)
    echo "  1. Verify runtime-protocol.md + phase-gate.md were written to plan dir"
    echo "  2. Confirm complexity assessment (simple/complex) is recorded in progress.md"
    echo "  3. Update progress.md: 当前阶段 → Phase 1"
    echo "  4. Hard Stop gate: recommended approach must be confirmed before Phase 1"
    ;;
  1)
    echo "  1. Validate Codex evidence in worker reply: runtime_mode / session_id / reuse_eligible / output_file"
    echo "  2. Merge analysis-a.md + analysis-b.md → findings.md"
    echo "  3. Log worker Agent IDs to progress.md Session Registry"
    echo "  4. Update progress.md: 当前阶段 → Phase 2"
    echo "  5. Report findings summary to user"
    ;;
  2)
    echo "  1. Validate Codex evidence in worker reply: runtime_mode / session_id / reuse_eligible / output_file"
    echo "  2. Merge plan-a.md + plan-b.md → task_plan.md (zero-context format)"
    echo "  3. Log worker Agent IDs to progress.md Session Registry"
    echo "  4. Hard Stop gate: show plan to user and WAIT for explicit confirmation"
    echo "  5. Only after confirmation: update progress.md 当前阶段 → Phase 3"
    ;;
  3)
    echo "  1. Validate Codex evidence: runtime_mode / session_id / reuse_eligible / output_file"
    echo "  2. If codex bypass detected: reject result, retry same executor worker"
    echo "  3. Write implementation-result-<n>.md to artifacts/"
    echo "  4. Update progress.md timeline + executor Agent ID"
    echo "  5. Proceed to Phase 5 (test) — do NOT self-declare implementation complete"
    ;;
  4)
    echo "  1. Validate Codex evidence in both reviewer replies"
    echo "  2. Merge review-a-<n>.md + review-b-<n>.md → findings.md"
    echo "  3. Critical check: any Critical findings → write review-failure-<n>.md, loop back to Phase 3"
    echo "  4. Log reviewer Agent IDs to progress.md"
    echo "  5. If clean: update progress.md → complete"
    ;;
  5)
    echo "  1. Record actual test command + full output as evidence"
    echo "  2. Confirm original issue is resolved"
    echo "  3. Confirm no regressions (full test suite passed)"
    echo "  4. Write evidence to progress.md evidence table"
    echo "  5. If pass: proceed to Phase 4 (review); if fail: loop back to Phase 3"
    ;;
  *)
    # Unknown phase — fallback to generic protocol
    echo "  1. Extract Codex evidence → findings.md"
    echo "  2. Log errors → progress.md error table"
    echo "  3. 3-Strike check (same worker ≥3 failures?)"
    echo "  4. Sync plan deviations → task_plan.md"
    echo "  5. Session log → progress.md session table"
    echo "  6. Update status + timeline, report to user"
    ;;
esac

echo "[ccg:manage] State dir: $PLAN_DIR/"
echo "[ccg:manage] 8-Question Reboot Check: if Q6-Q8 unclear → read runtime-protocol.md + phase-gate.md first"

exit 0
