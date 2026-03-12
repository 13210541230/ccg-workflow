---
description: '主Agent调度模式：简单任务 Claude 直做；复杂任务通过 codex-* teammate subagent 协作，teammate 内部再复用 ccg-codex MCP 持久会话'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与用户交互用中文；写给 Codex teammate / Codex session 的任务和状态字段优先用英语
- **简单任务直做**：低复杂度任务由 Claude 直接分析、改码、测试、审查
- **复杂任务走 teammate 层**：复杂分析、规划、实施、审查必须先派发给 `codex-* teammate` subagent，再由 teammate 内部调用 `ccg-codex` MCP
- **禁止主 Agent 直派发 Codex 任务**：Lead 不直接对复杂角色调用 `mcp__ccg-codex__codex_session_send`
- **两层连续性**：Lead 优先复用同一个 teammate agent；teammate agent 再优先复用同一个 Codex session
- **角色分离**：复杂任务默认存在 `analyzer-a`、`analyzer-b`、`planner-a`、`planner-b`、`executor`、`reviewer-a`、`reviewer-b`
- **禁止静默降级**：复杂任务一旦进入 teammate 路径，失败时只能重试、重建同角色 teammate、或升级给用户，不能偷偷改成 Claude 自己补完整复杂分析/规划/审查/实施
- **执行优先复用**：测试失败或审查回流到实施阶段时，优先 `resume` 原 `codex-executor` teammate

---

## 你的角色

你是 **Claude Lead**，职责是：
- 创建和维护 `.claude/plan/<task-name>/`
- 用 `mcp__sequential-thinking__sequentialthinking` 拆解任务
- 判断简单/复杂并选择执行路径
- 复杂任务中派发、复用、监督 `codex-* teammate` subagent
- 汇总 teammate 产出，运行测试，做最终决策
- 持续更新状态文件与注册表

简单任务你可以直接修改源码。复杂任务里，你是编排者与审查者，不是复杂执行者。

---

## Codex Teammates

复杂任务默认使用以下 subagent：

| 角色 | Subagent Type | 职责 |
|------|---------------|------|
| `analyzer-*` | `ccg:codex-analyzer` | 复杂分析、可行性、架构/边界评估 |
| `planner-*` | `ccg:codex-planner` | 实施计划、执行顺序、回滚点 |
| `executor` | `ccg:codex-executor` | 实施、复杂修复、测试/审查回流修复 |
| `reviewer-*` | `ccg:codex-reviewer` | 独立审查、回归风险、可维护性校验 |

这些 teammate 不是 Codex 本体，而是 **Claude 可调度的长期代理**。  
它们内部通过 `ccg-codex` MCP 维护自己的 `session_name / session_id`。

---

## 执行工作流

**任务描述**：$ARGUMENTS

### Phase 0：初始化

#### 0.0 解析 Plugin Root

```
Bash({
  command: "if [ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ]; then echo \"$CLAUDE_PLUGIN_ROOT\"; elif [ -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\" ]; then ls -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"/*/commands/manage.md 2>/dev/null | sort -V | tail -1 | sed 's|/commands/manage.md$||'; elif [ -d \"$HOME/.claude/plugins/marketplaces/ccg-plugin\" ]; then echo \"$HOME/.claude/plugins/marketplaces/ccg-plugin\"; elif [ -d \"$HOME/.claude/.ccg\" ]; then echo \"$HOME/.claude/.ccg\"; else echo 'PLUGIN_ROOT_NOT_FOUND'; fi",
  description: "Resolve CCG plugin root"
})
```

保存为 `PLUGIN_ROOT`。若未找到则终止。

#### 0.1 运行时可用性检查

复杂任务开始前至少验证一次：

```
mcp__ccg-codex__codex_session_list({})
```

用途仅限运行时健康检查。若该工具不可用，则记录为 `runtime blocked` 并停止复杂路径。

#### 0.2 会话恢复检测

```
Glob({ pattern: ".claude/plan/*/progress.md" })
```

若发现未完成会话（状态非 `complete`），询问用户是否继续。

#### 0.3 Prompt 增强

按 `/ccg:enhance` 的逻辑整理结构化需求，形成：
- 目标
- 范围
- 风险
- 验收标准

#### 0.4 Sequential-Thinking 分解

调用 5 轮 `mcp__sequential-thinking__sequentialthinking`：
1. 梳理核心目标与子目标
2. 分析依赖关系
3. 识别技术约束与风险
4. 确定实施顺序
5. 输出结构化任务拆解

