# Teammate Bus Format

`ccg:teammate` 使用与 `ccg:manage` 兼容的任务目录，并额外引入：

- `.claude/plan/<task-name>/bus/messages.jsonl`
- `.claude/plan/<task-name>/bus/registry.json`
- `.claude/plan/<task-name>/artifacts/`

它支持多个长期 Codex teammate，至少包括：
- `analyzer`
- `planner`
- `executor`
- `reviewer`

这些角色必须登记为独立 teammate：
- 各自拥有独立 `agent_id`
- 各自拥有独立 `session_id`
- 各自只处理本角色职责

## messages.jsonl

每行一个 JSON 对象：

```json
{
  "id": "msg-001",
  "thread_id": "verify-manage-flow",
  "from": "claude-lead",
  "to": "analyzer|planner|executor|reviewer|claude-lead",
  "type": "question|decision|blocker|result|handoff|review",
  "summary": "One-line summary",
  "body_file": ".claude/plan/verify-manage-flow/artifacts/review-findings-1.md",
  "artifacts": [
    ".claude/plan/verify-manage-flow/artifacts/review-findings-1.md"
  ],
  "reply_to": "msg-000",
  "blocking": true,
  "status": "open|answered|accepted"
}
```

规则：
- `summary` 必须简短
- 长正文一律写到 `body_file`
- `artifacts` 只放文件路径，不内嵌大段文本
- `blocking=true` 表示对方必须先回复再继续
- `to` 只能写单一角色，避免多个 teammate 同时消费同一消息

## registry.json

示例：

```json
{
  "thread_id": "verify-manage-flow",
  "mode": "complex",
  "lead": {
    "role": "claude-lead",
    "status": "active"
  },
  "partners": {
    "analyzer": {
      "session_name": "verify-manage-flow-analyzer-a",
      "agent_id": "agent-analyze-123",
      "subagent_type": "ccg:codex-analyzer",
      "session_id": "session-analyze-001",
      "status": "running|completed|failed|blocked|not_started",
      "reuse_eligible": true,
      "last_output_file": ".claude/plan/verify-manage-flow/artifacts/analysis-a.md"
    },
    "planner": {
      "session_name": "verify-manage-flow-planner",
      "agent_id": "agent-plan-123",
      "subagent_type": "ccg:codex-planner",
      "session_id": "session-plan-001",
      "status": "running|completed|failed|blocked|not_started",
      "reuse_eligible": true,
      "last_output_file": ".claude/plan/verify-manage-flow/artifacts/plan-1.md"
    },
    "executor": {
      "session_name": "verify-manage-flow-executor",
      "agent_id": "agent-exec-123",
      "subagent_type": "ccg:codex-executor",
      "session_id": "session-exec-001",
      "status": "running|completed|failed|blocked|not_started",
      "reuse_eligible": true,
      "last_output_file": ".claude/plan/verify-manage-flow/artifacts/implementation-1.md"
    },
    "reviewer": {
      "session_name": "verify-manage-flow-reviewer",
      "agent_id": "agent-review-123",
      "subagent_type": "ccg:codex-reviewer",
      "session_id": "session-review-001",
      "status": "running|completed|failed|blocked|not_started",
      "reuse_eligible": true,
      "last_output_file": ".claude/plan/verify-manage-flow/artifacts/review-findings-1.md"
    }
  }
}
```

规则：
- 各角色 teammate spawn 成功后立即登记
- 各角色 teammate 通过 `ccg-codex` MCP 的 `codex_session_ensure` / `codex_session_send` 维护底层 session
- `analyzer / planner / executor / reviewer` 必须保留各自独立的 `agent_id` 和 `session_id`
- 建议同时记录 `session_name`，供 MCP 工具稳定复用
- 复杂分析优先看 `analyzer.reuse_eligible`
- 复杂规划优先看 `planner.reuse_eligible`
- 测试失败和修复回流优先看 `executor.reuse_eligible`
- 正式审查优先看 `reviewer.reuse_eligible`
- 只有当前角色 `reuse_eligible=true` 时才优先 `resume`
- 若出现空输出、损坏输出、角色变化、协议偏移，应将该角色 `reuse_eligible=false`
- 不要把某个角色的 `session_id` 复制到另一个角色名下

## artifacts/

建议文件：

- `analysis-request-<n>.md`
- `analysis-<n>.md`
- `plan-request-<n>.md`
- `plan-<n>.md`
- `implementation-<n>.md`
- `review-request-<n>.md`
- `review-findings-<n>.md`
- `test-failure-<n>.md`
- `decision-<n>.md`
- `handoff-<n>.md`

这些文件用于跨 agent 共享长上下文，避免重复把全文塞回 prompt。
