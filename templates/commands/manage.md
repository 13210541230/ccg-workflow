---
description: '主Agent调度模式：简单任务 Claude 直做；复杂任务通过真正的 Agent Team 派发 codex-* teammate，teammate 内部再复用 ccg-codex MCP 持久会话'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与用户交互用中文；写给 Codex teammate / Codex session 的任务和状态字段优先用英语
- **简单任务直做**：低复杂度任务由 Claude 直接分析、改码、测试、审查
- **复杂任务走真正的 Agent Team**：复杂分析、规划、实施、审查必须先创建 Team，再派发给 `codex-* teammate` team-agent；禁止用普通 `Agent({ subagent_type })` 冒充 teammate
- **禁止主 Agent 直派发 Codex 任务**：Lead 不直接对复杂角色调用 `mcp__ccg-codex__codex_session_send`
- **两层连续性**：Lead 优先复用同一个 teammate team-agent；teammate 再优先复用同一个 Codex session
- **角色分离**：复杂任务默认存在 `analyzer-a`、`analyzer-b`、`planner-a`、`planner-b`、`executor`、`reviewer-a`、`reviewer-b`
- **禁止静默降级**：复杂任务一旦进入 teammate 路径，失败时只能重试、重建同角色 teammate、或升级给用户，不能偷偷改成 Claude 自己补完整复杂分析/规划/审查/实施
- **执行优先复用**：测试失败或审查回流到实施阶段时，优先 `resume` 原 `codex-executor` teammate
- **复杂路径必须有 Team 证据**：复杂任务的状态文件中必须记录 `Team Name`、`Team Lead Name`、`Teammate Name`；缺任一项都视为未正确进入 Agent Teams 路径

---

## 你的角色

你是 **Claude Lead**，职责是：
- 创建和维护 `.claude/plan/<task-name>/`
- 用 `mcp__sequential-thinking__sequentialthinking` 拆解任务
- 判断简单/复杂并选择执行路径
- 复杂任务中派发、复用、监督 `codex-* teammate` team-agent
- 汇总 teammate 产出，运行测试，做最终决策
- 持续更新状态文件与注册表

简单任务你可以直接修改源码。复杂任务里，你是编排者与审查者，不是复杂执行者。

---

## Codex Teammates

复杂任务默认使用以下 team-agent：

| 角色 | Team-Agent Type | 职责 |
|------|-----------------|------|
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

#### 0.7 复杂任务创建 Team 并初始化 teammate 槽位

仅复杂任务执行。先创建一个真正的 Agent Team：

```
TeamCreate({
  team_name: "<task-name>-codex-team"
})
```

将返回的 `team_name` 和 `team_lead_name` 写入 `progress.md` / 注册表。若 TeamCreate 不可用、失败或未返回 `team_name`，则将复杂路径标记为 `blocked`，停止继续；禁止回退成普通 agent。

再初始化以下逻辑槽位并写入 `progress.md` / 注册表：
- `analyzer-a`
- `analyzer-b`
- `planner-a`
- `planner-b`
- `executor`
- `reviewer-a`
- `reviewer-b`

此时先记录：
- `team_name`
- `team_lead_name`
- `teammate_name`
- `session_name`
- `teammate role`
- `team_agent_type`
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

**并行派发前置检查（Domain Isolation Check）**：
在派发两个并行 analyzer/planner 之前，必须确认以下条件：
- [ ] 两个 teammate 的任务范围是否存在文件重叠？（若重叠则串行化）
- [ ] 两个 teammate 是否操作相同的状态文件？（若是则串行化）
- [ ] 每个 agent prompt 是否包含：具体范围 + 明确目标 + 明确约束 + 期望输出格式？

若有文件/状态冲突 → 改为顺序派发，analyzer-a 先完成后再派发 analyzer-b。
若无冲突 → 并行派发，合并时检查冲突后再写入 `findings.md`。

并行派发两个 analyzer teammate。必须显式带上 `team_name` 和 teammate `name`：

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "analyzer-a",
  subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze the task from a logic and behavior perspective. Focus on feasibility, risks, dependencies, and edge cases. Return structured markdown.",
  description: "Codex teammate analyzer-a"
})
```

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "analyzer-b",
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

**并行派发前置检查（Domain Isolation Check）**：
在派发两个并行 analyzer/planner 之前，必须确认以下条件：
- [ ] 两个 teammate 的任务范围是否存在文件重叠？（若重叠则串行化）
- [ ] 两个 teammate 是否操作相同的状态文件？（若是则串行化）
- [ ] 每个 agent prompt 是否包含：具体范围 + 明确目标 + 明确约束 + 期望输出格式？

若有文件/状态冲突 → 改为顺序派发，analyzer-a 先完成后再派发 analyzer-b。
若无冲突 → 并行派发，合并时检查冲突后再写入 `findings.md`。

并行派发两个 planner teammate：

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "planner-a",
  subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Produce an implementation plan focused on execution order, data flow, failure handling, and verification checkpoints.",
  description: "Codex teammate planner-a"
})
```

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "planner-b",
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
  team_name: "<TEAM_NAME>",
  name: "executor",
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

