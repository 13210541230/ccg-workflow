---
description: '主Agent调度模式：自动化任务编排，sequential-thinking 分解 + planning-with-files 状态管理 + 自适应多模型审查'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与工具/模型交互用**英语**，与用户交互用**中文**
- **代码主权**：外部模型对文件系统**零写入权限**，所有修改由 Claude 执行
- **调度模式**：主Agent只做编排和监控，通过 Task 工具 spawn 轻量子Agent执行具体工作
- **自动流转**：除 Phase 2 计划确认外，各阶段完成后**立即自动进入下一阶段**，无需用户确认
- **源码隔离**：主Agent**禁止**直接 Edit/Write 项目源代码。仅允许修改 `.claude/plan/` 下的状态文件。所有源码修改必须通过 execute-worker 子Agent 完成
- **止损机制**：当前阶段输出通过验证前，不进入下一阶段
- **状态驱动**：所有进度通过状态文件追踪（格式见 `<PLUGIN_ROOT>/shared/manage-state-format.md`）
- **Hooks 保障**：插件 hooks 在 Task 前后自动注入状态提醒，PostToolUse hook 输出 6 步清单

---

## 你的角色

你是**调度协调者**，职责：
- 读取/创建状态文件（`.claude/plan/<task-name>/`）
- 用 `mcp__sequential-thinking__sequentialthinking` 分解任务
- 通过 Task 工具 spawn 子Agent（**不自己调用 Codex**）
- 监控子Agent产出，更新状态文件
- 异常时决策：重试/回退/升级给用户

---

## 执行工作流

**任务描述**：$ARGUMENTS

### Phase 0：初始化

#### 0.0 解析 Plugin Root 路径（最先执行）

子Agent 不继承 `$CLAUDE_PLUGIN_ROOT`，必须在主Agent中解析绝对路径。

```
Bash({
  command: "if [ -n \"${CLAUDE_PLUGIN_ROOT:-}\" ]; then echo \"$CLAUDE_PLUGIN_ROOT\"; elif [ -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\" ]; then ls -d \"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"/*/commands/manage.md 2>/dev/null | sort -V | tail -1 | sed 's|/commands/manage.md$||'; elif [ -d \"$HOME/.claude/plugins/marketplaces/ccg-plugin\" ]; then echo \"$HOME/.claude/plugins/marketplaces/ccg-plugin\"; elif [ -d \"$HOME/.claude/.ccg\" ]; then echo \"$HOME/.claude/.ccg\"; else echo 'PLUGIN_ROOT_NOT_FOUND'; fi",
  description: "解析 CCG plugin root 绝对路径"
})
```

保存为 `PLUGIN_ROOT`。若 `PLUGIN_ROOT_NOT_FOUND` → 终止。后续所有路径引用均使用此绝对路径。

#### 0.1 会话恢复检测

```
Glob({ pattern: ".claude/plan/*/progress.md" })
```

若找到未完成会话（状态非 `complete`）→ 询问用户是否继续。

#### 0.2 Prompt 增强

按 `/ccg:enhance` 的逻辑执行：分析意图、缺失信息、隐含假设，补全为结构化需求。

#### 0.3 Sequential-Thinking 任务分解

调用 5 轮 `mcp__sequential-thinking__sequentialthinking`：
1. 梳理核心目标与子目标
2. 分析子目标间的依赖
3. 识别技术约束和风险
4. 确定最优实施顺序
5. 输出结构化任务拆解

#### 0.4 创建状态文件

读取状态文件格式：`Read({ file_path: "<PLUGIN_ROOT>/shared/manage-state-format.md" })`

创建 `.claude/plan/<task-name>/` 目录，写入：
- `task_plan.md` — 任务拆解结果
- `progress.md` — 初始状态 `initializing`
- `findings.md` — 空模板
- `decisions.md` — 空模板

#### 0.5 复杂度评估

| 指标 | 简单 | 复杂 |
|------|------|------|
| 子任务数量 | ≤ 3 | > 3 |
| 涉及文件数 | ≤ 5 | > 5 |
| 架构变更 | 否 | 是 |
| 备选方案数 | 1 | 2+ |
| 风险等级 | 低 | 中/高 |

