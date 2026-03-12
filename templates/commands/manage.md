---
description: '主Agent调度模式：自动化任务编排，复杂任务优先 agent-team + codex-agent 协作，sequential-thinking 分解 + planning-with-files 状态管理 + 自适应多模型审查'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与工具/模型交互用**英语**，与用户交互用**中文**
- **代码主权**：外部模型对文件系统**零写入权限**，所有修改由 Claude 执行
- **调度模式**：主Agent只做编排和监控；复杂任务优先建立 **agent-team**，复杂代码修改优先交给 **codex-agent** 协作落地
- **自动流转**：除 Phase 2 计划确认外，各阶段完成后**立即自动进入下一阶段**，无需用户确认
- **源码隔离**：主Agent**禁止**直接 Edit/Write 项目源代码。仅允许修改 `.claude/plan/` 下的状态文件。所有源码修改必须通过实施 worker 或 codex-agent 完成
- **止损机制**：当前阶段输出通过验证前，不进入下一阶段
- **状态驱动**：所有进度通过状态文件追踪（格式见 `<PLUGIN_ROOT>/shared/manage-state-format.md`）
- **Hooks 保障**：插件 hooks 在 Task / Agent 前后自动注入状态提醒，PostToolUse hook 输出 7 步清单
- **禁止静默降级**：一旦某阶段已判定需要 Codex 或 Agent Teams，超时/空输出/临时错误只允许重试或升级，**禁止**偷偷改成 Agent 自行完成
- **迭代优先复用**：测试失败或审查问题回流到 Phase 3 时，优先 `resume` 上一轮已完成的实施 worker / codex-agent，禁止每轮都新开一个 Agent 重新吃上下文

---

## 你的角色

你是**调度协调者**，职责：
- 读取/创建状态文件（`.claude/plan/<task-name>/`）
- 用 `mcp__sequential-thinking__sequentialthinking` 分解任务
- 通过 Agent 工具 spawn 子Agent（复杂实施优先 `ccg:codex-collaborator`，复杂协作优先 agent-teams；**不自己调用 Codex 做实质分析/改码**）
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

验证 codex_bridge.py 可用：

```
Bash({
  command: "[ -f \"<PLUGIN_ROOT>/scripts/codex_bridge.py\" ] && echo 'BRIDGE=<PLUGIN_ROOT>/scripts/codex_bridge.py OK' || echo 'BRIDGE MISSING'",
  description: "验证 codex_bridge.py 可用"
})
```

保存为 `BRIDGE`。若 `BRIDGE MISSING` → 终止。

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

后续迭代需在 `progress.md` 的 Worker Registry 中持久化：
- `LAST_EXECUTE_AGENT_ID`
- `LAST_EXECUTE_SUBAGENT_TYPE`
- `LAST_EXECUTE_STATUS`
- `LAST_EXECUTE_CODEX_SESSION`
- `LAST_EXECUTE_REUSE_ELIGIBLE`

#### 0.5 复杂度评估

| 指标 | 简单 | 复杂 |
|------|------|------|
| 子任务数量 | ≤ 3 | > 3 |
| 涉及文件数 | ≤ 5 | > 5 |
| 架构变更 | 否 | 是 |
| 备选方案数 | 1 | 2+ |
| 风险等级 | 低 | 中/高 |

任一"复杂" → Phase 0.5 讨论。全部"简单"且需求明确 → 跳到 Phase 1。

#### 0.6 Agent Team 预创建（复杂任务默认执行）

若复杂度评估为"复杂"，或后续大概率会进入多轮实施/审查迭代，则**在第一次 worker spawn 前先尝试创建团队**：

```
TeamCreate({
  team_name: "manage-<task-name>",
  agent_type: "lead"
})
```

- 创建成功：保存 `TEAM_NAME=manage-<task-name>`，后续 Phase 3/4 默认使用 agent-teams 路径
- 创建失败：将**原始报错**写入 `progress.md`，并标记 `TEAM_UNAVAILABLE=true`
- **硬约束**：未执行过 `TeamCreate` 检查前，禁止把 Phase 3/4 直接降级为 `general-purpose`
- 简单任务可跳过本步骤

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
| `team-name.txt` | 团队名称 | Phase 3, 4（Agent Teams 可用时写入） |

