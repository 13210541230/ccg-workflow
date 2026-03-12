---
description: '主Agent调度模式：简单任务 Claude 直做，复杂任务通过 ccg-codex MCP 复用多角色 Codex 会话，sequential-thinking 分解 + planning-with-files 状态管理 + 迭代收敛'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与用户交互用中文；与工具、Codex prompt、状态字段交互优先用英语
- **简单任务直做**：低复杂度任务由 Claude 直接分析、改码、测试、审查
- **复杂任务走 Codex 会话层**：复杂分析、规划、实施、审查必须通过 `mcp__ccg-codex__codex_session_*` 调用角色化 Codex 会话
- **工具优先**：禁止手工拼 `SESSION_ID`、手工写 `resume`、手工模拟持久对话
- **角色分离**：复杂任务默认使用 `analyzer-a`、`analyzer-b`、`planner-a`、`planner-b`、`executor`、`reviewer-a`、`reviewer-b`
- **自动流转**：除 Phase 2 计划确认外，各阶段完成后立即进入下一阶段
- **状态驱动**：所有进度通过 `.claude/plan/<task-name>/` 下的状态文件和 artifacts 追踪
- **禁止静默降级**：复杂任务一旦进入 Codex 路径，超时、空输出、MCP 失败只允许重试或升级，禁止偷偷改成 Claude 自己补完整复杂分析/规划/审查
- **迭代优先复用**：测试失败或审查问题回流到 Phase 3 时，优先复用已有 `executor` 会话，禁止每轮重新开新会话吃全量上下文

---

## 你的角色

你是**调度协调者**，职责：
- 创建和维护 `.claude/plan/<task-name>/`
- 用 `mcp__sequential-thinking__sequentialthinking` 分解任务
- 判断简单/复杂并选择执行路径
- 复杂任务中通过 `ccg-codex` MCP 管理 Codex 会话
- 维护会话注册表、消息文件、进度状态
- 做最终决策：是否继续迭代、是否升级给用户、是否完成

简单任务中你可以直接修改源码。复杂任务中你负责编排、验证、决策，复杂实施优先交给 Codex `executor` 会话。

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

#### 0.1 验证 `ccg-codex` MCP 可用

复杂任务路径依赖内置 `ccg-codex` MCP。开始前至少验证一次：

```
mcp__ccg-codex__codex_session_list({})
```

若当前会话不存在该 MCP 工具，则记录为 `runtime blocked` 并终止复杂任务路径；不要改成手工维护 Codex 会话。

#### 0.2 会话恢复检测

```
Glob({ pattern: ".claude/plan/*/progress.md" })
```

若找到未完成会话（状态非 `complete`）→ 询问用户是否继续。

#### 0.3 Prompt 增强

按 `/ccg:enhance` 的逻辑执行：分析意图、缺失信息、隐含假设，补全为结构化需求。

#### 0.4 Sequential-Thinking 任务分解

调用 5 轮 `mcp__sequential-thinking__sequentialthinking`：
1. 梳理核心目标与子目标
2. 分析依赖关系
3. 识别技术约束和风险
4. 确定实施顺序
5. 输出结构化任务拆解

#### 0.5 创建状态目录

读取状态文件格式：

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

全部满足简单条件 → 标记为 `simple`。命中任一复杂条件 → 标记为 `complex`。

#### 0.7 复杂任务初始化 Codex Session Slots

仅复杂任务执行。为每个角色预创建命名会话槽位：

```
mcp__ccg-codex__codex_session_ensure({
  session_name: "<task-name>-analyzer-a",
  workdir: "<WORKDIR>",
  backend: "codex",
  sandbox: "read-only",
  role: "analyzer",
  state_dir: "<PLAN_DIR>/codex-sessions",
  summary: "Analyze-A session for <task-name>"
})
```

同样方式按需或一次性创建：
- `<task-name>-analyzer-b`
- `<task-name>-planner-a`
- `<task-name>-planner-b`
- `<task-name>-executor`
- `<task-name>-reviewer-a`
- `<task-name>-reviewer-b`

复杂任务的关键规则：
- `executor` 使用 `workspace-write`
- `analyzer-*` / `planner-*` / `reviewer-*` 使用 `read-only`
- 单个 session 不兼任多个角色

#### 0.8 讨论与需求澄清（仅复杂任务）

迭代循环直到所有模糊点消除：

