#!/usr/bin/env bash
set -euo pipefail

# assemble-prompt.sh - 从 worker 模板组装完整的子Agent prompt
#
# 用法：
#   assemble-prompt.sh <worker-name> --plugin-root <path> [options]
#
# worker-name: analyze-worker | plan-worker | execute-worker | review-worker | test-worker
#
# 选项：
#   --plugin-root <path>   PLUGIN_ROOT 绝对路径（必须）
#   --plan-dir <path>      状态目录路径 → {{PLAN_DIR}}
#   --session <id>         Codex 会话 ID → {{CODEX_SESSION}}
#   --session-b <id>       Codex-B 会话 ID → {{CODEX_B_SESSION}}
#
# 内容通过环境变量注入（支持多行文本）：
#   PROMPT_TASK            → {{TASK_CONTENT}}
#   PROMPT_CONTEXT         → {{PROJECT_CONTEXT}}
#   PROMPT_DECISIONS       → {{DECISIONS_CONTENT}}
#   PROMPT_FINDINGS        → {{ANALYZE_FINDINGS}}
#   PROMPT_PLAN            → {{PLAN_CONTENT}}
#   PROMPT_DIFF            → {{DIFF_CONTENT}}
#   PROMPT_CHANGED_FILES   → {{CHANGED_FILES}}
#   PROMPT_TEAM_NAME       → {{TEAM_NAME}}
#
# 输出：完整的 prompt 文本（stdout），可直接用作 Agent prompt

WORKER_NAME="${1:?用法: assemble-prompt.sh <worker-name> --plugin-root <path> [options]}"
shift

# --- 解析参数 ---
PLUGIN_ROOT=""
PLAN_DIR=""
SESSION_ID=""
SESSION_B_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --plugin-root) PLUGIN_ROOT="$2"; shift 2 ;;
    --plan-dir)    PLAN_DIR="$2"; shift 2 ;;
    --session)     SESSION_ID="$2"; shift 2 ;;
    --session-b)   SESSION_B_ID="$2"; shift 2 ;;
    *) echo "[assemble-prompt] 未知选项: $1" >&2; exit 1 ;;
  esac
done

[[ -z "$PLUGIN_ROOT" ]] && { echo "[assemble-prompt] 错误: --plugin-root 必须指定" >&2; exit 1; }

# --- 读取模板 ---
TEMPLATE_PATH="$PLUGIN_ROOT/shared/agent-prompts/${WORKER_NAME}.md"
if [[ ! -f "$TEMPLATE_PATH" ]]; then
  echo "[assemble-prompt] 错误: 模板不存在: $TEMPLATE_PATH" >&2
  exit 1
fi

PROMPT=$(<"$TEMPLATE_PATH")

# --- 替换路径占位符 ---
# $CLAUDE_PLUGIN_ROOT → 绝对路径（用 sed 处理 $ 转义）
PROMPT=$(printf '%s' "$PROMPT" | sed "s|\\\$CLAUDE_PLUGIN_ROOT|${PLUGIN_ROOT}|g")
# ~/.claude/.ccg → 绝对路径（兼容旧引用）
PROMPT="${PROMPT//\~\/.claude\/.ccg/${PLUGIN_ROOT}}"

# --- 替换内容占位符 ---
PROMPT="${PROMPT//\{\{TASK_CONTENT\}\}/${PROMPT_TASK:-<未提供任务内容>}}"
PROMPT="${PROMPT//\{\{PROJECT_CONTEXT\}\}/${PROMPT_CONTEXT:-<未提供项目上下文>}}"
PROMPT="${PROMPT//\{\{DECISIONS_CONTENT\}\}/${PROMPT_DECISIONS:-}}"
PROMPT="${PROMPT//\{\{ANALYZE_FINDINGS\}\}/${PROMPT_FINDINGS:-}}"
PROMPT="${PROMPT//\{\{PLAN_CONTENT\}\}/${PROMPT_PLAN:-}}"
PROMPT="${PROMPT//\{\{DIFF_CONTENT\}\}/${PROMPT_DIFF:-}}"
PROMPT="${PROMPT//\{\{CHANGED_FILES\}\}/${PROMPT_CHANGED_FILES:-}}"
PROMPT="${PROMPT//\{\{TEAM_NAME\}\}/${PROMPT_TEAM_NAME:-}}"

# --- 替换 ID 占位符 ---
PROMPT="${PROMPT//\{\{PLAN_DIR\}\}/${PLAN_DIR}}"
PROMPT="${PROMPT//\{\{CODEX_SESSION\}\}/${SESSION_ID}}"
PROMPT="${PROMPT//\{\{CODEX_B_SESSION\}\}/${SESSION_B_ID}}"

# --- 输出 ---
printf '%s\n' "$PROMPT"
