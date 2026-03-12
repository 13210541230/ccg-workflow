# Manage 状态文件格式规范

存放路径：`.claude/plan/<task-name>/`

## 目录结构

- `task_plan.md`
- `decisions.md`
- `progress.md`
- `findings.md`
- `inputs/`
- `artifacts/`
- `codex-sessions/`

`codex-sessions/` 用于保存 `ccg-codex` MCP 的底层会话状态与持久化输出。复杂任务中，Lead 先复用上层 teammate agent，再由 teammate 复用它绑定的 Codex session。

## 四个状态文件

| 文件 | 用途 | 更新频率 |
|------|------|----------|
| `task_plan.md` | 任务拆解、实施步骤、关键文件、回滚点 | 规划后写入，执行偏差时更新 |
| `decisions.md` | 复杂任务的关键决策与约束 | Phase 0.8 写入，后续只读或补充 |
| `progress.md` | 阶段状态、时间线、错误日志、teammate/session 状态 | 动态，每阶段更新 |
| `findings.md` | 分析、规划、实施、审查、测试的关键发现 | 动态追加 |

## progress.md 模板

```markdown
# Progress: <任务名>

## 状态: <initializing|discussing|analyzing|planning|confirmed|executing|testing|reviewing|complete|blocked>

## 复杂度: <简单|复杂>
<评估依据>

## 时间线
- [HH:MM] 初始化完成
- [HH:MM] 讨论阶段完成
- [HH:MM] 分析阶段完成
- [HH:MM] 规划阶段完成
- [HH:MM] 用户确认计划
- [HH:MM] 实施阶段完成
- [HH:MM] 测试阶段完成
- [HH:MM] 审查阶段完成

## 迭代状态
- ITERATION: <0|1|2|3>
- 收敛状态: <running|passed|blocked|stopped>

## 阶段产出

### 分析
<摘要>

### 规划
<摘要>

### 实施
<摘要>

### 测试
<摘要>

### 审查
<摘要>

## 错误日志

| 时间 | 阶段 | 角色/会话 | 错误描述 | 尝试次数 | 解决方式 |
|------|------|-----------|----------|----------|----------|

## 会话日志

| 时间 | 阶段 | 角色/会话 | 关键动作 | 结果 |
|------|------|-----------|----------|------|

## Teammate Registry

| 槽位 | Subagent Type | Agent ID | Bound Session Name | Bound Session ID | 状态 | 可复用 | Last Output | 备注 |
|------|---------------|----------|--------------------|------------------|------|--------|-------------|------|
| analyzer-a | `ccg:codex-analyzer` | <agent_id> | <task-analyzer-a> | <session_id> | <ready/active/failed/completed> | <yes/no> | <path> | <同角色重建原因> |
| analyzer-b | `ccg:codex-analyzer` | ... | ... | ... | ... | ... | ... | ... |
| planner-a | `ccg:codex-planner` | ... | ... | ... | ... | ... | ... | ... |
| planner-b | `ccg:codex-planner` | ... | ... | ... | ... | ... | ... | ... |
| executor | `ccg:codex-executor` | ... | ... | ... | ... | ... | ... | ... |
| reviewer-a | `ccg:codex-reviewer` | ... | ... | ... | ... | ... | ... | ... |
| reviewer-b | `ccg:codex-reviewer` | ... | ... | ... | ... | ... | ... | ... |

## Codex Session Registry

| 角色 | Session Name | Session ID | Backend | Sandbox | 状态 | 可复用 | Last Output | 备注 |
|------|--------------|------------|---------|---------|------|--------|-------------|------|
| analyzer-a | <task-analyzer-a> | <session_id> | codex | read-only | <ready/active/failed/closed> | <yes/no> | <path> | <可重建/禁止复用原因> |
| analyzer-b | ... | ... | codex | read-only | ... | ... | ... | ... |
| planner-a | ... | ... | codex | read-only | ... | ... | ... | ... |
| planner-b | ... | ... | codex | read-only | ... | ... | ... | ... |
| executor | ... | ... | codex | workspace-write | ... | ... | ... | ... |
| reviewer-a | ... | ... | codex | read-only | ... | ... | ... | ... |
| reviewer-b | ... | ... | codex | read-only | ... | ... | ... | ... |

## 消息日志

| 时间 | 阶段 | 方向 | 类型 | 摘要 | 结果 |
|------|------|------|------|------|------|
```

## findings.md 模板

```markdown
# Findings: <任务名>

## 分析发现
- [来源: analyzer-a] <发现内容>
- [来源: analyzer-b] <发现内容>

## 规划产出
- [来源: planner-a] <计划要点>
- [来源: planner-b] <计划要点>

## 实施产出
- [来源: executor] <变更摘要>

## 测试结果
- [来源: local test run] <结果>

## 审查结果
- [来源: reviewer-a] <按严重级别分组>
- [来源: reviewer-b] <按严重级别分组>
```

## decisions.md 模板

```markdown
# Decisions: <任务名>

## 复杂度评估
- 子任务数：N
- 涉及文件数：N
- 架构变更：是/否
- 方案权衡：N
- 风险等级：低/中/高
- **结论**：简单/复杂

## 已确认决策

### 决策 1: <决策点名称>
- **问题**: <需要决策的问题>
- **选项**: A) ... / B) ... / C) ...
- **用户选择**: <选项>
- **原因**: <理由>

## 决策摘要
<供后续阶段引用的简洁约束描述>
```

## inputs/ 文件清单

| 文件 | 用途 | 写入时机 |
|------|------|----------|
| `task.md` | 增强后的任务描述、后续追加修复要求 | Phase 0，测试/审查回流时追加 |
| `context.md` | 项目上下文摘要 | Phase 0 |
| `decisions.md` | 锁定约束 | Phase 0.8 |
| `findings.md` | 分析结论 | Phase 1 后 |
| `plan.md` | 最终计划 | Phase 2 后 |

## artifacts/ 建议文件

- `analysis-request.md`
- `analysis-a.md`
- `analysis-b.md`
- `plan-request.md`
- `plan-a.md`
- `plan-b.md`
- `implementation-request.md`
- `implementation-result-<n>.md`
- `test-result-<n>.md`
- `test-failure-<n>.md`
- `diff-<n>.txt`
- `review-request-<n>.md`
- `review-a-<n>.md`
- `review-b-<n>.md`
- `review-failure-<n>.md`

## 复用规则

- 复杂任务开始后，先在 `Teammate Registry` 中预登记各角色 `Subagent Type / Bound Session Name / Sandbox`
- teammate 首次成功 spawn 后，立即回填 `Agent ID / 状态 / 可复用`
- teammate 首次通过 `codex_session_send` 成功后，再回填 `Codex Session Registry` 的 `Session ID / 状态 / Last Output`
- 测试失败或审查回流到 Phase 3 时，默认先检查 `executor` teammate，其次检查其绑定 session
- 只有当 `executor` teammate 与其绑定 session 都可复用时，才继续向同一执行线程发送修复请求
- 若某角色出现空输出、角色混用、输出损坏，应同时将该 teammate 和绑定 session 标记为 `可复用=no`
