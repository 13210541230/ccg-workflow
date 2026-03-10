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
- `inputs/` — 空目录（子Agent prompt 输入文件）
- `prompts/` — 空目录（子Agent 组装后的完整 prompt）

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

> **硬约束**：每个子Agent的 prompt **必须**由 `assemble-prompt.sh` 脚本从模板生成并写入文件。**禁止**自己编写 prompt、跳过脚本、或用 Agent 工具直接派发自定义内容。

每个阶段严格按以下 4 步执行：

**第 1 步：写入 input 文件**

用 Write 工具将本阶段所需的动态内容写入 `<PLAN_DIR>/inputs/` 下的对应文件：

| 文件 | 内容来源 | 使用阶段 |
|------|----------|----------|
| `task.md` | 增强后的需求描述 | 全部（Phase 0 首次写入，测试失败/审查 Critical 时追加修复要求） |
| `context.md` | 项目上下文 | Phase 1, 2, 3, 5（Phase 0 首次写入，通常不变） |
| `decisions.md` | decisions.md 内容 | Phase 1, 2, 3（Phase 0.5 写入） |
| `findings.md` | 分析阶段结论 | Phase 2, 3（Phase 1 完成后写入） |
| `plan.md` | 确认后的实施计划 | Phase 3（Phase 2 确认后写入） |
| `diff.txt` | `git diff` 输出 | Phase 4（每次审查前用 Bash 获取并 Write） |
| `changed-files.txt` | 变更文件列表 | Phase 5（每次测试前用 Bash 获取并 Write） |
| `team-name.txt` | 团队名称 | Phase 3, 4（Teammate 模式时写入） |

- 已在前序阶段写入且未变化的文件**无需重复写入**
- 需要更新的文件直接用 Write 覆写

**第 2 步：运行 assemble-prompt.sh 生成 prompt 文件**

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh <worker-name> --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/<worker-name>.prompt --plan-dir <PLAN_DIR> [--session <CODEX_SESSION>] [--session-b <CODEX_B_SESSION>]",
  description: "组装 <worker-name> prompt"
})
```

**自检**：Bash 输出应包含 `已写入:` 和文件大小。若包含 `[assemble-prompt] 错误` 或输出为空，排查后重试。

**第 3 步：spawn 子Agent（指向 prompt 文件）**

```
Agent({
  subagent_type: "general-purpose",
  prompt: "Read the instruction file at <PLAN_DIR>/prompts/<worker-name>.prompt and execute all instructions within it exactly as written. Do not summarize or skip any part.",
  description: "<阶段描述>",
  run_in_background: true
})
```

> **硬约束**：Agent 的 prompt 参数**只能**是指向 prompt 文件的读取指令。**禁止**将 prompt 内容内联传递、自行编写 prompt、或在指令中附加额外要求。若 assemble-prompt.sh 输出为空或报错，重新执行第 2 步，**不得**自行编写 prompt。

**第 4 步：等待后台 Agent 完成**

后台 Agent 完成时系统会**自动发送 `<task-notification>` 通知**，你会在对话中收到完成消息。

- **禁止**主动轮询、resume、或 Read 输出文件来检查进度
- **禁止**在 Agent 仍在运行时尝试 resume（会报 "Cannot resume: still running" 错误）
- 等待期间可以做**不冲突的工作**（如更新状态文件、准备下一阶段的 input 文件），或向用户简要说明正在等待
- 收到通知后，从 Agent 返回的 `result` 中提取子Agent产出，进入「阶段完成后处理协议」

**关于 Agent resume 的约束**：
- `resume` 只能用于**已完成**的 Agent，且**必须提供 `prompt` 参数**
- 正确用法：`Agent({ resume: "<agent_id>", prompt: "继续执行", description: "..." })`
- 禁止对正在运行的 Agent 调用 resume

---

#### Phase 1：分析

第 1 步（写入 input）：确认 `inputs/task.md`、`inputs/context.md`、`inputs/decisions.md` 已写入。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh analyze-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/analyze-worker.prompt --plan-dir <PLAN_DIR>",
  description: "组装 analyze-worker prompt"
})
```

第 3 步（spawn）：Agent spawn（指向 prompt 文件）→ 等待完成 → 执行「阶段完成后处理协议」→ 自动进入 Phase 2。

#### Phase 2：规划

