---
description: '多模型协作规划 - 上下文检索 + 双模型分析 → 生成 Step-by-step 实施计划'
---

# Plan - 多模型协作规划

$ARGUMENTS

---

## 核心协议

- **语言协议**：与工具/模型交互用**英语**，与用户交互用**中文**
- **强制并行**：Codex 调用必须使用 `run_in_background: true`（包含单模型调用，避免阻塞主线程）
- **代码主权**：外部模型对文件系统**零写入权限**，所有修改由 Claude 执行
- **止损机制**：当前阶段输出通过验证前，不进入下一阶段
- **仅规划**：本命令允许读取上下文与写入 `.claude/plan/*` 计划文件，但**禁止修改产品代码**

---

## 多模型调用规范

> **必须先读取共享规范**：使用 Read 工具读取 `~/.claude/.ccg/shared/multi-model-spec.md` 获取调用语法、等待规范、输出丢失检测等通用规范。读取后严格遵循其中的规范执行。

**角色提示词**：

| 阶段 | Codex-A | Codex-B |
|------|---------|---------|
| 分析 | `~/.claude/.ccg/prompts/codex/analyzer.md` | `~/.claude/.ccg/prompts/codex/analyzer.md` |
| 规划 | `~/.claude/.ccg/prompts/codex/architect.md` | `~/.claude/.ccg/prompts/codex/architect.md` |

**会话复用**：每次调用返回 `SESSION_ID: xxx`（通常由 wrapper 输出），**必须保存**以供后续 `/ccg:execute` 使用。

---

## 执行工作流

**规划任务**：$ARGUMENTS

### 🔍 Phase 1：上下文全量检索

`[模式：研究]`

#### 1.1 Prompt 增强（必须首先执行）

**Prompt 增强**（按 `/ccg:enhance` 的逻辑执行）：分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准），**用增强结果替代原始 $ARGUMENTS** 用于后续所有阶段。

#### 1.2 上下文检索

**调用 `{{MCP_SEARCH_TOOL}}` 工具**：

```
{{MCP_SEARCH_TOOL}}({
  query: "<基于增强后需求构建的语义查询>",
  {{MCP_PATH_PARAM}}: "{{WORKDIR}}"
})
```

- 使用自然语言构建语义查询（Where/What/How）
- **禁止基于假设回答**
- 若 MCP 不可用：回退到 Glob + Grep 进行文件发现与关键符号定位

#### 1.3 完整性检查

- 必须获取相关类、函数、变量的**完整定义与签名**
- 若上下文不足，触发**递归检索**
- 优先输出：入口文件 + 行号 + 关键符号名；必要时补充最小代码片段（仅用于消除歧义）

#### 1.4 需求对齐

- 若需求仍有模糊空间，**必须**向用户输出引导性问题列表
- 直至需求边界清晰（无遗漏、无冗余）

#### 1.4.5 方案探索（必须执行）

在生成计划前，提出 **2-3 种实现路径** 供对比：

| 方案 | 核心思路 | 优势 | 劣势 | 推荐度 |
|------|---------|------|------|--------|
| A    | ...     | ...  | ...  | ★★★   |
| B    | ...     | ...  | ...  | ★★☆   |
| C    | ...     | ...  | ...  | ★☆☆   |

**推荐方案**：<方案X>，理由：<...>

若用户未明确指定方案，默认采用推荐方案继续。（用户有 10 秒窗口在终端中止并选择其他方案，否则自动继续）

#### 1.5 结构化需求分解

**使用 sequential-thinking 分解需求为结构化任务**：

基于增强后的需求和检索到的上下文，调用 `mcp__sequential-thinking__sequentialthinking` 进行链式推理：

1. **目标拆解**（thought 1）：识别核心目标与子目标
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "核心目标：<...>。子目标拆解：1) ... 2) ... 3) ...",
     thoughtNumber: 1,
     totalThoughts: 5,
     nextThoughtNeeded: true
   })
   ```

2. **依赖分析**（thought 2）：分析子目标间的依赖关系
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "依赖关系：子目标1 → 子目标2（因为...），子目标3 独立可并行",
     thoughtNumber: 2,
     totalThoughts: 5,
     nextThoughtNeeded: true
   })
   ```

3. **约束识别**（thought 3）：识别技术约束和兼容性要求
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "技术约束：1) 必须兼容... 2) 不能破坏... 3) 性能要求...",
     thoughtNumber: 3,
     totalThoughts: 5,
     nextThoughtNeeded: true
   })
   ```

4. **风险评估**（thought 4）：识别实施风险和缓解方案
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "风险点：1) ... → 缓解：... 2) ... → 缓解：...",
     thoughtNumber: 4,
     totalThoughts: 5,
     nextThoughtNeeded: true
   })
   ```

5. **实施排序**（thought 5）：确定最优实施顺序
   ```
   mcp__sequential-thinking__sequentialthinking({
     thought: "推荐实施顺序：Step1 → Step2 → Step3（可与Step4并行）→ Step5。理由：...",
     thoughtNumber: 5,
     totalThoughts: 5,
     nextThoughtNeeded: false
   })
   ```

**产出**：结构化任务拆解（含依赖图 + 约束 + 风险），作为 Phase 2 Codex 双模型分析的附加输入。

### 💡 Phase 2：多模型协作分析

`[模式：分析]`

#### 2.1 分发输入

**并行调用** Codex-A 和 Codex-B（`run_in_background: true`）：

将**原始需求**（不带预设观点）分发给两个模型：

