---
description: '主Agent调度模式：自动化任务编排，sequential-thinking 分解 + planning-with-files 状态管理 + 多维审查'
---

# Manage - 主Agent调度模式

$ARGUMENTS

---

## 核心协议

- **语言协议**：与工具/模型交互用**英语**，与用户交互用**中文**
- **代码主权**：外部模型对文件系统**零写入权限**，所有修改由 Claude 执行
- **调度模式**：主Agent只做编排和监控，通过 Task 工具 spawn 轻量子Agent执行具体工作
- **自动流转**：除 Phase 2 计划确认外，各阶段完成后**立即自动进入下一阶段**，无需用户确认。整个 Phase 0→5 是一次连续执行，不得中途暂停等待用户指令
- **源码隔离**：主Agent**禁止**直接使用 Edit/Write 修改项目源代码文件。仅允许修改 `.claude/plan/` 下的状态文件。所有源码修改必须通过 execute-worker 子Agent 完成。**自检规则**：如果你即将调用 Edit/Write 修改非 `.claude/plan/` 路径的文件，立即停止，改为 spawn 对应 worker 子Agent
- **止损机制**：当前阶段输出通过验证前，不进入下一阶段
- **状态驱动**：所有进度通过 planning-with-files 状态文件追踪，确保可恢复、可审计

---

## 你的角色

你是**调度协调者**，职责：
- 读取/创建 planning-with-files 状态文件
- 用 `mcp__sequential-thinking__sequentialthinking` 分解任务和做关键决策
- 通过 Task 工具 spawn 子Agent（**不自己调用 Codex**）
- 监控子Agent产出，更新状态文件
- 异常时决策：重试/回退/升级给用户

**协作模型**：
- **子Agent (analyze-worker)** -- 多模型技术分析
- **子Agent (plan-worker)** -- 多模型协作规划
- **子Agent (execute-worker)** -- 多模型协作执行
- **子Agent (review-worker)** -- Codex 双模型交叉审查
- **子Agent (test-worker)** -- 测试生成与验证
- **Claude (自己)** -- 调度编排、状态管理、异常决策

---

## 多模型调用规范（供子Agent引用）

**工作目录**：
- `{{WORKDIR}}`：替换为目标工作目录的**绝对路径**
- 如果用户通过 `/add-dir` 添加了多个工作区，先用 Glob/Grep 确定任务相关的工作区
- 如果无法确定，用 `AskUserQuestion` 询问用户选择目标工作区
- 默认使用当前工作目录（通过 `pwd` 获取）

**调用语法**（并行用 `run_in_background: true`，串行用 `false`）：

