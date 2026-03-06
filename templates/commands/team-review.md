---
description: 'Agent Teams 审查 - 双 Codex 交叉审查并行实施的产出，分级处理 Critical/Warning/Info'
---
<!-- CCG:TEAM:REVIEW:START -->
**Core Philosophy**
- 双 Codex 交叉验证捕获单次审查遗漏的盲区。
- Critical 问题必须修复后才能结束。
- 审查范围严格限于 team-exec 的变更，不扩大范围。

**Guardrails**
- **MANDATORY**: 两个 Codex 实例必须都完成审查后才能综合。
- 审查范围限于 `git diff` 的变更，不做范围蔓延。
- Lead 可以直接修复 Critical 问题（审查阶段允许写代码）。

**Steps**
1. **收集变更产物**
   - 运行 `git diff` 获取变更摘要。
   - 如果有 `.claude/team-plan/` 下的计划文件，读取约束和成功判据作为审查基准。
   - **会话复用检查**：从计划文件中提取 `Codex Sessions` 部分，获取 `CODEX_PLAN_SESSION` 和 `CODEX_B_PLAN_SESSION`。若存在，在步骤 2 中使用 `resume` 复用会话，Codex 已有项目上下文无需重新扫描。
   - 列出所有被修改的文件。

2. **多模型审查（PARALLEL）**
   - **CRITICAL**: 必须在一条消息中同时发起两个 Bash 调用。
   - **工作目录**：`{{WORKDIR}}` 替换为目标工作目录的绝对路径。
   - **会话复用**：若步骤 1 获取到 `CODEX_PLAN_SESSION`，在命令中使用 `resume <SESSION_ID>` 替代新会话（将 `--backend ${CCG_BACKEND:-codex} -` 改为 `--backend ${CCG_BACKEND:-codex} resume <SESSION_ID> -`）。

   **FIRST Bash call (Codex)**（若有 SESSION_ID 则 resume，否则新会话）:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} [resume <CODEX_PLAN_SESSION>] - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/$CCG_BACKEND/reviewer.md\n<TASK>\n审查以下变更：\n<git diff 输出或变更文件列表>\n</TASK>\nOUTPUT (JSON):\n{\n  \"findings\": [\n    {\n      \"severity\": \"Critical|Warning|Info\",\n      \"dimension\": \"logic|security|performance|error_handling\",\n      \"file\": \"path/to/file\",\n      \"line\": 42,\n      \"description\": \"问题描述\",\n      \"fix_suggestion\": \"修复建议\"\n    }\n  ],\n  \"passed_checks\": [\"已验证的检查项\"],\n  \"summary\": \"总体评估\"\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 后端审查"
   })
   ```

   **SECOND Bash call (Codex) - IN THE SAME MESSAGE**（若有 SESSION_ID 则 resume，否则新会话）:
   ```
   Bash({
     command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} [resume <CODEX_B_PLAN_SESSION>] - \"{{WORKDIR}}\" <<'EOF'\nROLE_FILE: ~/.claude/.ccg/prompts/$CCG_BACKEND/reviewer.md\n<TASK>\n审查以下变更：\n<git diff 输出或变更文件列表>\n</TASK>\nOUTPUT (JSON):\n{\n  \"findings\": [\n    {\n      \"severity\": \"Critical|Warning|Info\",\n      \"dimension\": \"patterns|maintainability|accessibility|architecture|design\",\n      \"file\": \"path/to/file\",\n      \"line\": 42,\n      \"description\": \"问题描述\",\n      \"fix_suggestion\": \"修复建议\"\n    }\n  ],\n  \"passed_checks\": [\"已验证的检查项\"],\n  \"summary\": \"总体评估\"\n}\nEOF",
     run_in_background: true,
     timeout: 3600000,
     description: "Codex 架构审查"
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

3. **综合发现**
   - 合并两个 Codex 实例的发现。
   - 去重重叠问题。
   - 按严重性分级：
     * **Critical**: 安全漏洞、逻辑错误、数据丢失风险 → 必须修复
     * **Warning**: 模式偏离、可维护性问题 → 建议修复
     * **Info**: 小改进建议 → 可选修复

4. **输出审查报告**
   ```markdown
   ## 审查报告

   ### Critical (X issues) - 必须修复
   - [ ] [安全] file.ts:42 - 描述
   - [ ] [逻辑] api.ts:15 - 描述

   ### Warning (Y issues) - 建议修复
   - [ ] [模式] utils.ts:88 - 描述

   ### Info (Z issues) - 可选
   - [ ] [维护] helper.ts:20 - 描述

   ### 已通过检查
   - 无 XSS 漏洞
   - 错误处理完整
   ```

5. **决策门**
   - **Critical > 0**:
     * 展示发现，用 `AskUserQuestion` 询问："立即修复 / 跳过"
     * 选择修复 → Lead 直接修复（参考 Codex 建议）
     * 修复后重新运行受影响的审查维度
     * 重复直到 Critical = 0
   - **Critical = 0**:
     * 报告通过，建议提交代码

6. **上下文检查点**
   - 报告当前上下文使用量。

**Exit Criteria**
- [ ] Codex 审查完成（后端 + 架构两个维度）
- [ ] 所有发现已综合分级
- [ ] Critical = 0（已修复或用户确认跳过）
- [ ] 审查报告已输出
<!-- CCG:TEAM:REVIEW:END -->
