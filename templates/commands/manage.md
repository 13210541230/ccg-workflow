---
description: '主Agent调度模式：主Agent只编排不改源码；简单任务派发单 worker agent，复杂任务默认通过 codex-* subagent 与 Codex 持续协作'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## Bootstrap

`/ccg:manage` 现在是轻量编排入口，长期流程纪律已外置到共享协议文件：

- `shared/manage-runtime-protocol.md`
- `shared/manage-phase-gates.md`
- `shared/manage-state-format.md`

进入或恢复任意 manage 会话后，先读取任务目录中的本地副本：

1. `runtime-protocol.md`
2. `phase-gate.md`
3. `progress.md`
4. `findings.md`
5. `task_plan.md`（若已存在，或任何路由决策前）

这些文件比内存和 hook 提醒更权威。hook 只负责提醒，不能替代重读协议。

## Lead Role

你是 **Claude Lead**，负责：

- 创建和维护 `.claude/plan/<task-name>/`
- 用 `mcp__sequential-thinking__sequentialthinking` 拆解任务
- 判断简单/复杂并选择执行路径
- 派发、复用、监督 worker
- 汇总产出、运行验证、做阶段裁决
- 同步 `progress.md`、`findings.md`、注册表和 `phase-gate.md`

Lead 永远是编排者，不是直接源码修改者。

## Runtime Overview

- 简单任务：使用单个 `simple-executor` (`general-purpose`)
- 复杂任务：使用 `ccg:codex-analyzer` / `planner` / `executor` / `reviewer`
- 默认复杂运行时：`subagent`
- `TeamCreate` 仅在用户明确要求或明确验证团队注入可用时启用
- 复杂 worker 产出必须包含 `runtime_mode / session_id / reuse_eligible / output_file`
- Team 模式额外要求 `team_name / teammate_name`

任何阶段切换只有在 `progress.md` 与 `phase-gate.md` 同步更新后才算完成。

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
若继续，**先读取本地** `runtime-protocol.md`、`phase-gate.md`、`progress.md`、`findings.md`，再决定下一步。若 `phase-gate.md` 缺失或与 `progress.md` 状态不一致，先修复 `phase-gate.md`。

#### 0.3 Prompt 增强 + 设计探索

增强原始 prompt 后，执行设计探索门控：

1. 列出 2-3 个可行方案
2. 为每个方案创建权衡表（复杂度 / 风险 / 可维护性）
3. 应用 YAGNI：删除非当前目标必须的方案特性
4. 选择推荐方案并记录理由
5. **Hard gate**：推荐方案未明确前，禁止进入 Phase 0.4

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
Read({ file_path: "<PLUGIN_ROOT>/shared/manage-runtime-protocol.md" })
Read({ file_path: "<PLUGIN_ROOT>/shared/manage-phase-gates.md" })
```

创建 `.claude/plan/<task-name>/`，写入：
- `runtime-protocol.md`
- `phase-gate.md`
- `task_plan.md`
- `progress.md`
- `findings.md`
- `decisions.md`
  - decisions.md must include a "待解答问题" (Open Questions) table at the top: `| # | 问题 | 状态 | 答案 |`
- `inputs/`
- `artifacts/`
- `codex-sessions/`

初始化要求：
- `runtime-protocol.md` 从共享模板原样复制
- `phase-gate.md` 初始化为 `Current Phase: initializing`
- 每次 `progress.md` 的 `## 状态` 变更时，同批更新 `phase-gate.md`

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

#### 0.6.1 简单任务初始化 worker 槽位

仅简单任务执行。预登记：
- `simple-executor`

写入 `progress.md`：
- `agent_type: general-purpose`
- `agent_name: simple-executor`
- `sandbox: workspace-write`
- `status: ready`

#### 0.7 复杂任务初始化 Codex worker 槽位

仅复杂任务执行。先初始化以下逻辑槽位并写入 `progress.md` / 注册表：
- `analyzer-a`
- `analyzer-b`
- `planner-a`
- `planner-b`
- `executor`
- `reviewer-a`
- `reviewer-b`

此时先记录：
- `runtime_mode: subagent`
- `session_name`
- `worker_role`
- `worker_type`
- `sandbox`

不要在 Lead 中直接创建这些 Codex session；由具体 worker 在首次运行时内部 `ensure`。

#### 0.7.1 可选 Team 模式

只有满足以下条件时，才允许把某个复杂角色切到 Team 模式：
- 用户显式要求使用 Agent Teams
- 或当前任务确实需要多个并行 worker 共享一个 Team 生命周期
- 并且你已经确认当前运行时能为该 team-agent 正确注入 `ccg:codex-*` 角色定义