**新鲜 executor 的 prompt 规范**（重建时使用）：
当需要重建新 executor 时，必须在 prompt 中提供完整上下文（不依赖 teammate 内部记忆）：
- 完整的 task 文本（不只是引用文件路径）
- 已完成部分的摘要（不要让新 executor 重新分析）
- 当前失败的具体原因
- 明确的"仅修复以下问题"范围约束

禁止让新 executor 重读整个 task_plan.md 再自行判断范围。

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
  team_name: "<TEAM_NAME>",
  name: "reviewer-a",
  subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-a-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review correctness, safety, performance, and error handling. Return findings grouped by severity.",
  description: "Codex teammate reviewer-a"
})
```

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "reviewer-b",
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
4. 清理 Team：

```
TeamDelete({
  team_name: "<TEAM_NAME>"
})
```

若 TeamDelete 失败，记录失败原因，但不要把未清理误记为“未创建 team”。
5. 向用户输出：
   - 变更摘要
   - 测试结果
   - 审查结果
   - 迭代次数
   - teammate 复用情况

---

## 阶段完成后处理协议

**强制节奏**：每完成 2 次工具调用，必须将关键发现持久化到状态文件，再继续下一步操作（2-action save rule）。禁止在内存中积累超过 2 步的未保存状态。

每个阶段完成后必须：
1. 将阶段产物写入 `artifacts/`
2. 将关键发现追加到 `findings.md`（**每 2 次工具调用至少追加一次**）
3. 更新 `progress.md`（状态字段 + 时间戳）
4. 更新 `Team Registry`、`Teammate Registry` 与 `Codex Session Registry`
5. 记录 `Team Name / Team Lead Name / Teammate Name / Agent ID / Session Name / Session ID / reuse_eligible`
6. 必要时向用户发送简短进度说明

**Read-Before-Decide 原则**：任何阶段的决策（如是否回流到 Phase 3、是否升级用户、是否重建 teammate）都必须先重新读取 `task_plan.md` 和最新 `progress.md`，再决策。禁止凭内存状态直接决策。

**会话恢复**：若会话中断后恢复，必须先读取 `progress.md` + `findings.md` 重建上下文，再决策下一步，不得重复已完成阶段的工作。

---

## Worker 卡死升级协议

当同一 teammate 在同一子任务上连续失败时，按以下等级升级：

| 失败次数 | 等级 | 强制动作 |
|----------|------|----------|
| 第 2 次 | L1 | 停止当前思路；收窄任务范围后 resume 同 teammate |
| 第 3 次 | L2 | 强制执行：重读失败输出全文 + 列出 3 个本质不同的修复假设；写入 `artifacts/worker-l2-<role>-<n>.md` |
| 第 4 次 | L3 | 完成 7 项检查清单（见下），结果写入 `artifacts/worker-l3-<role>-<n>.md`，再决定是否重建 teammate |
| 第 5 次+ | L4 | 停止自动重试；用 `AskUserQuestion` 展示结构化失败报告，选项：继续/换方案/回滚 |

**7 项检查清单（L3 强制）**：
- [ ] 读完了失败输出全文（不是摘要）
- [ ] 搜索过相关报错/符号
- [ ] 读过失败位置的相关源码上下文
- [ ] 验证了所有前置假设（路径/版本/依赖）
- [ ] 反转了主要假设（问题不在预期位置）
- [ ] 尝试了最小隔离复现
- [ ] 切换过本质不同的实现方向

**结构化失败报告格式（L4 时输出）**：
1. 已验证的事实
2. 已排除的可能性
3. 问题缩小后的范围
4. 推荐下一步方向
5. 交接信息（供用户或新 executor 使用）

---

## 异常处理

| 异常场景 | 决策 |
|----------|------|
| `ccg-codex` MCP 不可用 | 复杂任务直接阻塞，不能改成 Lead 直连 Codex |
| `TeamCreate` 不可用或失败 | 复杂任务直接阻塞，不能退回普通 agent |
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
3. **复杂任务必须先创建真正的 Agent Team**
4. **Lead 不直接派发复杂 Codex 任务**
5. **所有复杂 teammate 派发都必须带 `team_name + name`**
6. **按角色复用 teammate**：analyzer / planner / executor / reviewer 各自独立
7. **按角色复用 Codex session**：由 teammate 内部维护
8. **复杂执行优先复用 executor teammate**
9. **状态可追踪**：所有阶段与会话都要落盘到 `.claude/plan/<task-name>/`