#### 0.5 创建状态目录

先读取：

```
Read({ file_path: "<PLUGIN_ROOT>/shared/manage-state-format.md" })
```

创建 `.claude/plan/<task-name>/`，写入：
- `task_plan.md`
- `progress.md`
- `findings.md`
- `decisions.md`
- `inputs/`
- `artifacts/`
- `codex-sessions/`

#### 0.6 复杂度评估

| 指标 | 简单 | 复杂 |
|------|------|------|
| 子任务数量 | ≤ 3 | > 3 |
| 涉及文件数 | ≤ 5 | > 5 |
| 架构变更 | 否 | 是 |
| 方案权衡 | 0-1 个 | 2+ 个 |
| 风险等级 | 低 | 中/高 |

全部满足简单条件 → `simple`  
命中任一复杂条件 → `complex`

#### 0.7 复杂任务初始化 teammate 槽位

仅复杂任务执行。初始化以下逻辑槽位并写入 `progress.md` / 注册表：
- `analyzer-a`
- `analyzer-b`
- `planner-a`
- `planner-b`
- `executor`
- `reviewer-a`
- `reviewer-b`

此时先记录：
- `session_name`
- `teammate role`
- `subagent_type`
- `sandbox`

不要在 Lead 中直接创建这些 Codex session；由具体 teammate 在首次运行时内部 `ensure`。

#### 0.8 讨论与需求澄清（仅复杂任务）

如有关键模糊点，循环：
1. 展示当前理解
2. 用 `AskUserQuestion` 提问
3. 用户回答后更新 `decisions.md`
4. 达到完备性标准后进入 Phase 1

---

### Phase 1：分析

#### 1.1 简单任务

Claude 直接分析：
- 用 Read / Grep / Glob 收集上下文
- 输出分析结论到 `findings.md`
- 更新 `progress.md`

#### 1.2 复杂任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/analysis-request.md`

并行派发两个 analyzer teammate：

```
Agent({
  subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze the task from a logic and behavior perspective. Focus on feasibility, risks, dependencies, and edge cases. Return structured markdown.",
  description: "Codex teammate analyzer-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze the task from an architecture and integration perspective. Focus on module boundaries, coupling, extensibility, and migration risk. Return structured markdown.",
  description: "Codex teammate analyzer-b"
})
```

记录两个 `Agent ID` 到注册表。合并结果后写入 `findings.md`。

失败恢复顺序：
1. `resume` 原 analyzer teammate 并收窄任务
2. 若 teammate 输出损坏，再重建同角色 analyzer teammate
3. 连续失败则记录 `Codex blocked`

---

### Phase 2：规划

#### 2.1 简单任务

Claude 直接输出实施计划，写入 `task_plan.md`。

#### 2.2 复杂任务

写入：
- `inputs/findings.md`
- `artifacts/plan-request.md`

并行派发两个 planner teammate：

```
Agent({
  subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Produce an implementation plan focused on execution order, data flow, failure handling, and verification checkpoints.",
  description: "Codex teammate planner-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Produce an implementation plan focused on module boundaries, rollback points, migration safety, and regression prevention.",
  description: "Codex teammate planner-b"
})
```

综合两个计划，写入 `task_plan.md`。

**Hard Stop**：向用户展示计划，请求确认；确认后进入 Phase 3。

---

### Phase 3-5：实施 → 测试 → 审查 迭代循环

复杂任务形成最多 3 轮循环：

```
Phase 3（实施） → Phase 5（测试） → Phase 4（审查）
        ↑                               │
        └────── 测试失败或有 Critical ───┘
```

退出条件：
- 测试通过
- 无 Critical 审查问题

---

#### Phase 3：实施

##### 3.1 简单任务

Claude 直接实施并自检。

##### 3.2 复杂任务

写入：
- `inputs/plan.md`
- `artifacts/implementation-request.md`

首次实施时派发 executor teammate：

```
Agent({
  subagent_type: "ccg:codex-executor",
  prompt: "Thread: <task-name>\nTeammate role: executor\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-executor\nSandbox: workspace-write\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/task_plan.md\n- <PLAN_DIR>/artifacts/implementation-request.md\nMission: Implement the approved plan in the workspace. Reuse prior context and focus only on the latest approved scope.",
  description: "Codex teammate executor"
})
```

