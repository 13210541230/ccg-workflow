---
description: 'Agent Teams 并行实施 - 读取计划文件，spawn Builder teammates 并行写代码'
---
<!-- CCG:TEAM:EXEC:START -->
**Core Philosophy**
- 实施是纯机械执行——所有决策已在 team-plan 阶段完成。
- Lead 不写代码，只做协调和汇总。
- Builder teammates 并行实施，文件范围严格隔离。

**Guardrails**
- **前置条件**：`.claude/team-plan/` 下必须有计划文件。没有则终止，提示先运行 `/ccg:team-plan`。
- **Agent Teams 必须启用**：需要 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。
- Lead 绝不直接修改产品代码。
- 每个 Builder 只能修改分配给它的文件。
- 该命令不是独立的 decision-complete 模板；`TeamCreate` 参数、Builder 类型、依赖表达、阻塞消息回复协议和 prompt 来源以 `manage.md` 为唯一权威。

**Steps**
1. **前置检查**
   - 检测 Agent Teams 是否可用。
   - 若不可用，输出启用指引后终止：
     ```
     ⚠️ Agent Teams 未启用。请先配置：
     在 settings.json 中添加：
     { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
     ```
   - 读取 `.claude/team-plan/` 下最新的计划文件。
   - 若无计划文件，提示：`请先运行 /ccg:team-plan <任务描述> 生成计划`，终止。

2. **解析计划**
   - 解析子任务列表、文件范围、依赖关系、并行分组。
   - 向用户展示摘要并确认：
     ```
     📋 即将并行实施：
     - 子任务：N 个
     - 并行分组：Layer 1 (X 个并行) → Layer 2 (Y 个)
     - Builder 数量：N 个（Sonnet）
     确认开始？
     ```

3. **创建 Team + spawn Builders**
   - 创建 Agent Team，并按 `manage.md` 中的实现协议进入 delegate-only 模式。
   - 按 Layer 分组 spawn Builder teammates；若缺少 `manage.md` 所要求的计划字段、命名规则或依赖信息，则终止并提示回到 `/ccg:manage` 或 `/ccg:team-plan` 重新生成。
   - 每个 Builder 的 spawn prompt 必须包含：

   ```
   你是 Builder，负责实施一个子任务。严格按照以下指令执行。

   ## 你的任务
   <从计划文件中提取该 Builder 负责的子任务全部内容，包括实施步骤>

   ## 工作目录
   {{WORKDIR}}

   ## 文件范围约束（⛔ 硬性规则）
   你只能创建或修改以下文件：
   <文件列表>
   严禁修改任何其他文件。违反此规则等于任务失败。

   ## 实施要求
   1. 严格按照实施步骤执行
   2. 代码必须符合项目现有规范和模式
   3. 完成后运行相关的 lint/typecheck 验证（如果项目有配置）
   4. 代码应自解释，非必要不加注释

   ## 验收标准
   <从计划中提取>

   完成所有步骤后，标记任务为 completed。
   ```

   - **依赖关系**：仅使用计划文件中已明确声明的 Layer 依赖；不要在本命令中临时发明额外依赖语义。
   - **消息协议**：Builder 的阻塞式求助与 Lead 回复格式沿用 `manage.md` 的 `SendMessage` 约定。
   - **prompt 来源**：Builder prompt 必须来自计划产物或 `manage.md` 约定的模板，不得现场手写替代版本。
   - spawn 完成后，进入 **delegate 模式**，只协调不写码。

4. **监控进度**
   - 等待所有 Builder 完成。
   - 如果某个 Builder 遇到问题并发消息求助：
     * 分析问题，给出指导建议
     * 不要自己写代码替它完成
   - 如果某个 Builder 失败：
     * 记录失败原因
     * 不影响其他 Builder 继续执行

5. **汇总 + 清理**
   - 所有 Builder 完成后，汇总报告：

   ```markdown
   ## ✅ Team 并行实施完成

   ### 变更摘要
   | Builder | 子任务 | 状态 | 修改文件 |
   |---------|--------|------|----------|
   | Builder 1 | <名称> | ✅/❌ | file1, file2 |
   | Builder 2 | <名称> | ✅/❌ | file3, file4 |
   | ...     | ...    | ...  | ...      |

   ### 后续建议
   1. 运行完整测试验证集成：`npm test` / `pnpm test`
   2. 检查各模块间的集成是否正常
   3. 提交代码：`git add -A && git commit`
   ```

   - 关闭所有 teammates，清理 team。

**Exit Criteria**
- [ ] 所有 Builder 任务完成（或明确失败并记录原因）
- [ ] 变更摘要已输出
- [ ] Team 已清理
<!-- CCG:TEAM:EXEC:END -->