第 1 步（写入 input）：将 Phase 1 分析结论写入 `inputs/findings.md`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh plan-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/plan-worker.prompt --plan-dir <PLAN_DIR> --session <CODEX_SESSION> --session-b <CODEX_B_SESSION>",
  description: "组装 plan-worker prompt"
})
```

第 3 步（spawn）：Agent spawn（指向 prompt 文件）→ 等待 → 更新 `task_plan.md` → 执行后处理协议。

**Hard Stop** — 展示计划，等用户确认 Y 后自动进入 Phase 3。

#### Phase 3-5：实施 → 测试 → 审查 迭代循环

> **硬约束**：主Agent**禁止**直接 Edit/Write 项目源代码。所有代码修改（含 bug 修复）**必须**通过 spawn execute-worker 子Agent 完成。违反此规则等同于系统级错误。
> **前置检测**：若环境变量 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` 未设为 `1`，降级为旧模式（直接用 Agent 工具 spawn，无双向通信）。

Phase 3/4/5 形成**迭代循环**，而非线性流水线：

```
┌─────────────────────────────────────────────────┐
│                 迭代循环（最多 3 轮）              │
│                                                   │
│  Phase 3（实施）→ Phase 5（测试）→ Phase 4（审查） │
│       ↑                                    │      │
│       └────── 有 Critical 或测试失败 ──────┘      │
│                                                   │
│  退出条件：测试通过 且 无 Critical 审查问题         │
│  止损条件：≥ 3 轮未收敛 → 升级给用户               │
└─────────────────────────────────────────────────┘
```

**迭代状态变量**：`ITERATION = 1`，每轮 +1，记录到 `progress.md`。

---

##### Phase 3：实施

按「Phase 1-5 子Agent 派发统一流程」执行。

第 1 步（写入 input）：将确认后的计划写入 `inputs/plan.md`。Teammate 模式时写入 `inputs/team-name.txt`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh execute-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/execute-worker.prompt --plan-dir <PLAN_DIR> --session <CODEX_SESSION>",
  description: "组装 execute-worker prompt"
})
```

第 3 步（spawn）：Agent spawn（指向 prompt 文件）→ 等待 → 执行「阶段完成后处理协议」→ **自动进入 Phase 5（测试）**。

**Teammate 模式**（Agent Teams 可用时）：创建团队 → spawn 为 team-implementer → 消息监听循环 → 清理团队。消息类型：`plan_infeasible` / `scope_extension` / `dependency_missing` / `ambiguity`。

**降级模式**（Agent Teams 不可用时）：直接用 Agent 工具 spawn，无 PROMPT_TEAM_NAME。

大型任务可拆为多个并行 worker（文件范围不重叠），每个 worker 在同一团队内 spawn。

---

##### Phase 5：测试（必须执行）

> **强制规则**：测试阶段**不可跳过**。若项目确实无法测试，**必须**向用户明确说明原因（如：无测试框架、无测试命令、纯文档变更等），由用户决定是否跳过。**禁止**主Agent自行判断跳过。

**第 1 步：测试可行性检查**

检查项目是否具备测试条件：
- 是否存在测试框架配置（`package.json` 中的 test 脚本、`pytest.ini`、`go test` 等）
- 变更文件是否为可测试的代码文件（非纯文档/配置）

**若不可测试**：

```
AskUserQuestion({
  question: "当前项目不具备自动化测试条件：<具体原因>。是否跳过测试阶段直接进入审查？",
  options: ["跳过测试，进入审查", "我来指定测试方式"]
})
```

用户确认跳过 → 记录到 `progress.md`（`Phase 5: skipped - <原因>`）→ 进入 Phase 4。

**若可测试**：

第 1 步（写入 input）：将变更文件列表写入 `inputs/changed-files.txt`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh test-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/test-worker.prompt --plan-dir <PLAN_DIR>",
  description: "组装 test-worker prompt"
})
```

第 3 步（spawn）：Agent spawn（指向 prompt 文件）→ 等待 → 执行「阶段完成后处理协议」。

**第 2 步：评估测试结果**

- 全部通过 → 进入 Phase 4（审查）
- 有失败 → 记录失败详情到 `progress.md`，**回退到 Phase 3**：
  - 将测试失败信息追加到 `inputs/task.md`（追加失败详情和修复要求）
  - 重新 spawn execute-worker 修复代码（**禁止主Agent自己修复**）
  - `ITERATION += 1`，检查止损条件

---

##### Phase 4：审查

按「Phase 1-5 子Agent 派发统一流程」执行。

