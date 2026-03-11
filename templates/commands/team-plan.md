---
description: 'Agent Teams 规划 - Lead 调用 Codex 并行分析，产出零决策并行实施计划'
---
<!-- CCG:TEAM:PLAN:START -->
**Core Philosophy**
- 产出的计划必须让 Builder teammates 能无决策机械执行。
- 每个子任务的文件范围必须隔离，确保并行不冲突。
- 多模型协作是强制的：Codex（后端权威）+ Codex（架构视角）。

**Guardrails**
- 多模型分析是 **mandatory**：必须同时调用两个 Codex 实例（后端 + 架构）。
- 不写产品代码，只做分析和规划。
- 计划文件必须包含 Codex 的实际分析摘要。
- 使用 `AskUserQuestion` 解决任何歧义。

**Steps**
1. **上下文收集**
   - 用 Glob/Grep/Read 分析项目结构、技术栈、现有代码模式。
   - 如果 `{{MCP_SEARCH_TOOL}}` 可用，优先语义检索。
   - 整理出：技术栈、目录结构、关键文件、现有模式。
   - **会话复用检查**：读取 `.claude/team-plan/<任务名>-research.md`，检查是否包含 `Codex Sessions` 部分。若存在 `CODEX_RESEARCH_SESSION` 和 `CODEX_B_RESEARCH_SESSION`，在步骤 2 中使用 `--SESSION_ID` 复用会话，避免重新扫描项目。

2. **多模型并行分析（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用，`run_in_background: true`。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。
   - **会话复用**：若步骤 1 获取到 `CODEX_RESEARCH_SESSION` / `CODEX_B_RESEARCH_SESSION`，分别在下面对应命令的 `--sandbox read-only` 后追加 `--SESSION_ID <...>`。
   - **环境准备**：首次调用前解析 codex_bridge.py 路径：
   ```
   Bash({
     command: "P=\"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"; R=$(ls -1d \"$P\"/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); B=\"$R/scripts/codex_bridge.py\"; echo \"PLUGIN_ROOT=$R\"; [ -f \"$B\" ] && echo \"BRIDGE=$B OK\" || echo 'BRIDGE MISSING'",
     description: "解析 codex_bridge.py 路径"
   })
   ```

   **FIRST Bash call (Codex)**（若有 SESSION_ID 则复用，否则新会话）:
   ```
   Bash({
     command: "python \"<BRIDGE>\" --cd \"{{WORKDIR}}\" --role \"<PLUGIN_ROOT>/prompts/codex/analyzer.md\" --sandbox read-only --PROMPT '需求：$ARGUMENTS\n上下文：<步骤1收集的项目结构和关键代码>\nOUTPUT:\n1) 技术可行性评估\n2) 推荐架构方案（精确到文件和函数）\n3) 详细实施步骤\n4) 风险评估'",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 后端分析"
   })
   ```

   **SECOND Bash call (Codex) - IN THE SAME MESSAGE**（若有 SESSION_ID 则复用，否则新会话）:
   ```
   Bash({
     command: "python \"<BRIDGE>\" --cd \"{{WORKDIR}}\" --role \"<PLUGIN_ROOT>/prompts/codex/analyzer.md\" --sandbox read-only --PROMPT '需求：$ARGUMENTS\n上下文：<步骤1收集的项目结构和关键代码>\nOUTPUT:\n1) 架构设计方案\n2) 组件拆分建议（精确到文件和函数）\n3) 详细实施步骤\n4) 设计要点'",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 架构分析"
   })
   ```

   **等待结果**:
   ```
   TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })
   TaskOutput({ task_id: "<codex_task_id_2>", block: true, timeout: 600000 })
   ```

   - 必须指定 `timeout: 600000`，否则默认 30 秒会提前超时。
   - 若 10 分钟后仍未完成，继续轮询，**绝对不要 Kill 进程**。

   **输出处理**：
   - codex_bridge.py 返回 JSON，从 `agent_messages` 读取 Codex 分析结果。
   - 若 `success: false`，检查 `error` 字段，用 `--return-all-messages` 重跑获取完整信息。

   **📌 保存 SESSION_ID**：从 JSON 输出的 `SESSION_ID` 字段提取，分别保存为 `CODEX_PLAN_SESSION` 和 `CODEX_B_PLAN_SESSION`，供后续 `/ccg:team-review` 复用。

3. **综合分析 + 任务拆分**
   - 综合两个 Codex 实例的分析结果，取最优方案。
   - 拆分为独立子任务，每个子任务：
     * 文件范围不重叠（**强制**）
     * 如果无法避免重叠 → 设为依赖关系
     * 有具体实施步骤和验收标准
   - 按依赖关系分 Layer：同 Layer 可并行，跨 Layer 串行。

4. **写入计划文件**
   - 路径：`.claude/team-plan/<任务名>.md`（英文短横线命名）
   - 格式：

   ```markdown
   # Team Plan: <任务名>

   ## 概述
   <一句话描述>

   ## Codex 后端分析摘要
   <Codex 后端实例返回的关键内容>

   ## Codex 架构分析摘要
   <Codex 架构实例返回的关键内容>

   ## 技术方案
   <综合最优方案，含关键技术决策>

   ## 子任务列表

   ### Task 1: <名称>
   - **类型**: 前端/后端
   - **文件范围**: <精确文件路径列表>
   - **依赖**: 无 / Task N
   - **实施步骤**:
     1. <具体步骤>
     2. <具体步骤>
   - **验收标准**: <怎么算完成>

   ### Task 2: <名称>
   ...

   ## 文件冲突检查
   ✅ 无冲突 / 已通过依赖关系解决

   ## 并行分组
   - Layer 1 (并行): Task 1, Task 2
   - Layer 2 (依赖 Layer 1): Task 3

   ## Codex Sessions（供后续阶段复用）
   - CODEX_PLAN_SESSION: <session_id>
   - CODEX_B_PLAN_SESSION: <session_id>
   ```

5. **用户确认**
   - 展示计划摘要（子任务数、并行分组、Builder 数量）。
   - 用 `AskUserQuestion` 请求确认。
   - 确认后提示：`计划已就绪，运行 /ccg:team-exec 开始并行实施`

6. **上下文检查点**
   - 报告当前上下文使用量。
   - 如果接近 80K：建议 `/clear` 后运行 `/ccg:team-exec`。

**Exit Criteria**
- [ ] Codex 分析完成（后端 + 架构两个维度）
- [ ] 子任务文件范围无冲突
- [ ] 计划文件已写入 `.claude/team-plan/`
- [ ] 用户已确认计划
<!-- CCG:TEAM:PLAN:END -->
