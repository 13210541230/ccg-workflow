---
description: 'Agent Teams 需求研究 - 并行探索代码库，产出约束集 + 可验证成功判据'
---
<!-- CCG:TEAM:RESEARCH:START -->
**Core Philosophy**
- Research 产出的是**约束集**，不是信息堆砌。每条约束缩小解决方案空间。
- 约束告诉后续阶段"不要考虑这个方向"，使 plan 阶段能产出零决策计划。
- 输出：约束集合 + 可验证的成功判据，写入 `.claude/team-plan/<任务名>-research.md`。

**Guardrails**
- **STOP! BEFORE ANY OTHER ACTION**: 必须先做 Prompt 增强。
- 按上下文边界（context boundaries）划分探索范围，不按角色划分。
- 多模型协作是 **mandatory**：Codex（后端边界）+ Codex（架构视角）。
- 不做架构决策——只发现约束。
- 使用 `AskUserQuestion` 解决任何歧义，绝不假设。

**Steps**
0. **MANDATORY: Prompt 增强**
   - **立即执行，不可跳过。**
   - 分析 $ARGUMENTS 的意图、缺失信息、隐含假设，补全为结构化需求（明确目标、技术约束、范围边界、验收标准）。
   - 后续所有步骤使用增强后的需求。

1. **代码库评估**
   - 用 Glob/Grep/Read 扫描项目结构。
   - 判断项目规模：单目录 vs 多目录。
   - 识别技术栈、框架、现有模式。

2. **定义探索边界（按上下文划分）**
   - 识别自然的上下文边界（不是功能角色）：
     * 边界 1：用户域代码（models, services, UI）
     * 边界 2：认证与授权（middleware, session, tokens）
     * 边界 3：基础设施（configs, builds, deployments）
   - 每个边界应自包含，无需跨边界通信。

3. **多模型并行探索（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。

   **FIRST Bash call (Codex)**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/$CCG_BACKEND/analyzer.md\n<TASK>\n需求：<增强后的需求>\n探索范围：后端相关上下文边界\n</TASK>\nOUTPUT (JSON):\n{\n  \"module_name\": \"探索的上下文边界\",\n  \"existing_structures\": [\"发现的关键模式\"],\n  \"existing_conventions\": [\"使用中的规范\"],\n  \"constraints_discovered\": [\"限制解决方案空间的硬约束\"],\n  \"open_questions\": [\"需要用户确认的歧义\"],\n  \"dependencies\": [\"跨模块依赖\"],\n  \"risks\": [\"潜在阻碍\"],\n  \"success_criteria_hints\": [\"可观测的成功行为\"]\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 后端探索"
   })
   ```

   **SECOND Bash call (Codex) - IN THE SAME MESSAGE**:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/$CCG_BACKEND/analyzer.md\n<TASK>\n需求：<增强后的需求>\n探索范围：架构设计相关上下文边界\n</TASK>\nOUTPUT (JSON):\n{\n  \"module_name\": \"探索的上下文边界\",\n  \"existing_structures\": [\"发现的关键模式\"],\n  \"existing_conventions\": [\"使用中的规范\"],\n  \"constraints_discovered\": [\"限制解决方案空间的硬约束\"],\n  \"open_questions\": [\"需要用户确认的歧义\"],\n  \"dependencies\": [\"跨模块依赖\"],\n  \"risks\": [\"潜在阻碍\"],\n  \"success_criteria_hints\": [\"可观测的成功行为\"]\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 架构探索"
   })
   ```

   **等待结果**:
   ```
   TaskOutput({ task_id: "<codex_task_id>", block: true, timeout: 600000 })
   TaskOutput({ task_id: "<codex_task_id_2>", block: true, timeout: 600000 })
   ```

   **输出丢失检测**（⚠️ 必须执行）：
   - 每次 `TaskOutput` 返回后，**立即检查 `<output>` 部分是否为空或缺失**。
   - 若输出为空但 `exit_code: 0`：先用 `Read` 工具读取输出文件（路径在启动时的 `Output is being written to:` 中，使用 Windows 绝对路径格式）。若临时文件已清理，用 `Glob` 查找 `~/.claude/.ccg/outputs/*.txt` 读取最新文件。若仍无，用相同命令重新调用（resume 复用会话）。
   - **禁止**：跳过空输出继续下一阶段、用 `cat` 命令读文件。

   **📌 保存 SESSION_ID**：从 Codex 输出中提取 `SESSION_ID`，分别保存为 `CODEX_RESEARCH_SESSION` 和 `CODEX_B_RESEARCH_SESSION`，供后续 `/ccg:team-plan` 复用。

4. **聚合与综合**
   - 合并所有探索输出为统一约束集：
     * **硬约束**：技术限制、不可违反的模式
     * **软约束**：惯例、偏好、风格指南
     * **依赖**：影响实施顺序的跨模块关系
     * **风险**：需要缓解的阻碍

5. **歧义消解**
   - 编译优先级排序的开放问题列表。
   - 用 `AskUserQuestion` 系统性地呈现：
     * 分组相关问题
     * 为每个问题提供上下文
     * 在适用时建议默认值
   - 将用户回答转化为额外约束。

6. **写入研究文件**
   - 路径：`.claude/team-plan/<任务名>-research.md`
   - 格式：

   ```markdown
   # Team Research: <任务名>

   ## 增强后的需求
   <结构化需求描述>

   ## 约束集

   ### 硬约束
   - [HC-1] <约束描述> — 来源：<Codex/用户>
   - [HC-2] ...

   ### 软约束
   - [SC-1] <约束描述> — 来源：<Codex/用户>
   - [SC-2] ...

   ### 依赖关系
   - [DEP-1] <模块A> → <模块B>：<原因>

   ### 风险
   - [RISK-1] <风险描述> — 缓解：<策略>

   ## 成功判据
   - [OK-1] <可验证的成功行为>
   - [OK-2] ...

   ## 开放问题（已解决）
   - Q1: <问题> → A: <用户回答> → 约束：[HC/SC-N]

   ## Codex Sessions（供后续阶段复用）
   - CODEX_RESEARCH_SESSION: <session_id>
   - CODEX_B_RESEARCH_SESSION: <session_id>
   ```

7. **上下文检查点**
   - 报告当前上下文使用量。
   - 提示：`研究完成，运行 /clear 后执行 /ccg:team-plan <任务名> 开始规划`
   - 提醒用户：研究文件中已保存 Codex SESSION_ID，`/ccg:team-plan` 会自动复用以节省时间。

**Exit Criteria**
- [ ] Codex 探索完成（后端 + 架构两个维度）
- [ ] 所有歧义已通过用户确认解决
- [ ] 约束集 + 成功判据已写入研究文件
- [ ] 零开放问题残留
<!-- CCG:TEAM:RESEARCH:END -->