第 1 步（写入 input）：将 `git diff` 输出写入 `inputs/diff.txt`。Teammate 模式时写入 `inputs/team-name.txt`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh review-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/review-worker.prompt --plan-dir <PLAN_DIR> --session <CODEX_SESSION> --session-b <CODEX_B_SESSION>",
  description: "组装 review-worker prompt"
})
```

第 3 步（spawn）：Agent spawn（指向 prompt 文件）→ 等待 → 执行「阶段完成后处理协议」。

**Teammate 模式**：同 Phase 3，消息类型：`critical_found` / `scope_question` / `conflict_findings`。

**降级模式**：同 Phase 3。

**后处理**：按 Critical/Major/Minor/Suggestion 分级审查结果。

- **无 Critical** → 退出迭代循环 → 进入「完成」
- **有 Critical** → **必须重新 spawn execute-worker 子Agent 修复**（禁止主Agent直接 Edit/Write 源码）：
  1. 提取 Critical 问题列表，构造修复需求描述
  2. 将 Critical 问题和修复要求追加到 `inputs/task.md`
  3. 重新执行 Phase 3（spawn execute-worker）→ Phase 5（测试）→ Phase 4（审查）
  4. `ITERATION += 1`，检查止损条件

**止损**：`ITERATION >= 3` 且仍有 Critical 或测试失败 → 停止迭代，升级给用户：

```
AskUserQuestion({
  question: "经过 N 轮迭代仍未收敛：\n- Critical 问题：<列表>\n- 测试失败：<列表>\n请决定后续处理方式。",
  options: ["继续迭代", "接受当前状态并完成", "回退所有变更"]
})
```

---

### 完成

更新 `progress.md` 状态为 `complete`，向用户输出摘要：变更列表 + 测试结果 + 审查结果 + 迭代次数 + 状态文件路径 + 后续建议。

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

## 子Agent Prompt 组装

所有子Agent prompt 由 `<PLUGIN_ROOT>/scripts/assemble-prompt.sh` 脚本机械生成：
1. 从 `<PLAN_DIR>/inputs/` 读取动态内容文件
2. 替换 `<PLUGIN_ROOT>/shared/agent-prompts/<worker>.md` 模板中的占位符
3. 写入 `<PLAN_DIR>/prompts/<worker>.prompt`

**禁止手动编写 prompt 或修改脚本输出文件**。主Agent通过 Agent 工具指示子Agent自行读取 prompt 文件，不将 prompt 内容加载到主Agent上下文。

---

## 异常处理

| 异常场景 | 决策 |
|----------|------|
| 子Agent输出为空 | 用相同 prompt 重新 spawn 一个新 Agent（不是 resume），仍失败 → 升级给用户 |
| 子Agent长时间未完成 | 等待自动通知，绝不 Kill；可用 Read 查看输出文件了解进度 |
| Critical 审查问题 | spawn execute-worker 修复（**禁止主Agent直接修改代码**），最多 3 轮迭代 |
| 测试失败 | spawn execute-worker 修复（**禁止主Agent直接修改代码**），最多 3 轮迭代 |
| 同一 Worker ≥ 3 次失败 | 停止重试，AskUserQuestion 请用户决策 |
| 依赖阶段失败 | 终止后续，通知用户 |
| 执行偏差 | 记录到 findings.md + task_plan.md，继续执行 |
| 测试不可行 | **必须**向用户说明原因并确认，禁止静默跳过 |

---

## 关键规则

1. **调度不执行** — 主Agent不直接调用 Codex、**不直接 Edit/Write 项目源代码**（含 bug 修复、审查问题修复、测试失败修复——全部通过 spawn execute-worker 完成）
2. **迭代收敛** — Phase 3→5→4 形成迭代循环，测试通过且无 Critical 才退出，最多 3 轮
3. **源码隔离** — 主Agent仅改 `.claude/plan/`，源码由 execute-worker 改
4. **测试不可跳过** — 不可测试时必须向用户说明原因并确认，禁止静默跳过
5. **状态可追踪** — 每阶段更新 progress.md
6. **止损机制** — 未验证不进入下一阶段；≥ 3 轮未收敛 → 升级给用户
7. **双向通信** — Phase 3/4 支持 Worker 阻塞式请求，主 Agent 监听并回复；Agent Teams 不可用时自动降级

---

## 输出丢失检测

子Agent 返回结果中 `result` 为空时：
1. 用 `Read` 读取 Agent 的输出文件（路径在 spawn 时返回的 `output_file` 中，使用 Windows 绝对路径格式）
2. 若输出文件也为空或不存在 → 用相同 prompt 文件路径**重新 spawn 一个新 Agent**（不是 resume 旧的）
3. 仍失败 → 升级给用户

**注意**：不要尝试 resume 已完成但输出为空的 Agent——空输出通常意味着 Agent 内部出错，resume 不会产生新结果。应该重新 spawn。