- 已在前序阶段写入且未变化的文件**无需重复写入**
- 需要更新的文件直接用 Write 覆写

**第 2 步：运行 assemble-prompt.sh 生成 prompt 文件**

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh <worker-name> --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/<worker-name>.prompt --plan-dir <PLAN_DIR>",
  description: "组装 <worker-name> prompt"
})
```

如需复用会话，在命令末尾按需追加 `--session <CODEX_SESSION>` 与 `--session-b <CODEX_B_SESSION>`。

**自检**：Bash 输出应包含 `已写入:` 和文件大小。若包含 `[assemble-prompt] 错误` 或输出为空，排查后重试。

**第 3 步：spawn 子Agent（指向 prompt 文件）**

```
Agent({
  subagent_type: "<见类型表>",
  name: "<worker-name>",  // agent-teams 类型时必须传入，用于 SendMessage 寻址
  team_name: "<TEAM_NAME>",  // 仅 Phase 3/4 agent-teams 类型时传入，其余省略
  prompt: "Read the instruction file at <PLAN_DIR>/prompts/<worker-name>.prompt and execute all instructions within it exactly as written. Do not summarize or skip any part.",
  description: "<阶段描述>",
  run_in_background: true
})
```

spawn 成功后，**立即**把返回的 `agent_id`、`subagent_type`、`output_file`、阶段名写入 `progress.md` 的 Worker Registry；不要等到阶段结束再补记。

**subagent 类型选择**（默认优先 agent-teams / codex-agent；仅在当前会话已记录失败时降级）：

| 阶段 | 默认首选 | 降级 |
|------|----------|------|
| Phase 1, 2, 5 | general-purpose | 无 |
| Phase 3（实施，复杂代码修改） | ccg:codex-collaborator | agent-teams:team-implementer -> general-purpose |
| Phase 3（实施，局部简单修改） | agent-teams:team-implementer | general-purpose |
| Phase 4（审查） | agent-teams:team-reviewer | general-purpose |

> **硬约束**：Agent prompt **只能**指向 prompt 文件。禁止内联 prompt 或自行编写。assemble-prompt.sh 报错时重新执行第 2 步。
>
> **复杂实施路由**：命中以下任一条件时，Phase 3 **必须优先**使用 `ccg:codex-collaborator`，而不是让普通 worker 自己硬做：`> 2` 个文件、跨模块接口调整、状态机/算法/并发控制、复杂测试失败修复、审查 Critical 连锁修复。

**第 4 步：等待后台 Agent 完成**

后台 Agent 完成时系统会**自动发送 `<task-notification>` 通知**，你会在对话中收到完成消息。

- **禁止**主动轮询、resume、或 Read 输出文件来检查进度
- **禁止**在 Agent 仍在运行时尝试 resume（会报 "Cannot resume: still running" 错误）
- 等待期间可以做**不冲突的工作**（如更新状态文件、准备下一阶段的 input 文件），或向用户简要说明正在等待
- **Agent Teams 消息处理**：Phase 3/4 worker 可能发送阻塞式消息（`recipient: "team-lead"`）。收到后用 `SendMessage({ type: "message", recipient: "<worker-name>", content: "<决策>", summary: "<摘要>" })` 回复
- 收到**完成通知**后，从 Agent 返回的 `result` 中提取子Agent产出，进入「阶段完成后处理协议」

**关于 Agent resume 的约束**：
- `resume` 只能用于**已完成**的 Agent，且**必须提供 `prompt` 参数**
- 正确用法：`Agent({ resume: "<agent_id>", prompt: "继续执行", description: "..." })`
- 禁止对正在运行的 Agent 调用 resume
- **迭代修复规则**：对同一路由的 Phase 3 修复，默认先尝试 resume 上一轮已完成的实施 worker；只有在该 worker 不可复用时才新 spawn

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

> **硬约束**：主Agent**禁止**直接 Edit/Write 项目源代码。所有代码修改**必须**通过 spawn 实施 worker 或 codex-agent 完成。
> **Agent Teams**：若 Phase 0.6 已创建成功，Phase 3/4 默认复用该团队；若尚未创建（例如简单任务在执行中升级为复杂），则在进入本循环前**立即补做一次** `TeamCreate({ team_name: "manage-<task-name>", agent_type: "lead" })`。只有当本会话已把 TeamCreate 原始失败信息写入 `progress.md` 后，才允许把 Phase 3/4 降级到 `general-purpose`。迭代结束后若团队已创建，必须 `TeamDelete()` 清理。

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

第 1 步（写入 input）：将确认后的计划写入 `inputs/plan.md`。Agent Teams 可用时写入 `inputs/team-name.txt`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh execute-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/execute-worker.prompt --plan-dir <PLAN_DIR> --session <CODEX_SESSION>",
  description: "组装 execute-worker prompt"
})
```