若启用 Team 模式：

```
TeamCreate({
  team_name: "<task-name>-codex-team"
})
```

并在注册表中额外记录：
- `runtime_mode: team`
- `team_name`
- `team_lead_name`
- `teammate_name`

若 TeamCreate 不可用或未返回 `team_name`，只阻塞 Team 模式；默认 subagent 路径仍可继续。

#### 0.8 讨论与需求澄清

问题纪律：
- **每次只问一个问题**（不得一次性列出多个问题）
- **优先选择题**：提供 2-3 个选项而非开放问题
- 清晰循环：用户回答后，重新陈述理解，确认再继续

---

### Phase 1：分析

#### 1.1 简单任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/simple-request.md`

派发单 worker agent：

```
Agent({
  subagent_type: "general-purpose",
  prompt: "Role: simple-executor\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nOutput file: <PLAN_DIR>/artifacts/simple-worker-result-1.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/simple-request.md\nMission: Analyze the task, produce a minimal execution plan, implement the approved scope in the workspace, run minimal relevant checks, and write a structured markdown report. If you find the scope is no longer simple, stop before broad edits and report `upgrade_to_complex` with reasons.",
  description: "Simple worker agent"
})
```

记录 `Agent ID` 到 `progress.md`。Lead 读取其产物，若 worker 明确报告 `upgrade_to_complex`，则切到复杂路径。

#### 1.2 复杂任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/analysis-request.md`

**并行派发前置检查（Domain Isolation Check）**：
在派发两个并行 analyzer/planner 之前，必须确认以下条件：
- [ ] 两个 worker 的任务范围是否存在文件重叠？（若重叠则串行化）
- [ ] 两个 worker 是否操作相同的状态文件？（若是则串行化）
- [ ] 每个 agent prompt 是否包含：具体范围 + 明确目标 + 明确约束 + 期望输出格式？

若有文件/状态冲突 → 改为顺序派发，analyzer-a 先完成后再派发 analyzer-b。
若无冲突 → 并行派发，合并时检查冲突后再写入 `findings.md`。

并行派发两个 analyzer worker。默认使用 subagent：

```
Agent({
  subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze the task from a logic and behavior perspective. Focus on feasibility, risks, dependencies, and edge cases. Return structured markdown.",
  description: "Codex worker analyzer-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-analyzer",
  prompt: "Thread: <task-name>\nTeammate role: analyzer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-analyzer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/analysis-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/context.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/artifacts/analysis-request.md\nMission: Analyze the task from an architecture and integration perspective. Focus on module boundaries, coupling, extensibility, and migration risk. Return structured markdown.",
  description: "Codex worker analyzer-b"
})
```

若当前任务显式启用 Team 模式，则改为：

```
Agent({
  team_name: "<TEAM_NAME>",
  name: "analyzer-a",
  subagent_type: "ccg:codex-analyzer",
  prompt: "...同上..."
})
```

记录两个 `Agent ID` 到注册表。合并结果后写入 `findings.md`。

在接受 `analysis-a.md / analysis-b.md` 前，Lead 必须先校验两个 analyzer 的返回摘要里都包含 `runtime_mode / session_id / reuse_eligible / output_file`。任一缺失都视为该 analyzer 未正确调用 Codex。

失败恢复顺序：
1. `resume` 原 analyzer worker 并收窄任务
2. 若 worker 输出损坏，再重建同角色 analyzer worker
3. 若出现 `codex bypass`，优先要求同角色重试一次并明确补齐 Codex 证据
4. 连续失败则记录 `Codex blocked`

---

### Phase 2：规划

#### 2.1 简单任务

Lead 从 `simple-worker-result-1.md` 中提取最小实施计划，写入 `task_plan.md`。若计划显示任务超出简单范围，立即升级为复杂路径。

**强制计划格式**：
```
Task N: [动作] [精确文件路径]
  - 步骤: [2-5 分钟内可完成的最小步骤]
  - 验收: [可验证的完成标准]
```
粒度规则：每个步骤必须在 2-5 分钟内可完成；超过则拆分。

#### 2.2 复杂任务

写入：
- `inputs/findings.md`
- `artifacts/plan-request.md`