1. 展示当前理解并用 `AskUserQuestion` 提问
2. 用户回答后更新 `decisions.md`
3. 若仍有模糊点继续提问

完备性标准：
- 核心目标明确
- 约束明确
- 影响范围明确
- 无关键隐含假设

---

### Phase 1：分析

#### 1.1 简单任务

Claude 直接分析：
- 用 Read / Grep / Glob / 语义检索收集上下文
- 输出分析结论到 `findings.md`
- 更新 `progress.md`

#### 1.2 复杂任务

写入：
- `inputs/task.md`
- `inputs/context.md`
- `inputs/decisions.md`
- `artifacts/analysis-request.md`

并行调用两个分析会话：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-analyzer-a",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Analyze the task from a logic and behavior perspective. Focus on feasibility, risks, dependencies, and edge cases. Return structured markdown.",
  artifacts: ["<PLAN_DIR>/inputs/task.md", "<PLAN_DIR>/inputs/context.md", "<PLAN_DIR>/inputs/decisions.md", "<PLAN_DIR>/artifacts/analysis-request.md"]
})
```

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-analyzer-b",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Analyze the task from an architecture and integration perspective. Focus on module boundaries, coupling, extensibility, and migration risk. Return structured markdown.",
  artifacts: ["<PLAN_DIR>/inputs/task.md", "<PLAN_DIR>/inputs/context.md", "<PLAN_DIR>/inputs/decisions.md", "<PLAN_DIR>/artifacts/analysis-request.md"]
})
```

合并结果后写入：
- `artifacts/analysis-a.md`
- `artifacts/analysis-b.md`
- `findings.md`

若任一调用失败：
- 第 1 次：收窄上下文后重试
- 第 2 次：同角色新会话重建后重试
- 连续失败：记录 `Codex blocked` 并停止本阶段

---

### Phase 2：规划

#### 2.1 简单任务

Claude 直接基于分析结果输出实施计划，写入 `task_plan.md`。

#### 2.2 复杂任务

写入：
- `inputs/findings.md`
- `artifacts/plan-request.md`

并行调用两个规划会话：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-planner-a",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Produce an implementation plan focusing on execution order, data flow, error handling, and verification. Return structured markdown with steps and key files.",
  artifacts: ["<PLAN_DIR>/inputs/task.md", "<PLAN_DIR>/inputs/decisions.md", "<PLAN_DIR>/findings.md", "<PLAN_DIR>/artifacts/plan-request.md"]
})
```

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-planner-b",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Produce an implementation plan focusing on architecture, module boundaries, migration safety, and rollback points. Return structured markdown with steps and key files.",
  artifacts: ["<PLAN_DIR>/inputs/task.md", "<PLAN_DIR>/inputs/decisions.md", "<PLAN_DIR>/findings.md", "<PLAN_DIR>/artifacts/plan-request.md"]
})
```

综合两个计划，写入 `task_plan.md`。

**Hard Stop**：向用户展示计划并请求确认。用户确认后进入 Phase 3。

---

### Phase 3-5：实施 → 测试 → 审查 迭代循环

形成迭代循环，最多 3 轮：

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

#### 3.1 简单任务

Claude 直接按计划修改源码，随后自检。

#### 3.2 复杂任务

写入：
- `inputs/plan.md`
- `artifacts/implementation-request.md`

通过长期 `executor` 会话实施：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-executor",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Implement the approved plan in the workspace. Reuse prior session context. Focus only on the latest requested scope. Run minimal relevant verification and report what changed.",
  artifacts: ["<PLAN_DIR>/inputs/task.md", "<PLAN_DIR>/inputs/decisions.md", "<PLAN_DIR>/task_plan.md", "<PLAN_DIR>/artifacts/implementation-request.md"],
  summary: "Executor session for iterative implementation"
})
```

规则：
- `executor` 必须使用 `workspace-write`
- 测试失败或审查回流时继续向同一 `executor` 会话发送追加要求
- 只有在 session 损坏、空输出、角色漂移时才重建新 `executor`

产出写入：
- `artifacts/implementation-result-<n>.md`
- `progress.md`

---

#### Phase 5：测试

测试阶段不可跳过。若项目确实无法测试，必须向用户明确说明原因并确认。

#### 5.1 执行测试

优先运行项目已有的最小相关测试：
- lint
- typecheck
- unit/integration tests

将结果写入：
- `artifacts/test-result-<n>.md`
- `progress.md`

#### 5.2 测试失败回流

若测试失败：
- 将失败详情追加到 `inputs/task.md`
- 生成 `artifacts/test-failure-<n>.md`
- **优先复用 `<task-name>-executor`**
- `ITERATION += 1`

回流时使用：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-executor",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Fix the newly reported test failures without restarting full analysis. Preserve existing accepted changes unless the failures prove them incorrect.",
  artifacts: ["<PLAN_DIR>/artifacts/test-failure-<n>.md", "<PLAN_DIR>/task_plan.md", "<PLAN_DIR>/inputs/task.md"]
})
```