第 3 步（spawn）：先做实施路由判定，再按类型表选择 subagent 类型：

- 命中复杂实施路由 → **优先** `ccg:codex-collaborator`
- 未命中复杂实施路由，且 TeamCreate 已成功 → `agent-teams:team-implementer`
- 只有在 `ccg:codex-collaborator` 与 TeamCreate 都已在当前会话记录失败时，才允许降级到 `general-purpose`

**迭代修复时的优先顺序**：

1. 若 `progress.md` 的 Worker Registry 中存在 `LAST_EXECUTE_AGENT_ID`，且满足以下全部条件，则**优先 resume**：
   - `LAST_EXECUTE_STATUS=completed`
   - `LAST_EXECUTE_REUSE_ELIGIBLE=yes`
   - 本轮判定的实施路由与上一轮一致（例如仍为 `ccg:codex-collaborator`，或仍为 `agent-teams:team-implementer`）
   - 上一轮不是“空输出 / 内部错误 / 输出文件缺失”失败
2. resume 用法：

```
Agent({
  resume: "<LAST_EXECUTE_AGENT_ID>",
  prompt: "Read the instruction file at <PLAN_DIR>/prompts/execute-worker.prompt and continue from the previous implementation context. Focus only on the newly appended repair requirements and do not restart full analysis.",
  description: "继续 Phase 3 实施修复"
})
```

3. 只有在以下任一条件成立时，才改为新 spawn：
   - 没有可复用的 `LAST_EXECUTE_AGENT_ID`
   - 上一轮实施 worker 仍在运行或已损坏
   - 本轮路由升级/降级导致 subagent 类型变化
   - 上一轮结果为空或 Worker Registry 标记为 `reuse_eligible=no`

等待完成 → 执行「阶段完成后处理协议」→ **自动进入 Phase 5（测试）**。大型任务可拆为多个并行 worker（文件范围不重叠），但每个 worker 仍需遵守上述路由。

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
  - **优先 resume 上一轮已完成的 Phase 3 实施 worker / codex-agent**；仅在不可复用时才新 spawn
  - `ITERATION += 1`，检查止损条件

---

##### Phase 4：审查

按「Phase 1-5 子Agent 派发统一流程」执行。

第 1 步（写入 input）：将 `git diff` 输出写入 `inputs/diff.txt`。Agent Teams 可用时写入 `inputs/team-name.txt`。

第 2 步（组装 prompt）：

```
Bash({
  command: "bash <PLUGIN_ROOT>/scripts/assemble-prompt.sh review-worker --plugin-root <PLUGIN_ROOT> --input-dir <PLAN_DIR>/inputs --output <PLAN_DIR>/prompts/review-worker.prompt --plan-dir <PLAN_DIR> --session <CODEX_SESSION> --session-b <CODEX_B_SESSION>",
  description: "组装 review-worker prompt"
})
```

第 3 步（spawn）：按类型表选择 subagent 类型 → 等待 → 执行「阶段完成后处理协议」。

**后处理**：按 Critical/Major/Minor/Suggestion 分级审查结果。

- **无 Critical** → 退出迭代循环 → 进入「完成」
- **有 Critical** → **必须重新进入 Phase 3，按实施路由选择实施 worker / codex-agent 修复**（禁止主Agent直接 Edit/Write 源码）：
  1. 提取 Critical 问题列表，构造修复需求描述
  2. 将 Critical 问题和修复要求追加到 `inputs/task.md`
  3. **优先 resume 上一轮已完成的 Phase 3 实施 worker / codex-agent**；只有不可复用时才重新 spawn
  4. 重新执行 Phase 3（优先 resume，否则按实施路由重新 spawn）→ Phase 5（测试）→ Phase 4（审查）
  5. `ITERATION += 1`，检查止损条件

**止损**：`ITERATION >= 3` 且仍有 Critical 或测试失败 → 停止迭代，升级给用户：