**并行派发前置检查（Domain Isolation Check）**：
在派发两个并行 analyzer/planner 之前，必须确认以下条件：
- [ ] 两个 worker 的任务范围是否存在文件重叠？（若重叠则串行化）
- [ ] 两个 worker 是否操作相同的状态文件？（若是则串行化）
- [ ] 每个 agent prompt 是否包含：具体范围 + 明确目标 + 明确约束 + 期望输出格式？

若有文件/状态冲突 → 改为顺序派发，analyzer-a 先完成后再派发 analyzer-b。
若无冲突 → 并行派发，合并时检查冲突后再写入 `findings.md`。

并行派发两个 planner worker：

```
Agent({
  subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-a.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Produce an implementation plan focused on execution order, data flow, failure handling, and verification checkpoints.",
  description: "Codex worker planner-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-planner",
  prompt: "Thread: <task-name>\nTeammate role: planner-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-planner-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/plan-b.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/findings.md\n- <PLAN_DIR>/artifacts/plan-request.md\nMission: Produce an implementation plan focused on module boundaries, rollback points, migration safety, and regression prevention.",
  description: "Codex worker planner-b"
})
```

综合两个计划，写入 `task_plan.md`。

在接受 `plan-a.md / plan-b.md` 前，Lead 必须先校验两个 planner 的返回摘要里都包含 `runtime_mode / session_id / reuse_eligible / output_file`。任一缺失都视为该 planner 未正确调用 Codex。

**强制计划格式**（零上下文规则）：
- 精确文件路径 + 完整代码片段 + 可执行命令
- TDD 优先：Step 1: 编写失败测试 → Step 2: 实现 → Step 3: 验证 → Step 4: 提交
- 粒度规则：每步 2-5 分钟；超过则拆分
- 零上下文规则：任何 worker 无需上下文即可执行每一步

**Hard Stop**：向用户展示计划，请求确认；确认后进入 Phase 3。
在展示计划前，把 `phase-gate.md` 设置为 `Current Phase: planning`、`Hard Stop: yes`。用户明确确认后，再同步更新 `progress.md` 为 `confirmed`，并把 `phase-gate.md` 切到 `Current Phase: confirmed`。

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

**迭代循环调试纪律**：
- 禁止在未分析失败模式的情况下立即重试
- 每次失败后：记录失败模式 → 分析根因 → 形成单一假设
- 单一变量原则：每次修复只改变一个变量
- 单一假设：每轮循环只验证一个假设

---

#### Phase 3：实施

##### 执行前审查门控

关键计划审查（每次执行前必须通过）：
1. Glob 验证：计划引用的所有文件路径均已存在
2. 歧义检查：任务描述无歧义（否则停止澄清）
3. 依赖检查：所有依赖库/工具已安装
4. **批次控制**：任务数 ≥5 时，按每批 3 个任务执行，每批后确认再继续

##### 3.1 简单任务

优先 `resume` 同一个 `simple-executor`：

```
Agent({
  resume: "<SIMPLE_EXECUTOR_AGENT_ID>",
  prompt: "Continue the same simple-executor thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nOutput file: <PLAN_DIR>/artifacts/simple-worker-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/task_plan.md\n- <PLAN_DIR>/inputs/task.md\nMission: Finish the approved simple-task implementation, keep the change minimal, and update the result file with what changed and what was verified.",
  description: "Resume simple worker agent"
})
```

只有在原 simple worker 不可恢复或输出损坏时才新建新的 `general-purpose` worker。

##### 3.2 复杂任务

写入：
- `inputs/plan.md`
- `artifacts/implementation-request.md`

首次实施时派发 executor worker：

