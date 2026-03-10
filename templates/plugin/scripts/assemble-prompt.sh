#!/usr/bin/env bash
set -euo pipefail

# assemble-prompt.sh - 从 worker 模板组装完整的子Agent prompt
#
# 用法：
#   assemble-prompt.sh <worker-name> --plugin-root <path> --input-dir <path> --output <path> [options]
#
# worker-name: analyze-worker | plan-worker | execute-worker | review-worker | test-worker
#
# 选项：
#   --plugin-root <path>   PLUGIN_ROOT 绝对路径（必须）
#   --input-dir <path>     输入文件目录（必须），包含 task.md / context.md 等动态内容文件
#   --output <path>        输出文件路径（必须），组装后的完整 prompt 写入此文件
#   --plan-dir <path>      状态目录路径 → {{PLAN_DIR}}
#   --session <id>         Codex 会话 ID → {{CODEX_SESSION}}
#   --session-b <id>       Codex-B 会话 ID → {{CODEX_B_SESSION}}
#
# 输入文件（从 --input-dir 读取）：
#   task.md            → {{TASK_CONTENT}}
#   context.md         → {{PROJECT_CONTEXT}}
#   decisions.md       → {{DECISIONS_CONTENT}}
#   findings.md        → {{ANALYZE_FINDINGS}}
#   plan.md            → {{PLAN_CONTENT}}
#   diff.txt           → {{DIFF_CONTENT}}
#   changed-files.txt  → {{CHANGED_FILES}}
#   team-name.txt      → {{TEAM_NAME}}
#
# 输出：完整的 prompt 文本写入 --output 指定的文件

WORKER_NAME="${1:?用法: assemble-prompt.sh <worker-name> --plugin-root <path> --input-dir <path> --output <path> [options]}"
shift

# --- 解析参数 ---
PLUGIN_ROOT=""
PLAN_DIR=""
SESSION_ID=""
SESSION_B_ID=""
INPUT_DIR=""
OUTPUT_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin-root) PLUGIN_ROOT="$2"; shift 2 ;;
    --plan-dir)    PLAN_DIR="$2"; shift 2 ;;
    --session)     SESSION_ID="$2"; shift 2 ;;
    --session-b)   SESSION_B_ID="$2"; shift 2 ;;
    --input-dir)   INPUT_DIR="$2"; shift 2 ;;
    --output)      OUTPUT_FILE="$2"; shift 2 ;;
    *) echo "[assemble-prompt] 未知选项: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$PLUGIN_ROOT" ]] && { echo "[assemble-prompt] 错误: --plugin-root 必须指定" >&2; exit 1; }
[[ -z "$INPUT_DIR" ]] && { echo "[assemble-prompt] 错误: --input-dir 必须指定" >&2; exit 1; }
[[ -z "$OUTPUT_FILE" ]] && { echo "[assemble-prompt] 错误: --output 必须指定" >&2; exit 1; }

# --- 文件读取辅助函数 ---
read_input() {
  local file="$INPUT_DIR/$1"
  local default="${2:-}"
  if [[ -f "$file" ]]; then
    cat "$file"
  else
    echo "$default"
  fi
}

# --- 读取模板 ---
TEMPLATE_PATH="$PLUGIN_ROOT/shared/agent-prompts/${WORKER_NAME}.md"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "[assemble-prompt] 错误: 模板不存在: $TEMPLATE_PATH" >&2
  exit 1
fi

PROMPT=$(<"$TEMPLATE_PATH")

# --- 替换构建变量（对齐 build-plugin.mjs 的 INSTALL_VAR_RULES）---
# {{LITE_MODE_FLAG}} → --lite（与 build-plugin.mjs 一致）
PROMPT="${PROMPT//\{\{LITE_MODE_FLAG\}\}/--lite }"

# --- 替换路径占位符（对齐 build-plugin.mjs 的 PATH_RULES）---
# ~/.claude/bin/codeagent-wrapper → $PLUGIN_ROOT/bin/run-wrapper
PROMPT="${PROMPT//\~\/.claude\/bin\/codeagent-wrapper/${PLUGIN_ROOT}/bin/run-wrapper}"
# ~/.claude/.ccg/prompts/ → $PLUGIN_ROOT/prompts/
PROMPT="${PROMPT//\~\/.claude\/.ccg\/prompts\//${PLUGIN_ROOT}/prompts/}"
# ~/.claude/.ccg/shared/ → $PLUGIN_ROOT/shared/
PROMPT="${PROMPT//\~\/.claude\/.ccg\/shared\//${PLUGIN_ROOT}/shared/}"
# ~/.claude/.ccg → 绝对路径（兼容旧引用，放在具体路径之后避免短匹配覆盖长路径）
PROMPT="${PROMPT//\~\/.claude\/.ccg/${PLUGIN_ROOT}}"
# ~/.claude/bin/ → $PLUGIN_ROOT/bin/
PROMPT="${PROMPT//\~\/.claude\/bin\//${PLUGIN_ROOT}/bin/}"
# $CLAUDE_PLUGIN_ROOT → 绝对路径（用 sed 处理 $ 转义）
PROMPT=$(printf '%s' "$PROMPT" | sed "s|\\\$CLAUDE_PLUGIN_ROOT|${PLUGIN_ROOT}|g")

# --- 从文件读取内容并替换占位符 ---
TASK_CONTENT=$(read_input "task.md" "<未提供任务内容>")
PROJECT_CONTEXT=$(read_input "context.md" "<未提供项目上下文>")
DECISIONS_CONTENT=$(read_input "decisions.md" "")
ANALYZE_FINDINGS=$(read_input "findings.md" "")
PLAN_CONTENT=$(read_input "plan.md" "")
DIFF_CONTENT=$(read_input "diff.txt" "")
CHANGED_FILES=$(read_input "changed-files.txt" "")
TEAM_NAME=$(read_input "team-name.txt" "")

PROMPT="${PROMPT//\{\{TASK_CONTENT\}\}/$TASK_CONTENT}"
PROMPT="${PROMPT//\{\{PROJECT_CONTEXT\}\}/$PROJECT_CONTEXT}"
PROMPT="${PROMPT//\{\{DECISIONS_CONTENT\}\}/$DECISIONS_CONTENT}"
PROMPT="${PROMPT//\{\{ANALYZE_FINDINGS\}\}/$ANALYZE_FINDINGS}"
PROMPT="${PROMPT//\{\{PLAN_CONTENT\}\}/$PLAN_CONTENT}"
PROMPT="${PROMPT//\{\{DIFF_CONTENT\}\}/$DIFF_CONTENT}"
PROMPT="${PROMPT//\{\{CHANGED_FILES\}\}/$CHANGED_FILES}"
PROMPT="${PROMPT//\{\{TEAM_NAME\}\}/$TEAM_NAME}"

# --- 替换 ID 占位符 ---
PROMPT="${PROMPT//\{\{PLAN_DIR\}\}/${PLAN_DIR}}"
PROMPT="${PROMPT//\{\{CODEX_SESSION\}\}/${SESSION_ID}}"
PROMPT="${PROMPT//\{\{CODEX_B_SESSION\}\}/${SESSION_B_ID}}"

# --- 确保输出目录存在 ---
mkdir -p "$(dirname "$OUTPUT_FILE")"

# --- 写入输出文件 ---
printf '%s\n' "$PROMPT" > "$OUTPUT_FILE"

echo "[assemble-prompt] 已写入: $OUTPUT_FILE ($(wc -c < "$OUTPUT_FILE") bytes)"