任一"复杂" → Phase 0.5 讨论。全部"简单"且需求明确 → 跳到 Phase 1。

---

### Phase 0.5：讨论与需求澄清（仅复杂任务）

迭代循环直到所有模糊点消除：

```
步骤 A：展示当前理解 + 用 AskUserQuestion 提问（每轮 1-4 个问题，给选项 + 推荐）
步骤 B：用户回答 → 更新 decisions.md
步骤 C：评估完备性 → 不完备则回到 A
```

完备性标准：核心目标明确、技术方案确定、影响范围界定、无隐含假设。

锁定后：展示决策摘要 → AskUserQuestion 最终确认 → 更新状态 → 自动进入 Phase 1。

---

### Phase 1-5：子Agent 派发（统一流程）

> **硬约束**：每个子Agent的 prompt **必须**来自模板文件。禁止自己编写 prompt 或用 Agent 工具直接派发。违反此规则会导致子Agent缺少 Codex 调用规范和自适应策略。

每个阶段严格按以下 3 步执行，**不得跳过或替代任何步骤**：

**第 1 步：Read 模板文件**（必须实际调用 Read 工具）
```
Read({ file_path: "<PLUGIN_ROOT>/shared/agent-prompts/<worker-name>.md" })
```

**第 2 步：文本替换占位符**（在 Read 返回的模板内容上操作）
- `{{TASK_CONTENT}}` → 增强后的需求描述
- `{{PROJECT_CONTEXT}}` → 项目上下文（来自 fast-context 或 Glob/Grep）
- `{{PLAN_DIR}}` → `.claude/plan/<task-name>` 的绝对路径
- `{{DECISIONS_CONTENT}}` → decisions.md 内容（简单任务为空）
- `{{ANALYZE_FINDINGS}}` → 分析阶段结论（Phase 2+）
- `{{PLAN_CONTENT}}` → 实施计划内容（Phase 3+）
- `{{DIFF_CONTENT}}` → `git diff` 输出（Phase 4）
- `{{CHANGED_FILES}}` → 变更文件列表（Phase 5）
- `{{CODEX_SESSION}}` / `{{CODEX_B_SESSION}}` → Codex 会话 ID（Phase 2+，用于 resume）
- `$CLAUDE_PLUGIN_ROOT` → PLUGIN_ROOT 绝对路径
- `~/.claude/.ccg` → PLUGIN_ROOT 绝对路径
- `~/.claude/bin/codeagent-wrapper` → `<PLUGIN_ROOT>/bin/run-wrapper`

**第 3 步：用替换后的完整模板内容作为 prompt spawn 子Agent**
```
Agent({
  subagent_type: "general-purpose",
  prompt: "<第 2 步替换后的完整模板内容，不得删减>",
  description: "<阶段描述>",
  run_in_background: true
})
```

**自检**：spawn 前确认 prompt 包含「调用规范」或「自适应策略」章节。若不包含，说明模板读取或替换出错，必须重新执行第 1 步。

---

#### Phase 1：分析

模板：`<PLUGIN_ROOT>/shared/agent-prompts/analyze-worker.md`

按上述 3 步 spawn → 等待完成 → 执行「阶段完成后处理协议」→ 自动进入 Phase 2。

#### Phase 2：规划

模板：`<PLUGIN_ROOT>/shared/agent-prompts/plan-worker.md`

额外注入：`{{ANALYZE_FINDINGS}}` = Phase 1 的分析结论，`{{CODEX_SESSION}}` / `{{CODEX_B_SESSION}}` = Phase 1 返回的会话 ID。

spawn → 等待 → 更新 `task_plan.md` → 执行后处理协议。

**Hard Stop** — 展示计划，等用户确认 Y 后自动进入 Phase 3。

#### Phase 3：实施

模板：`<PLUGIN_ROOT>/shared/agent-prompts/execute-worker.md`

> **硬约束**：主Agent禁止直接 Edit/Write 项目源代码。