```
AskUserQuestion({
  question: "经过 N 轮迭代仍未收敛：\n- Critical 问题：<列表>\n- 测试失败：<列表>\n请决定后续处理方式。",
  options: ["继续迭代", "接受当前状态并完成", "回退所有变更"]
})
```

---

### 完成

1. 若 Agent Teams 已启用 → `TeamDelete()` 清理团队资源
2. 更新 `progress.md` 状态为 `complete`
3. 向用户输出摘要：变更列表 + 测试结果 + 审查结果 + 迭代次数 + 状态文件路径 + 后续建议

---

## 阶段完成后处理协议（Hooks 自动提醒）

每个子Agent返回后，按顺序执行 7 步：

1. **提取过程日志** — 从子Agent输出提取，追加到 `findings.md`
2. **错误记录** — 追加到 `progress.md` 错误日志表
3. **3-Strike 止损** — 同一 Worker ≥ 3 次失败 → 停止自动重试，AskUserQuestion 请用户决策
4. **计划偏差同步** — 若有偏差，更新 `task_plan.md`
5. **Worker Registry 同步** — 记录/更新 `agent_id`、`subagent_type`、`status`、`output_file`、`CODEX_SESSION`、`reuse_eligible`
6. **会话日志** — 追加到 `progress.md` 会话日志表
7. **进度更新** — 更新状态 + 时间线，向用户简要汇报

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
| 子Agent长时间未完成 | 等待自动通知，绝不 Kill；若该阶段已判定需要 Codex/Agent Teams，则只允许重试或升级，**禁止**改由 Agent 自己补做分析/规划/审查/复杂实施 |
| Critical 审查问题 | 回到 Phase 3，**优先 resume** 原实施 worker / codex-agent，不可复用时再 spawn，最多 3 轮迭代 |
| 测试失败 | 回到 Phase 3，**优先 resume** 原实施 worker / codex-agent，不可复用时再 spawn，最多 3 轮迭代 |
| 同一 Worker ≥ 3 次失败 | 停止重试，AskUserQuestion 请用户决策 |
| 依赖阶段失败 | 终止后续，通知用户 |
| 执行偏差 | 记录到 findings.md + task_plan.md，继续执行 |
| 测试不可行 | **必须**向用户说明原因并确认，禁止静默跳过 |

---

## 关键规则

1. **调度不执行** — 主Agent不直接调用 Codex 做实质分析/改码、**不直接 Edit/Write 项目源代码**（含 bug 修复、审查问题修复、测试失败修复——全部通过 spawn worker / codex-agent 完成）
2. **迭代收敛** — Phase 3→5→4 形成迭代循环，测试通过且无 Critical 才退出，最多 3 轮
3. **源码隔离** — 主Agent仅改 `.claude/plan/`，源码由实施 worker / codex-agent 改
4. **测试不可跳过** — 不可测试时必须向用户说明原因并确认，禁止静默跳过
5. **状态可追踪** — 每阶段更新 progress.md
6. **止损机制** — 未验证不进入下一阶段；≥ 3 轮未收敛 → 升级给用户
7. **双向通信** — Phase 3/4 使用 agent-teams subagent 时支持 Worker 阻塞式请求（协议内置于 worker prompt）
8. **复杂修改优先 Codex-Agent** — 跨文件/跨模块/高风险改动优先 `ccg:codex-collaborator`，不要让普通 worker 硬做
9. **禁止静默降级** — Codex 超时、空输出、TeamCreate 失败都必须记录并显式处理，不能假装阶段已由 Agent 自行完成
10. **迭代修复优先复用** — 审查/测试回流到 Phase 3 时，先 resume 原实施 worker；不要每轮新开 Agent 重新分析上下文

---

## 输出丢失检测

子Agent 返回结果中 `result` 为空时：
1. 用 `Read` 读取 Agent 的输出文件（路径在 spawn 时返回的 `output_file` 中，使用 Windows 绝对路径格式）
2. 若输出文件也为空或不存在 → 用相同 prompt 文件路径**重新 spawn 一个新 Agent**（不是 resume 旧的）
3. 仍失败 → 升级给用户

**注意**：不要尝试 resume 已完成但输出为空的 Agent——空输出通常意味着 Agent 内部出错，resume 不会产生新结果。应该重新 spawn。