```
Agent({
  subagent_type: "ccg:codex-executor",
  prompt: "Thread: <task-name>\nTeammate role: executor\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-executor\nSandbox: workspace-write\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/inputs/decisions.md\n- <PLAN_DIR>/task_plan.md\n- <PLAN_DIR>/artifacts/implementation-request.md\nMission: Implement the approved plan in the workspace. Reuse prior context and focus only on the latest approved scope. 执行协议：每批 3 个步骤（batches of 3）；遇到阻塞立即停止（STOP immediately on any blocker）；阻塞时输出：`{ \"blocked\": true, \"reason\": \"...\", \"needs\": \"...\" }`",
  description: "Codex worker executor"
})
```

若是测试失败或审查回流，**优先复用原 executor worker**：

```
Agent({
  resume: "<EXECUTOR_AGENT_ID>",
  prompt: "Continue the same executor worker thread.\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-executor\nOutput file: <PLAN_DIR>/artifacts/implementation-result-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/test-failure-<n>.md\n- <PLAN_DIR>/artifacts/review-failure-<n>.md\n- <PLAN_DIR>/inputs/task.md\n- <PLAN_DIR>/task_plan.md\nMission: Fix only the newly reported issues. Do not restart full analysis or planning.",
  description: "Resume Codex worker executor"
})
```

只有在以下条件成立时才重建新 executor worker：
- 原 `Agent ID` 缺失
- 原 worker 输出为空或损坏
- worker 已卡死/不可恢复
- 绑定的 Codex session 被标记为 `reuse_eligible=no`

在接受 `implementation-result-<n>.md` 前，Lead 必须先校验 executor 的返回摘要里包含 `runtime_mode / session_id / reuse_eligible / output_file`。若缺失，视为 `codex bypass`，本轮实施无效，不得继续进入测试。

**新鲜 executor 的 prompt 规范**（重建时使用）：
当需要重建新 executor 时，必须在 prompt 中提供完整上下文（不依赖 worker 内部记忆）：
- 完整的 task 文本（不只是引用文件路径）
- 已完成部分的摘要（不要让新 executor 重新分析）
- 当前失败的具体原因
- 明确的"仅修复以下问题"范围约束

禁止让新 executor 重读整个 task_plan.md 再自行判断范围。

---

#### Phase 5：测试

**5 步门控**（必须全部通过才能声称完成）：
1. 运行完整测试套件（不仅是相关测试）
2. 确认原始问题已解决
3. 确认无回归（所有之前通过的测试仍然通过）
4. 记录证据（命令输出截图或日志）
5. 更新 progress.md

**证据表**：

| 声称 | 必需证据 | 不充分证据 |
|------|----------|------------|
| 测试通过 | 完整测试命令输出 | "测试应该通过" |
| 功能正常 | 实际运行截图/日志 | 代码看起来正确 |
| 无回归 | 全套测试通过输出 | 部分测试通过 |

失败恢复：若测试失败，回流到 Phase 3 执行修复，不超过 3 次循环。

---

#### Phase 4：审查

##### 4.1 简单任务

Lead 基于 worker 产出和本地验证结果完成裁决，但不自己改代码。若发现需要修复，回到 Phase 3 并优先 `resume` 原 `simple-executor`。

##### 4.2 复杂任务

写入：
- `artifacts/review-request-<n>.md`
- `artifacts/diff-<n>.txt`

并行派发两个 reviewer worker：

```
Agent({
  subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-a\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-a\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-a-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review correctness, safety, performance, and error handling. Return findings grouped by severity.",
  description: "Codex worker reviewer-a"
})
```

```
Agent({
  subagent_type: "ccg:codex-reviewer",
  prompt: "Thread: <task-name>\nTeammate role: reviewer-b\nPlan dir: <PLAN_DIR>\nWorkdir: <WORKDIR>\nState dir: <PLAN_DIR>/codex-sessions\nSession name: <task-name>-reviewer-b\nSandbox: read-only\nOutput file: <PLAN_DIR>/artifacts/review-b-<n>.md\nArtifacts:\n- <PLAN_DIR>/artifacts/diff-<n>.txt\n- <PLAN_DIR>/artifacts/review-request-<n>.md\n- <PLAN_DIR>/task_plan.md\nMission: Review architecture consistency, maintainability, regression risk, and testing gaps. Return findings grouped by severity.",
  description: "Codex worker reviewer-b"
})
```

合并审查结果到 `findings.md`。

在接受 `review-a-<n>.md / review-b-<n>.md` 前，Lead 必须先校验两个 reviewer 的返回摘要里都包含 `runtime_mode / session_id / reuse_eligible / output_file`。任一缺失都视为该 reviewer 未正确调用 Codex。

若存在 Critical：
- 写入 `artifacts/review-failure-<n>.md`
- 将修复要求追加到 `inputs/task.md`
- 回到 Phase 3，并优先 `resume` 原 executor worker

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
3. 将 worker / session 注册表状态更新为 `completed`
4. 若本任务显式使用过 Team 模式，再清理 Team：

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
   - worker 复用情况

---

## External Protocols

以下内容不再在本文件展开冗长副本，统一以任务目录中的本地协议为准：

- 长期铁律、恢复顺序、验证先于完成、升级梯度：`runtime-protocol.md`
- 当前阶段允许动作、禁止动作、Hard Stop、返回后必做事项：`phase-gate.md`
- 状态文件结构与注册表字段：`shared/manage-state-format.md`

若发生上下文压缩或自动摘要，不要尝试凭记忆复述本文件；直接重读本地协议文件并继续。