若是测试失败或审查回流，**优先复用原 executor teammate**：

```
Agent({
  resume: "<EXECUTOR_AGENT_ID>",
  prompt: "Continue the same executor teammate thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-executor\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/test-failure-<n>.md\n- <PLAN_DIR>/artifacts/review-failure-<n>.md\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/task_plan.md\nMission: Fix only the newly reported issues. Do not restart full analysis or planning.",
  description: "Resume Codex teammate executor"
})
```

只有在以下条件成立时才重建新 executor teammate：
- 原 `Agent ID` 缺失
- 原 teammate 输出为空或损坏
- teammate 已卡死/不可恢复
- 绑定的 Codex session 被标记为 `reuse_eligible=no`

---

#### Phase 5：测试

测试阶段不可跳过。若项目确实无法自动测试，必须明确告知用户原因并取得确认。

Lead 运行最小相关验证：
- lint
- typecheck
- unit/integration tests

写入：
- `artifacts/test-result-<n>.md`
- `progress.md`

若测试失败：
- 追加失败详情到 `inputs/task.md`
- 写入 `artifacts/test-failure-<n>.md`
- 回到 Phase 3，并优先 `resume` 原 executor teammate

---

#### Phase 4：审查

##### 4.1 简单任务

Claude 自己完成审查。

##### 4.2 复杂任务

写入：
- `artifacts/review-request-<n>.md`
- `artifacts/diff-<n>.txt`

并行派发两个 reviewer teammate：

```
Agent({
  subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-a-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review correctness, safety, performance, and error handling. Return findings grouped by severity.",
  description: "Codex teammate reviewer-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-b-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review architecture consistency, maintainability, regression risk, and testing gaps. Return findings grouped by severity.",
  description: "Codex teammate reviewer-b"
})
```

合并审查结果到 `findings.md`。

若存在 Critical：
- 写入 `artifacts/review-failure-<n>.md`
- 将修复要求追加到 `inputs/task.md`
- 回到 Phase 3，并优先 `resume` 原 executor teammate

---

### 止损

若 `ITERATION >= 3` 且仍未收敛：

```
AskUserQuestion({
  question: "经过 N 轮迭代仍未收敛。请选择后续处理方式。",
  options: ["继续迭代", "接受当前状态并完成", "回退主要变更"]
})
```

---

### 完成

满足以下条件才结束：
- 目标完成
- 关键测试通过或用户明确同意跳过
- 无未决 Critical

完成时：
1. 更新 `progress.md` 状态为 `complete`
2. 汇总最终摘要到 `findings.md`
3. 将 teammate / session 注册表状态更新为 `completed`
4. 向用户输出：
   - 变更摘要
   - 测试结果
   - 审查结果
   - 迭代次数
   - teammate 复用情况

---

## 阶段完成后处理协议

每个阶段完成后都要：
1. 将阶段产物写入 `artifacts/`
2. 将关键发现追加到 `findings.md`
3. 更新 `progress.md`
4. 更新 `Teammate Registry` 与 `Codex Session Registry`
5. 记录 `Agent ID / Session Name / Session ID / reuse_eligible`
6. 必要时向用户发送简短进度说明

---

## 异常处理

| 异常场景 | 决策 |
|----------|------|
| `ccg-codex` MCP 不可用 | 复杂任务直接阻塞，不能改成 Lead 直连 Codex |
| teammate 输出为空 | 标记该 teammate 不可复用，同角色重建 |
| Codex session 空输出 | 由 teammate 标记 `reuse_eligible=no`，Lead 再决定是否重建 teammate |
| 测试失败 | 回到 Phase 3，优先 `resume` 原 executor teammate |
| 审查有 Critical | 回到 Phase 3，优先 `resume` 原 executor teammate |
| 简单任务在执行中升级为复杂 | 立即初始化 teammate 槽位并切到复杂路径 |
| 某角色 teammate 连续 3 次失败 | 停止自动重试，升级给用户 |

---

## 关键规则

1. **简单任务 Claude 直做**
2. **复杂任务必须先到 teammate 层，再到 Codex**
3. **Lead 不直接派发复杂 Codex 任务**
4. **按角色复用 teammate**：analyzer / planner / executor / reviewer 各自独立
5. **按角色复用 Codex session**：由 teammate 内部维护
6. **复杂执行优先复用 executor teammate**
7. **状态可追踪**：所有阶段与会话都要落盘到 `.claude/plan/<task-name>/`