1. **Codex-A 后端分析**：
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/analyzer.md`
   - 关注：技术可行性、架构影响、性能考量、潜在风险
   - 输入包含 sequential-thinking 的需求分解结果，请基于此进行深度分析
   - OUTPUT: 多角度解决方案 + 优劣势分析

2. **Codex-B 架构分析**：
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/analyzer.md`
   - 关注：架构/设计影响、模块划分、可扩展性
   - 输入包含 sequential-thinking 的需求分解结果，请基于此进行深度分析
   - OUTPUT: 多角度解决方案 + 优劣势分析

用 `TaskOutput` 等待两个模型的完整结果。**📌 保存 SESSION_ID**（`CODEX_SESSION` 和 `CODEX_B_SESSION`）。

#### 2.2 交叉验证

整合各方思路，进行迭代优化：

1. **识别一致观点**（强信号）
2. **识别分歧点**（需权衡）
3. **互补优势**：双 Codex 交叉验证，综合两方分析取最优
4. **逻辑推演**：消除方案中的逻辑漏洞

#### 2.3（可选但推荐）双模型产出“计划草案”

为降低 Claude 合成计划的遗漏风险，可并行让两个模型输出“计划草案”（仍然**不允许**修改文件）：

1. **Codex-A 计划草案**（后端权威）：
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/architect.md`
   - OUTPUT: Step-by-step plan + pseudo-code（重点：数据流/边界条件/错误处理/测试策略）

2. **Codex-B 计划草案**（架构视角）：
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/architect.md`
   - OUTPUT: Step-by-step plan + pseudo-code（重点：架构设计/模块划分/可扩展性/一致性）

用 `TaskOutput` 等待两个模型的完整结果，并记录其建议的关键差异点。

#### 2.4 生成实施计划（Claude 最终版）

综合双方分析，生成 **Step-by-step 实施计划**：

```markdown
## 📋 实施计划：<任务名称>

> **执行提示（供 /ccg:execute 使用）**：使用 `executing-plans` 模式逐任务执行，每个 Task 完成后进行验证再继续。

**目标：** [一句话描述]
**架构方案：** [2-3 句，说明整体技术路径]
**技术栈：** [关键库/框架]
**预计任务数：** [N]

---

### 任务类型
- [ ] 后端 (→ Codex)
- [ ] 架构/设计 (→ Codex)
- [ ] 全栈 (→ 并行)

### 技术方案
<综合 Codex-A + Codex-B 分析的最优方案>

### 实施步骤

**粒度要求**（每个步骤必须是 2-5 分钟的单一操作）：
- "修改文件 X 的函数 Y，增加边界检查" — 合格
- "实现用户认证模块" — 不合格，必须拆分
每个步骤必须包含：操作描述 + 涉及文件（精确到行号范围）+ 预期产物/验证命令

1. <步骤 1> - 预期产物
2. <步骤 2> - 预期产物
...

### 关键文件
| 文件 | 操作 | 说明 |
|------|------|------|
| path/to/file.ts:L10-L50 | 修改 | 描述 |

### 风险与缓解
| 风险 | 缓解措施 |
|------|----------|

### SESSION_ID（供 /ccg:execute 使用）
- CODEX_SESSION: <session_id>
- CODEX_B_SESSION: <session_id>
```

### ⛔ Phase 2 结束：计划交付（非执行）

**`/ccg:plan` 的职责到此结束，必须执行以下动作**：

1. 向用户展示完整实施计划（含伪代码）
2. 将计划保存至 `.claude/plan/<功能名>.md`（功能名从需求中提取，如 `user-auth`、`payment-module` 等）
3. 以**加粗文本**输出提示（必须使用实际保存的文件路径）：

   ---
   **📋 计划已生成并保存至 `.claude/plan/实际功能名.md`**

   **请审查上述计划，您可以：**
   - 🔧 **修改计划**：告诉我需要调整的部分，我会更新计划
   - ▶️ **执行计划**：复制以下命令到新会话执行

   ```
   /ccg:execute .claude/plan/实际功能名.md
   ```
   ---

   **⚠️ 注意**：上面的 `实际功能名.md` 必须替换为你实际保存的文件名！

4. **立即终止当前回复**（Stop here. No more tool calls.）

**⚠️ 绝对禁止**：
- ❌ 问用户 "Y/N" 然后自动执行（执行是 `/ccg:execute` 的职责）
- ❌ 对产品代码进行任何写操作
- ❌ 自动调用 `/ccg:execute` 或任何实施动作
- ❌ 在用户未明确要求修改时继续触发模型调用

---

## 计划保存

规划完成后，将计划保存至：

- **首次规划**：`.claude/plan/<功能名>.md`
- **迭代版本**：`.claude/plan/<功能名>-v2.md`、`.claude/plan/<功能名>-v3.md`...

计划文件写入应在向用户展示计划前完成。

---

## 计划修改流程

如果用户要求修改计划：

1. 根据用户反馈调整计划内容
2. 更新 `.claude/plan/<功能名>.md` 文件
3. 重新展示修改后的计划
4. 再次提示用户审查或执行

---

## 后续步骤

用户审查满意后，**手动**执行：

```bash
/ccg:execute .claude/plan/<功能名>.md
```

---

## 关键规则

1. **仅规划不实施** – 本命令不执行任何代码变更
2. **不问 Y/N** – 只展示计划，让用户决定下一步
3. **信任规则** – 双 Codex 交叉验证
4. 外部模型对文件系统**零写入权限**
5. **SESSION_ID 交接** – 计划末尾必须包含 `CODEX_SESSION` / `CODEX_B_SESSION`（供 `/ccg:execute resume <SESSION_ID>` 使用）