---

#### Phase 4：审查

#### 4.1 简单任务

Claude 自己完成审查。

#### 4.2 复杂任务

生成：
- `artifacts/review-request-<n>.md`
- `artifacts/diff-<n>.txt`

并行调用 `reviewer-a` / `reviewer-b`：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-reviewer-a",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Review the current changes for correctness, safety, performance, and error handling. Return findings grouped by severity.",
  artifacts: ["<PLAN_DIR>/artifacts/diff-<n>.txt", "<PLAN_DIR>/artifacts/review-request-<n>.md", "<PLAN_DIR>/task_plan.md"]
})
```

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-reviewer-b",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Review the current changes for architecture consistency, maintainability, regression risk, and testing gaps. Return findings grouped by severity.",
  artifacts: ["<PLAN_DIR>/artifacts/diff-<n>.txt", "<PLAN_DIR>/artifacts/review-request-<n>.md", "<PLAN_DIR>/task_plan.md"]
})
```

合并审查结论，写入 `findings.md`。

若存在 Critical：
- 生成 `artifacts/review-failure-<n>.md`
- 将修复要求追加到 `inputs/task.md`
- **优先复用 `<task-name>-executor`**
- `ITERATION += 1`

回流时使用：

```
mcp__ccg-codex__codex_session_send({
  session_name: "<task-name>-executor",
  state_dir: "<PLAN_DIR>/codex-sessions",
  prompt: "Fix the newly reported review findings without restarting full analysis. Focus on Critical issues first.",
  artifacts: ["<PLAN_DIR>/artifacts/review-failure-<n>.md", "<PLAN_DIR>/task_plan.md", "<PLAN_DIR>/inputs/task.md"]
})
```

---

### 止损

若 `ITERATION >= 3` 且仍有测试失败或 Critical：

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
2. 写入最终摘要到 `findings.md`
3. 关闭不再需要的 Codex 会话：

```
mcp__ccg-codex__codex_session_close({ session_name: "<task-name>-executor", state_dir: "<PLAN_DIR>/codex-sessions" })
```

4. 向用户输出：
- 变更摘要
- 测试结果
- 审查结果
- 迭代次数
- 状态文件路径

---

## 阶段完成后处理协议

每个阶段完成后，按顺序执行：

1. 将阶段结果写入 `artifacts/`
2. 将关键发现追加到 `findings.md`
3. 将错误和恢复动作写入 `progress.md`
4. 更新 Worker / Session Registry
5. 更新时间线与状态
6. 必要时向用户发送简短进度说明

---

## 异常处理

| 异常场景 | 决策 |
|----------|------|
| `ccg-codex` MCP 不可用 | 复杂任务直接阻塞，记录并升级给用户 |
| Codex 输出为空 | 标记该 session 不可复用，同角色重建后重试 |
| Codex 长时间失败 | 最多 2 次恢复，仍失败则记录 `Codex blocked` |
| 测试失败 | 回到 Phase 3，优先复用原 `executor` |
| 审查有 Critical | 回到 Phase 3，优先复用原 `executor` |
| 简单任务在执行中升级为复杂 | 立即初始化 Codex Session Slots，再进入复杂路径 |
| 同一角色连续 3 次失败 | 停止自动重试，升级给用户 |

---

## 关键规则

1. **简单任务 Claude 直做**
2. **复杂任务靠 MCP 会话层驱动 Codex**
3. **禁止手工管理 `SESSION_ID`**
4. **角色隔离**：analyzer / planner / executor / reviewer 会话不可混用
5. **执行优先复用**：测试或审查回流时先复用 `executor`
6. **禁止静默降级**：复杂路径失败不能假装由 Claude 已补完
7. **状态可追踪**：所有阶段和会话都要落盘到 `.claude/plan/<task-name>/`