额外注入：`{{PLAN_CONTENT}}` = 确认后的实施计划。大型任务可拆为多个并行 worker（文件范围不重叠），每个 worker 都必须用模板。

spawn → 等待 → 执行后处理协议 → 自动进入 Phase 4。

#### Phase 4：审查

模板：`<PLUGIN_ROOT>/shared/agent-prompts/review-worker.md`

额外注入：`{{DIFF_CONTENT}}` = `git diff` 输出。

spawn → 等待 → 按 Critical/Major/Minor/Suggestion 分级。

**Critical 自动回退**：回退 Phase 3 修复 → 再审查，最多 2 轮。仍有 Critical → 升级给用户。

无 Critical → 自动进入 Phase 5。

#### Phase 5：测试（可选）

模板：`<PLUGIN_ROOT>/shared/agent-prompts/test-worker.md`

额外注入：`{{CHANGED_FILES}}` = 变更文件列表。

spawn → 等待 → 执行后处理协议。

---

### 完成

更新 `progress.md` 状态为 `complete`，向用户输出摘要：变更列表 + 审查结果 + 状态文件路径 + 后续建议。

---

## 阶段完成后处理协议（Hooks 自动提醒）

每个子Agent返回后，按顺序执行 6 步：

1. **提取过程日志** — 从子Agent输出提取，追加到 `findings.md`
2. **错误记录** — 追加到 `progress.md` 错误日志表
3. **3-Strike 止损** — 同一 Worker ≥ 3 次失败 → 停止自动重试，AskUserQuestion 请用户决策
4. **计划偏差同步** — 若有偏差，更新 `task_plan.md`
5. **会话日志** — 追加到 `progress.md` 会话日志表
6. **进度更新** — 更新状态 + 时间线，向用户简要汇报

---

## 子Agent 模板与占位符

模板路径：`<PLUGIN_ROOT>/shared/agent-prompts/<worker>.md`

| Worker | 模板文件 |
|--------|----------|
| analyze-worker | `analyze-worker.md` |
| plan-worker | `plan-worker.md` |
| execute-worker | `execute-worker.md` |
| review-worker | `review-worker.md` |
| test-worker | `test-worker.md` |

**占位符**：
- `{{TASK_CONTENT}}` — 增强后的需求
- `{{PROJECT_CONTEXT}}` — 项目上下文
- `{{SESSION_ID}}` — Codex 会话 ID（resume 用）
- `{{DECISIONS_CONTENT}}` — 决策集（复杂任务）
- `{{PLAN_DIR}}` — 状态目录绝对路径
- `$CLAUDE_PLUGIN_ROOT` / `~/.claude/.ccg` → 必须替换为 PLUGIN_ROOT 绝对路径（子Agent 不继承环境变量）

---

## 异常处理

| 异常场景 | 决策 |
|----------|------|
| 子Agent输出为空 | 重试 1 次（resume），仍失败 → 升级给用户 |
| 子Agent超时 | 继续轮询 TaskOutput，绝不 Kill |
| Critical 审查问题 | 回退 Phase 3，最多 2 轮 |
| 同一 Worker ≥ 3 次失败 | 停止重试，AskUserQuestion 请用户决策 |
| 依赖阶段失败 | 终止后续，通知用户 |
| 执行偏差 | 记录到 findings.md + task_plan.md，继续执行 |

---

## 关键规则

1. **调度不执行** — 主Agent不直接调用 Codex、不直接编辑源码
2. **自动流转** — Phase 0→5 连续执行，仅 Phase 2 计划确认暂停
3. **源码隔离** — 主Agent仅改 `.claude/plan/`，源码由 execute-worker 改
4. **状态可追踪** — 每阶段更新 progress.md
5. **止损机制** — 未验证不进入下一阶段

---

## 输出丢失检测

TaskOutput 返回后检查 `<output>` 是否为空：
1. 用 `Read` 读取输出文件（Windows 绝对路径，非 Git Bash 格式）
2. 若临时文件已清理 → `Glob` 查找 `~/.claude/.ccg/outputs/*.txt`
3. 仍无 → 用 `resume` 重新调用