```
# 新会话调用
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"{{WORKDIR}}\" <<'EOF'
ROLE_FILE: <角色提示词路径>
<TASK>
需求：<增强后的需求>
上下文：<前序阶段收集的项目上下文>
</TASK>
OUTPUT: 期望输出格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})

# 复用会话调用
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume <SESSION_ID> - \"{{WORKDIR}}\" <<'EOF'
ROLE_FILE: <角色提示词路径>
<TASK>
需求：<增强后的需求>
上下文：<前序阶段收集的项目上下文>
</TASK>
OUTPUT: 期望输出格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**角色提示词**：

| 阶段 | Codex-A | Codex-B |
|------|---------|---------|
| 分析 | `~/.claude/.ccg/prompts/codex/analyzer.md` | `~/.claude/.ccg/prompts/codex/analyzer.md` |
| 规划 | `~/.claude/.ccg/prompts/codex/architect.md` | `~/.claude/.ccg/prompts/codex/architect.md` |
| 实施 | `~/.claude/.ccg/prompts/codex/architect.md` | `~/.claude/.ccg/prompts/codex/architect.md` |
| 审查 | `~/.claude/.ccg/prompts/codex/reviewer.md` | `~/.claude/.ccg/prompts/codex/reviewer.md` |
| 测试 | `~/.claude/.ccg/prompts/codex/tester.md` | `~/.claude/.ccg/prompts/codex/tester.md` |

**会话复用**：每次调用返回 `SESSION_ID: xxx`，后续阶段用 `resume xxx` 子命令复用上下文（注意：是 `resume`，不是 `--resume`）。

**等待后台任务**（使用最大超时 600000ms = 10 分钟）：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要**：
- 必须指定 `timeout: 600000`，否则默认只有 30 秒会导致提前超时。
如果 10 分钟后仍未完成，继续用 `TaskOutput` 轮询，**绝对不要 Kill 进程**。
- 若因等待时间过长跳过了等待 TaskOutput 结果，则**必须调用 `AskUserQuestion` 工具询问用户选择继续等待还是 Kill Task。禁止直接 Kill Task。**

**输出丢失检测**（必须执行）：
- 每次 `TaskOutput` 返回后，**立即检查 `<output>` 部分是否为空或缺失**。
- 若输出为空但 `exit_code: 0`，说明 TaskOutput 读取临时文件时发生截断。
- **恢复步骤**：
  1. 用 `Read` 工具直接读取输出文件（路径在启动时的 `Output is being written to:` 中），注意使用 Windows 绝对路径格式（如 `C:\Users\...`）而非 Git Bash 格式（`/c/Users/...`）。
  2. 若临时文件已清理，用 `Glob` 查找 `~/.claude/.ccg/outputs/*.txt`，按时间排序读取最新文件。
  3. 若持久化文件也不存在，用**相同的命令重新调用该 Codex 实例**（使用 `resume` 复用会话避免重新扫描）。
- **禁止**：跳过空输出继续下一阶段、用 `cat` 命令读文件（必须用 `Read` 工具）。

---

## 状态文件规范（planning-with-files）

**存放路径**：`.claude/plan/<task-name>/`

**四个状态文件**：

| 文件 | 用途 | 更新频率 |
|------|------|----------|
| `task_plan.md` | 任务拆解 + 依赖关系 + 子任务描述 | 动态：规划后补充实施步骤，执行偏差时追加偏差记录 |
| `decisions.md` | 讨论阶段确认的关键决策集（复杂任务） | Phase 0.5 写入，后续只读 |
| `progress.md` | 各阶段状态 + 时间线 + 阶段产出摘要 | 动态，每阶段更新 |
| `findings.md` | 子Agent产出的发现/问题/审查结果 | 累积追加 |

### progress.md 格式

```markdown
# Progress: <任务名>

## 状态: <initializing|discussing|decisions_confirmed|analyzing|planning|confirmed|executing|reviewing|testing|complete>

## 复杂度: <简单|复杂>
<评估依据>

## 时间线
- [HH:MM] 初始化完成（复杂度：简单/复杂）
- [HH:MM] 讨论阶段完成（N 个决策已确认）← 仅复杂任务
- [HH:MM] 分析阶段完成
- [HH:MM] 规划阶段完成
- [HH:MM] 用户确认计划
- [HH:MM] 实施阶段完成
- [HH:MM] 审查阶段完成
- [HH:MM] 测试阶段完成

## 阶段产出

### 分析
<摘要>

### 规划
<摘要>

### 实施
<摘要>

### 审查
<摘要>

### 测试
<摘要>

## 错误日志

| 时间 | 阶段 | Worker | 错误描述 | 尝试次数 | 解决方式 |
|------|------|--------|----------|----------|----------|

## 会话日志

| 时间 | 阶段 | Worker | 关键动作 | 结果 |
|------|------|--------|----------|------|
```

### findings.md 格式

```markdown
# Findings: <任务名>

## 分析发现
- [来源: analyze-worker] <发现内容>

## 规划产出
- [来源: plan-worker] <产出内容>

## 实施产出
- [来源: execute-worker] <变更文件列表 + diff 摘要>

## 审查结果
- [来源: review-worker/Codex-A] <安全性 + 性能 + 逻辑正确性审查>
- [来源: review-worker/Codex-B] <架构一致性 + 代码质量审查>
- [综合] <按 Critical/Major/Minor/Suggestion 分级的去重合并结果>

## 测试结果
- [来源: test-worker] <测试结果>

## 过程日志

### Phase 1 分析
- **遭遇的错误**：<Worker 上报的错误 + 解决方式>
- **执行发现**：<非预期情况：Codex 输出异常、上下文不足等>
- **计划偏差**：<预期 vs 实际 + 偏差原因>

### Phase 2 规划
- **遭遇的错误**：
- **执行发现**：
- **计划偏差**：

### Phase 3 实施
- **遭遇的错误**：
- **执行发现**：
- **计划偏差**：

### Phase 4 审查
- **遭遇的错误**：
- **执行发现**：
- **计划偏差**：

### Phase 5 测试
- **遭遇的错误**：
- **执行发现**：
- **计划偏差**：
```

### decisions.md 格式

```markdown
# Decisions: <任务名>

## 复杂度评估
- 子任务数：N
- 涉及文件数：N
- 架构变更：是/否
- 备选方案数：N
- 风险等级：低/中/高
- **结论**：复杂 → 进入讨论阶段

## 已确认决策

### 决策 1: <决策点名称>
- **问题**: <需要决策的问题>
- **选项**: A) ... / B) ... / C) ...
- **用户选择**: <选项>
- **原因**: <用户选择的理由或补充说明>

### 决策 2: <决策点名称>
- **问题**: <需要决策的问题>
- **选项**: A) ... / B) ...
- **用户选择**: <选项>
- **原因**: <理由>

## 决策摘要（供后续阶段引用）
<将所有已确认决策整理为一段简洁的约束描述，直接可注入 Codex prompt>
```

---

## 阶段完成后处理协议（强制执行）

每个子Agent返回后，主Agent必须按以下顺序执行所有步骤，不得跳过：

### 步骤 1：提取过程日志
从子Agent输出的「### 过程日志」部分提取内容，追加到 `findings.md` 对应阶段小节（Phase N 分析/规划/实施/审查/测试）。若子Agent未输出过程日志，跳过此步。

### 步骤 2：错误记录
若子Agent报告了错误（过程日志中「遭遇的错误」表格非空且非「无」），将每条错误追加到 `progress.md`「## 错误日志」表格：

```
| [HH:MM] | [阶段名] | [Worker名] | [错误描述] | [尝试次数] | [解决方式] |
```

### 步骤 3：3-Strike 止损检查
统计 `progress.md` 错误日志中**同一 Worker** 的失败记录数：
- **< 3 次**：按「异常处理策略」继续（重试 / 回退）
- **≥ 3 次**：**立即停止自动重试**，调用 `AskUserQuestion` 向用户展示该 Worker 的 3 次失败记录，请求决策（跳过 / 手动执行 / 终止任务）。禁止第 4 次自动重试。

### 步骤 4：计划偏差同步
若子Agent的过程日志中「计划偏差」表格非空且非「无」：
1. 读取 `task_plan.md`
2. 在受影响的子任务描述后追加：`[偏差 HH:MM] 实际执行：<实际行为>。原因：<偏差原因>`
3. 写回 `task_plan.md`

### 步骤 5：会话日志
将本次子Agent调用记录追加到 `progress.md`「## 会话日志」表格：

```
| [HH:MM] | [阶段名] | [Worker名] | [关键动作] | [结果：成功/失败/偏差] |
```

### 步骤 6：进度更新与汇报
更新 `progress.md` 状态字段 + 时间线，向用户输出 1-2 句简短进度汇报。

---

## 沟通守则

1. 在需要询问用户时，尽量使用 `AskUserQuestion` 工具进行交互
2. 每阶段完成后更新 progress.md 并向用户简要汇报进度
3. 异常发生时立即通知用户，提供重试/回退/跳过选项

---

## 执行工作流

**任务描述**：$ARGUMENTS

### Phase 0：初始化

`[模式：初始化]`

#### 0.1 Prompt 增强（必须首先执行）

**Prompt 增强**（按 `/ccg:enhance` 的逻辑执行）：分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准），**用增强结果替代原始 $ARGUMENTS** 用于后续所有阶段。

#### 0.2 Sequential-Thinking 任务分解

调用 `mcp__sequential-thinking__sequentialthinking` 进行结构化思考：

```
mcp__sequential-thinking__sequentialthinking({
  thought: "思考 1/5：梳理核心目标与子目标。\n需求：<增强后的需求>\n分析：核心目标是什么？可以拆分为哪些子目标？",
  thoughtNumber: 1,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

mcp__sequential-thinking__sequentialthinking({
  thought: "思考 2/5：分析子目标间的依赖。\n子目标列表：<thought 1 的输出>\n哪些子目标有前后依赖？哪些可以并行？",
  thoughtNumber: 2,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

mcp__sequential-thinking__sequentialthinking({
  thought: "思考 3/5：识别技术约束和风险。\n子目标 + 依赖：<thought 1-2 的输出>\n技术栈约束？潜在风险？需要用户确认的假设？",
  thoughtNumber: 3,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

mcp__sequential-thinking__sequentialthinking({
  thought: "思考 4/5：确定最优实施顺序。\n综合前 3 步分析，最优实施顺序是什么？哪些步骤可以并行派发子Agent？",
  thoughtNumber: 4,
  totalThoughts: 5,
  nextThoughtNeeded: true
})

mcp__sequential-thinking__sequentialthinking({
  thought: "思考 5/5：输出结构化任务拆解。\n最终任务拆解：\n- 子任务列表（含描述、依赖、预期产出）\n- 实施顺序\n- 风险缓解措施",
  thoughtNumber: 5,
  totalThoughts: 5,
  nextThoughtNeeded: false
})
```

#### 0.3 创建状态文件

1. 创建目录：`.claude/plan/<task-name>/`
2. 写入 `task_plan.md`（sequential-thinking 的任务拆解结果）
3. 写入 `progress.md`（初始状态：`initializing`）
4. 写入 `findings.md`（空模板）
5. 写入 `decisions.md`（空模板，待讨论阶段填充）

#### 0.4 复杂度评估（决定是否进入讨论阶段）

基于 sequential-thinking 的输出，评估以下指标：

| 指标 | 简单 | 复杂 |
|------|------|------|
| 子任务数量 | ≤ 3 | > 3 |
| 涉及文件数 | ≤ 5 | > 5 |
| 是否涉及架构变更 | 否 | 是 |
| 是否有多种可行方案 | 只有一条路 | 有 2+ 备选方案 |
| 风险等级 | 低 | 中/高 |

**判定规则**：
- 任一指标命中"复杂" → 进入讨论阶段（Phase 0.5）
- 全部为"简单"但 Prompt 增强后仍存在模糊点或隐含假设 → 仍进入讨论阶段
- 全部为"简单"且需求完全明确 → 跳过讨论，直接进入 Phase 1

将评估结果写入 `progress.md`，向用户简要告知走哪条路径：
- 跳过讨论：`"任务复杂度：简单（N 个子任务，M 个文件），需求明确，跳过讨论阶段。"`
- 进入讨论：`"进入讨论阶段（原因：...），需要与您澄清 N 个问题后再开始规划。"`

---

### Phase 0.5：讨论与需求澄清（迭代式）

`[模式：讨论]`

> **核心理念**：需求理解是渐进式的，不可能一轮问完。讨论阶段的目标不是"收集决策"，而是**让 Claude 充分理解需求到足以构建可执行计划的程度**。只有当所有模糊点都消除后，才能进入规划阶段。

#### 进入条件

以下任一条件触发讨论阶段（不仅限于"复杂"任务）：
- 复杂度评估为"复杂"
- Prompt 增强后仍存在模糊点、隐含假设或多种可行方案
- sequential-thinking 过程中识别到需要用户确认的假设

#### 讨论循环（迭代执行，非一次性）

```
┌─────────────────────────────────────────┐
│  步骤 A：展示当前理解 + 提出问题        │
│  步骤 B：用户回答                        │
│  步骤 C：更新 decisions.md + 评估完备性  │
│                                          │
│  完备？──否──→ 回到步骤 A（新一轮讨论）  │
│    │                                     │
│    是                                    │
│    ↓                                     │
│  锁定决策集 → 进入 Phase 1              │
└─────────────────────────────────────────┘
```

#### 步骤 A：展示当前理解 + 提出问题

每轮讨论开头，先向用户展示**当前的理解快照**，再提出本轮需要澄清的问题：

```markdown
## 当前理解（第 N 轮）

### 核心目标
<基于已有信息的理解>

### 已确认
- <前几轮已确认的决策/约束>

### 待澄清（本轮问题）
1. <问题 A> — <为什么需要确认：影响范围/备选方案>
2. <问题 B> — <为什么需要确认>
```

然后使用 `AskUserQuestion` 工具提问（每轮 1-4 个问题）：

```
AskUserQuestion({
  questions: [{
    question: "<决策问题>？",
    header: "<决策点名称>",
    options: [
      { label: "方案 A（推荐）", description: "<说明 + 推荐理由>" },
      { label: "方案 B", description: "<说明 + 权衡>" }
    ],
    multiSelect: false
  }]
})
```

**提问规则**：
- 每个问题必须给出 2-4 个选项 + 主Agent的推荐
- 推荐选项放在第一个位置，末尾标注 `（推荐）`
- 如果问题之间有依赖关系，本轮只问前置问题，后续问题留到下一轮
- 用户选"Other"提供自由文本时，充分理解后再进入下一轮

#### 步骤 B：用户回答

用户回答后，立即将每个决策追加到 `decisions.md`。

#### 步骤 C：评估完备性

用户回答后，主Agent评估：**当前信息是否足以构建一个无歧义的实施计划？**

评估标准（全部满足才算完备）：
- [ ] 核心目标明确，无多种解读
- [ ] 技术方案确定，无需再做选择
- [ ] 影响范围已界定，无遗漏模块
- [ ] 用户的回答没有引入新的未知问题
- [ ] 不存在"我先假设 X 是这样"的隐含假设

**若不完备**：回到步骤 A，展示更新后的理解，提出新一轮问题。
**若完备**：进入锁定步骤。

#### 锁定决策集

完备性确认后：

1. 向用户展示最终决策摘要：

```markdown
## 决策摘要（共 N 项）

| # | 决策点 | 用户选择 | 确认轮次 |
|---|--------|----------|----------|
| 1 | <决策点 A> | <选择> | 第 1 轮 |
| 2 | <决策点 B> | <选择> | 第 2 轮 |

以上决策将作为后续规划和实施的硬约束。确认无遗漏？
```

2. 使用 `AskUserQuestion` 做最终确认：

```
AskUserQuestion({
  questions: [{
    question: "以上决策是否完整？确认后将进入规划阶段。",
    header: "锁定决策",
    options: [
      { label: "确认，开始规划", description: "所有决策已完整，进入 Phase 1" },
      { label: "还有补充", description: "我还有需要补充或修改的内容" }
    ],
    multiSelect: false
  }]
})
```

3. 用户确认后：写入完整 `decisions.md`，更新 `progress.md` 状态 → `decisions_confirmed`

**→ 立即自动进入 Phase 1，不等待用户额外指令**

---

### Phase 1：分析（派发子Agent）

`[模式：分析]`

**spawn analyze-worker 子Agent**：

```
Task({
  subagent_type: "general-purpose",
  prompt: "<ANALYZE_WORKER_PROMPT — 见末尾模板，注入增强后的需求和项目上下文>",
  description: "多模型技术分析",
  run_in_background: true
})
```

**等待结果**：

```
TaskOutput({ task_id: "<analyze_task_id>", block: true, timeout: 600000 })
```

**结果处理**：
1. 检查子Agent输出是否完整（非空验证）
2. 追加分析发现到 `findings.md`
3. 更新 `progress.md`：状态 → `analyzing`，记录时间线
4. 提取并保存 `CODEX_SESSION` 和 `CODEX_B_SESSION`
5. 执行「阶段完成后处理协议」

**→ 立即自动进入 Phase 2，不等待用户指令**

---

### Phase 2：规划（派发子Agent）

`[模式：规划]`

**spawn plan-worker 子Agent**：

```
Task({
  subagent_type: "general-purpose",
  prompt: "<PLAN_WORKER_PROMPT — 见末尾模板，注入 analyze-worker 的结论 + SESSION_ID>",
  description: "多模型协作规划"
})
```

**结果处理**：
1. 检查子Agent输出是否完整
2. 更新 `task_plan.md`（填充实施步骤）
3. 更新 `progress.md`：状态 → `planning`，记录时间线
4. 追加规划产出到 `findings.md`
5. 执行「阶段完成后处理协议」

**Hard Stop** -- 展示计划，等待用户确认：

```markdown
## 实施计划

<从 task_plan.md 提取的完整计划内容>

---
**请审查计划，确认后我将开始执行。(Y/N)**
```

用户确认 Y 后 → 更新 `progress.md` 状态为 `confirmed` → **立即自动进入 Phase 3，不等待用户额外指令**

---

### Phase 3：实施（派发子Agent）

`[模式：实施]`

> **硬约束**：本阶段你的**唯一操作**是 spawn execute-worker 子Agent。主Agent禁止直接调用 Edit/Write 修改项目源代码。所有代码编辑由 execute-worker 内部完成。

**spawn execute-worker 子Agent**：

```
Task({
  subagent_type: "general-purpose",
  prompt: "<EXECUTE_WORKER_PROMPT — 见末尾模板，注入计划内容 + SESSION_ID>",
  description: "多模型协作执行"
})
```

**大型任务拆分**：若 `task_plan.md` 包含多个可并行的子任务（文件范围不重叠），可拆分为多个 execute-worker 并行执行：

```
// 子任务 A
Task({
  subagent_type: "general-purpose",
  prompt: "<EXECUTE_WORKER_PROMPT — 注入子任务 A 的计划内容>",
  description: "执行子任务 A",
  run_in_background: true
})

// 子任务 B
Task({
  subagent_type: "general-purpose",
  prompt: "<EXECUTE_WORKER_PROMPT — 注入子任务 B 的计划内容>",
  description: "执行子任务 B",
  run_in_background: true
})
```

**结果处理**：
1. 每个 worker 完成后，追加变更产出到 `findings.md`
2. 更新 `progress.md`：状态 → `executing`，记录时间线
3. 执行「阶段完成后处理协议」

**→ 立即自动进入 Phase 4，不等待用户指令**

---

### Phase 4：审查（派发子Agent）

`[模式：审查]`

**Codex 双模型五维审查** -- spawn review-worker 子Agent（内部并行调用 Codex-A + Codex-B，覆盖安全/性能/架构/代码质量/可维护性全部维度）：

```
Task({
  subagent_type: "general-purpose",
  prompt: "<REVIEW_WORKER_PROMPT — 见末尾模板，注入变更 diff + SESSION_ID>",
  description: "Codex双模型五维审查",
  run_in_background: true
})
```

**等待结果**：

```
TaskOutput({ task_id: "<review_task_id>", block: true, timeout: 600000 })
```

**结果处理**：
1. 检查子Agent输出是否完整（非空验证）
2. 按 Critical / Major / Minor / Suggestion 分级
3. 追加到 `findings.md`
4. 更新 `progress.md`：状态 → `reviewing`，记录时间线
5. 执行「阶段完成后处理协议」

**Critical 问题自动回退**：
- 如有 Critical 问题 → 自动回退到 Phase 3 修复 → 再次审查
- 最多 2 轮回退。2 轮后仍有 Critical → 升级给用户决策

**→ 无 Critical 问题时，立即自动进入 Phase 5，不等待用户指令**

---

### Phase 5：测试（可选，按需派发）

`[模式：测试]`

**spawn test-worker 子Agent**（仅在需要时执行）：

```
Task({
  subagent_type: "general-purpose",
  prompt: "<TEST_WORKER_PROMPT — 见末尾模板，注入变更文件列表>",
  description: "测试生成与验证"
})
```

**结果处理**：
1. 追加测试结果到 `findings.md`
2. 更新 `progress.md`：状态 → `testing`，记录时间线
3. 执行「阶段完成后处理协议」

---

### 完成

1. 更新 `progress.md` 状态为 `complete`，记录最终时间线
2. 向用户输出最终摘要：

```markdown
## 任务完成

### 变更摘要
| 文件 | 操作 | 说明 |
|------|------|------|
| path/to/file | 修改 | 描述 |

### 审查结果
- Codex 交叉审查：<通过/发现 N 个问题>
- 架构审查：<通过/发现 N 个问题>
- 安全审计：<通过/发现 N 个问题>
- 代码质量：<通过/发现 N 个问题>

### 状态文件
- 计划：`.claude/plan/<task-name>/task_plan.md`
- 进度：`.claude/plan/<task-name>/progress.md`
- 发现：`.claude/plan/<task-name>/findings.md`

### 后续建议
1. [ ] <建议的验证步骤>
2. [ ] <建议的测试步骤>
```

---

## 异常处理策略

| 异常场景 | 决策 |
|----------|------|
| 子Agent输出为空 | 重试 1 次（resume 复用会话），仍失败 → 升级给用户 |
| 子Agent超时 | 继续轮询 TaskOutput，绝不 Kill 进程 |
| Critical 审查问题 | 自动回退 Phase 3 修复，最多 2 轮 |
| 2 轮修复后仍有 Critical | 升级给用户，展示问题列表请求决策 |
| 依赖阶段失败 | 终止后续阶段，更新 progress.md，通知用户 |
| 同一 Worker ≥ 3 次失败 | 停止自动重试，AskUserQuestion 展示 3 次失败记录，请用户决策（跳过/手动执行/终止） |
| 执行偏差 | 记录到 findings.md 过程日志 + 更新 task_plan.md 偏差记录，继续执行（偏差≠失败） |

---

## 关键规则

1. **调度不执行** -- 主Agent不直接调用 Codex、不直接编辑项目源码，全部通过子Agent完成
2. **自动流转** -- Phase 0→5 是一次连续执行。除 Phase 2 计划确认外，阶段间自动衔接，不暂停等待用户
3. **源码隔离** -- 主Agent仅可修改 `.claude/plan/` 下的状态文件。项目源码的 Edit/Write 操作只能由 execute-worker 子Agent 执行
4. **状态可追踪** -- 每个阶段更新 progress.md，确保可恢复
5. **代码主权** -- 外部模型对文件系统零写入权限，所有修改由 Claude（子Agent内部）执行
6. **信任规则** -- 双 Codex 交叉验证，综合审查取共识
7. **止损机制** -- 当前阶段输出未验证前，不进入下一阶段

---

## 使用方法

```bash
/manage <任务描述>
```

---

## 子Agent Prompt 模板

以下为 5 个轻量子Agent的完整 prompt 模板。主Agent在 spawn 时，将占位符替换为实际内容：

- `{{TASK_CONTENT}}`：增强后的需求描述
- `{{PROJECT_CONTEXT}}`：项目上下文（从 fast-context 检索）
- `{{SESSION_ID}}`：Codex 会话 ID（用于 resume）
- `{{DECISIONS_CONTENT}}`：已确认决策集（从 decisions.md 读取）
- `{{PLAN_DIR}}`：当前任务的状态目录绝对路径（`.claude/plan/<task-name>/`），由主Agent在 Phase 0.3 创建后确定

---

### analyze-worker

```
你是 CCG 系统的分析工作单元。

## 任务
{{TASK_CONTENT}}

## 上下文
{{PROJECT_CONTEXT}}

## 已确认决策（硬约束）
{{DECISIONS_CONTENT}}
> 以上决策已由用户确认，分析时必须遵守，不得提出与之矛盾的方案。若 DECISIONS_CONTENT 为空，说明是简单任务，无预设决策约束。

## 调用规范

使用 codeagent-wrapper 并行调用 Codex-A（逻辑分析）和 Codex-B（架构分析）。

**步骤 1：上下文检索**

调用 {{MCP_SEARCH_TOOL}} 检索与任务相关的代码上下文：
- 使用自然语言构建语义查询
- 禁止基于假设回答
- 若 MCP 不可用，回退到 Glob + Grep

**步骤 2：并行调用 Codex（必须同时发起两个 Bash 调用）**

Codex-A（逻辑分析）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/analyzer.md
<TASK>
需求：{{TASK_CONTENT}}
上下文：<检索到的代码上下文>
视角：后端逻辑分析——技术可行性、性能考量、潜在风险、边界条件
</TASK>
OUTPUT: JSON格式的分析结果，含 feasibility / risks / recommendations
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-A 逻辑分析"
})

Codex-B（架构分析）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/analyzer.md
<TASK>
需求：{{TASK_CONTENT}}
上下文：<检索到的代码上下文>
视角：架构设计分析——架构影响、模块划分、可扩展性、设计一致性
</TASK>
OUTPUT: JSON格式的分析结果，含 architecture_impact / module_design / recommendations
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-B 架构分析"
})

**步骤 3：等待结果**

TaskOutput({ task_id: "<codex_a_task_id>", block: true, timeout: 600000 })
TaskOutput({ task_id: "<codex_b_task_id>", block: true, timeout: 600000 })

输出丢失检测：
- TaskOutput 返回后立即检查 <output> 是否为空
- 若为空但 exit_code: 0，用 Read 工具读取输出文件
- 若临时文件已清理，用 Glob 查找 ~/.claude/.ccg/outputs/*.txt
- 禁止跳过空输出

**步骤 4：交叉验证**

综合 Codex-A + Codex-B 的分析结果：
1. 识别一致观点（强信号）
2. 识别分歧点（需权衡）
3. 互补优势取最优

## 输出格式
返回结构化 Markdown 结果，不与用户交互：

```markdown
## 分析结果

### 一致观点
<双方都认同的核心结论>

### 分歧点
| 议题 | Codex-A 观点 | Codex-B 观点 | 建议 |
|------|-------------|-------------|------|

### 核心结论
<1-2 句话总结>

### SESSION_ID
- CODEX_SESSION: <session_id>
- CODEX_B_SESSION: <session_id>

### 过程日志

#### 遭遇的错误
| 错误描述 | 尝试次数 | 解决方式 |
|----------|----------|----------|
<无错误则填：无>

#### 关键执行发现
<执行中遇到的非预期情况：Codex 输出异常、上下文不足、工具调用失败等>

#### 计划偏差
| 预期行为 | 实际行为 | 偏差原因 |
|----------|----------|----------|
<无偏差则填：无>
```
```

---

### plan-worker

```
你是 CCG 系统的规划工作单元。

## 任务
{{TASK_CONTENT}}

## 上下文
{{PROJECT_CONTEXT}}

## 分析阶段结论
{{ANALYZE_FINDINGS}}

## 已确认决策（硬约束）
{{DECISIONS_CONTENT}}
> 以上决策已由用户确认并锁定。规划时必须严格遵守这些决策，Plan 只需梳理执行步骤，不得重新做已确认的决策。若 DECISIONS_CONTENT 为空，说明是简单任务，无预设决策约束。

## 调用规范

使用 codeagent-wrapper 并行调用 Codex-A（后端规划）和 Codex-B（架构规划），复用分析阶段的会话。

**并行调用 Codex（必须同时发起两个 Bash 调用）**

Codex-A（后端规划）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume {{CODEX_SESSION}} - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/architect.md
<TASK>
需求：{{TASK_CONTENT}}
上下文：{{ANALYZE_FINDINGS}}
视角：后端实施规划——数据流、边界条件、错误处理、测试策略
</TASK>
OUTPUT: Step-by-step implementation plan with pseudo-code. DO NOT modify any files.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-A 后端规划"
})

Codex-B（架构规划）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume {{CODEX_B_SESSION}} - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/architect.md
<TASK>
需求：{{TASK_CONTENT}}
上下文：{{ANALYZE_FINDINGS}}
视角：架构设计规划——架构设计、模块划分、可扩展性、一致性
</TASK>
OUTPUT: Step-by-step implementation plan with pseudo-code. DO NOT modify any files.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-B 架构规划"
})

**等待结果**

TaskOutput({ task_id: "<codex_a_task_id>", block: true, timeout: 600000 })
TaskOutput({ task_id: "<codex_b_task_id>", block: true, timeout: 600000 })

输出丢失检测：同 analyze-worker 步骤。

**交叉验证 + 综合规划**

综合双方规划，生成最优实施计划。

## 输出格式
返回结构化 Markdown 结果，不与用户交互：

```markdown
## 实施计划

### 技术方案
<综合 Codex-A + Codex-B 的最优方案>

### 实施步骤
1. <步骤 1> - 预期产物
2. <步骤 2> - 预期产物
...

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| path/to/file:L10-L50 | 修改 | 描述 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|

### SESSION_ID
- CODEX_SESSION: <session_id>
- CODEX_B_SESSION: <session_id>

### 过程日志

#### 遭遇的错误
| 错误描述 | 尝试次数 | 解决方式 |
|----------|----------|----------|
<无错误则填：无>

#### 关键执行发现
<执行中遇到的非预期情况：Codex 输出异常、上下文不足、工具调用失败等>

#### 计划偏差
| 预期行为 | 实际行为 | 偏差原因 |
|----------|----------|----------|
<无偏差则填：无>
```
```

---

### execute-worker

```
你是 CCG 系统的执行工作单元。

## 任务
{{TASK_CONTENT}}

## 上下文
{{PROJECT_CONTEXT}}

## 已确认决策（硬约束）
{{DECISIONS_CONTENT}}

## 实施计划
{{PLAN_CONTENT}}

## 调用规范

**步骤 0：读取计划文件（必须首先执行）**

在任何操作前，读取状态文件确认任务范围和约束：

```
Read({ file_path: "{{PLAN_DIR}}/task_plan.md" })
Read({ file_path: "{{PLAN_DIR}}/decisions.md" })
```

从读取结果中确认：
- 你的子任务范围（仅处理分配给你的部分，不得扩大范围）
- 已确认的技术决策约束（与 DECISIONS_CONTENT 交叉核对）
- 允许修改的关键文件列表

**若即将操作的文件不在 task_plan.md 的关键文件列表中** → 在过程日志的「计划偏差」中记录后再继续。

使用 codeagent-wrapper 调用 Codex 获取 Unified Diff Patch 原型，然后由 Claude 重构为生产级代码。

**步骤 1：获取原型**

Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume {{CODEX_SESSION}} - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/architect.md
<TASK>
需求：{{TASK_CONTENT}}
上下文：{{PLAN_CONTENT}}
目标文件：<从计划中提取的关键文件列表>
</TASK>
OUTPUT: Unified Diff Patch ONLY. Strictly prohibit any actual modifications.
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex 原型获取"
})

TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })

输出丢失检测：同 analyze-worker 步骤。

**步骤 2：Claude 重构与应用**

1. 解析 Codex 返回的 Unified Diff Patch
2. 模拟应用 Diff，检查逻辑一致性
3. 重构为生产级代码（去除冗余、符合项目规范）
4. 变更仅限需求范围，强制审查副作用
5. 使用 Edit/Write 工具执行实际修改

**步骤 3：自检验证**

运行项目既有的 lint/typecheck/tests（优先最小相关范围）。

## 输出格式
返回结构化 Markdown 结果，不与用户交互：

```markdown
## 执行结果

### 变更文件
| 文件 | 操作 | 说明 |
|------|------|------|
| path/to/file | 修改 | 描述 |

### Diff 摘要
<关键变更的 diff 片段>

### 自检结果
- lint: <通过/失败>
- typecheck: <通过/失败>
- tests: <通过/失败/未配置>

### 修改文件实际范围
<与 task_plan.md 关键文件列表对比：是否有新增、遗漏或超出范围的文件操作>

### 过程日志

#### 遭遇的错误
| 错误描述 | 尝试次数 | 解决方式 |
|----------|----------|----------|
<无错误则填：无>

#### 关键执行发现
<执行中遇到的非预期情况：Codex 输出异常、上下文不足、工具调用失败等>

#### 计划偏差
| 预期行为 | 实际行为 | 偏差原因 |
|----------|----------|----------|
<无偏差则填：无>
```
```

---

### review-worker

```
你是 CCG 系统的审查工作单元。

## 任务
审查以下代码变更，进行 Codex 双模型交叉验证。

## 变更内容
{{DIFF_CONTENT}}

## 调用规范

使用 codeagent-wrapper 并行调用 Codex-A 和 Codex-B，双视角覆盖 5 个审查维度：

| 维度 | Codex-A | Codex-B |
|------|---------|---------|
| 安全性 | 注入风险、敏感信息泄露、权限校验 | — |
| 性能 | 算法复杂度、资源泄漏、并发问题 | — |
| 逻辑正确性 | 边界条件、错误处理、数据流 | — |
| 架构一致性 | — | 模块划分、设计模式、可扩展性 |
| 代码质量 | — | 可读性、可维护性、测试覆盖、命名规范 |

**并行调用 Codex（必须同时发起两个 Bash 调用）**

Codex-A（安全 + 性能 + 逻辑正确性）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume {{CODEX_SESSION}} - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/reviewer.md
<TASK>
审查以下代码变更：
{{DIFF_CONTENT}}
你负责 3 个维度的审查，每个维度独立输出：
1. **安全性**：注入风险（SQL/XSS/命令注入）、敏感信息泄露、权限校验缺失、OWASP Top 10
2. **性能**：算法复杂度、资源泄漏（内存/文件句柄/连接）、并发竞态、不必要的开销
3. **逻辑正确性**：边界条件、错误处理遗漏、数据流断裂、空值/异常路径
</TASK>
OUTPUT: 按 Critical/Major/Minor/Suggestion 分类列出问题，每条标注所属维度 [安全/性能/逻辑]，JSON 格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-A 安全+性能+逻辑审查"
})

Codex-B（架构一致性 + 代码质量）:
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex resume {{CODEX_B_SESSION}} - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/reviewer.md
<TASK>
审查以下代码变更：
{{DIFF_CONTENT}}
你负责 2 个维度的审查，每个维度独立输出：
1. **架构一致性**：模块划分合理性、设计模式一致性、接口设计、可扩展性、与项目现有架构的契合度
2. **代码质量**：可读性、可维护性、命名规范、错误处理风格、测试覆盖建议、重复代码
</TASK>
OUTPUT: 按 Critical/Major/Minor/Suggestion 分类列出问题，每条标注所属维度 [架构/质量]，JSON 格式
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex-B 架构+质量审查"
})

**等待结果**

TaskOutput({ task_id: "<codex_a_task_id>", block: true, timeout: 600000 })
TaskOutput({ task_id: "<codex_b_task_id>", block: true, timeout: 600000 })

输出丢失检测：同 analyze-worker 步骤。

**交叉验证 + 去重合并**

综合双方审查结果，按严重程度分级，去重合并。

## 输出格式
返回结构化 Markdown 结果，不与用户交互：

```markdown
## 审查结果（5 维度 × 双模型交叉验证）

### Critical (N issues) - 必须修复
- [安全] file.ts:42 - 描述 — [Codex-A]
- [逻辑] api.ts:15 - 描述 — [Codex-A]

### Major (N issues) - 建议修复
- [性能] service.ts:88 - 描述 — [Codex-A]
- [架构] router.ts:30 - 描述 — [Codex-B]

### Minor (N issues) - 可选修复
- [质量] utils.ts:20 - 描述 — [Codex-B]

### Suggestion (N items)
- [质量] helper.ts:55 - 描述 — [Codex-B]

### 维度覆盖
| 维度 | 来源 | 发现数 |
|------|------|--------|
| 安全性 | Codex-A | N |
| 性能 | Codex-A | N |
| 逻辑正确性 | Codex-A | N |
| 架构一致性 | Codex-B | N |
| 代码质量 | Codex-B | N |

### SESSION_ID
- CODEX_SESSION: <session_id>
- CODEX_B_SESSION: <session_id>

### 过程日志

#### 遭遇的错误
| 错误描述 | 尝试次数 | 解决方式 |
|----------|----------|----------|
<无错误则填：无>

#### 关键执行发现
<执行中遇到的非预期情况：Codex 输出异常、上下文不足、工具调用失败等>

#### 计划偏差
| 预期行为 | 实际行为 | 偏差原因 |
|----------|----------|----------|
<无偏差则填：无>
```
```

---

### test-worker

```
你是 CCG 系统的测试工作单元。

## 任务
为以下变更文件生成测试并验证。

## 变更文件列表
{{CHANGED_FILES}}

## 上下文
{{PROJECT_CONTEXT}}

## 调用规范

使用 codeagent-wrapper 调用 Codex 生成测试。

**步骤 1：生成测试**

Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend codex - \"$(pwd)\" <<'EOF'
ROLE_FILE: ~/.claude/.ccg/prompts/codex/tester.md
<TASK>
为以下文件生成测试：
{{CHANGED_FILES}}
上下文：{{PROJECT_CONTEXT}}
要求：
- 遵循项目现有测试框架和风格
- 覆盖正常路径 + 边界条件 + 异常处理
- 测试应自解释，非必要不加注释
</TASK>
OUTPUT: 完整的测试代码（含文件路径和内容）
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex 测试生成"
})

TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })

输出丢失检测：同 analyze-worker 步骤。

**步骤 2：应用测试文件**

使用 Edit/Write 工具写入测试文件。

**步骤 3：运行测试**

执行项目的测试命令，收集结果。

## 输出格式
返回结构化 Markdown 结果，不与用户交互：

```markdown
## 测试结果

### 生成的测试文件
| 文件 | 测试数量 | 说明 |
|------|----------|------|
| path/to/test.ts | N | 描述 |

### 运行结果
- 通过：N
- 失败：N
- 跳过：N

### 失败详情（如有）
- test_name: <失败原因>

### 过程日志

#### 遭遇的错误
| 错误描述 | 尝试次数 | 解决方式 |
|----------|----------|----------|
<无错误则填：无>

#### 关键执行发现
<执行中遇到的非预期情况：Codex 输出异常、上下文不足、工具调用失败等>

#### 计划偏差
| 预期行为 | 实际行为 | 偏差原因 |
|----------|----------|----------|
<无偏差则填：无>
```
```
