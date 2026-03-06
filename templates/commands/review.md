---
description: '多模型代码审查：无参数时自动审查 git diff，双模型交叉验证'
---

# Review - 多模型代码审查

双模型并行审查，交叉验证综合反馈。无参数时自动审查当前 git 变更。

## 使用方法

```bash
/review [代码或描述]
```

- **无参数**：自动审查 `git diff HEAD`
- **有参数**：审查指定代码或描述

---

## 多模型调用规范

**工作目录**：
- `{{WORKDIR}}`：替换为目标工作目录的**绝对路径**
- 如果用户通过 `/add-dir` 添加了多个工作区，先用 Glob/Grep 确定任务相关的工作区
- 如果无法确定，用 `AskUserQuestion` 询问用户选择目标工作区
- 默认使用当前工作目录

**调用语法**（并行用 `run_in_background: true`）：

```
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} - \"{{WORKDIR}}\" <<'EOF'
ROLE_FILE: <角色提示词路径>
<TASK>
审查以下代码变更：
<git diff 内容>
</TASK>
OUTPUT: 按 Critical/Major/Minor/Suggestion 分类列出问题
EOF",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**角色提示词**：

| 模型 | 提示词 |
|------|--------|
| Codex-A | `~/.claude/.ccg/prompts//reviewer.md` |
| Codex-B | `~/.claude/.ccg/prompts//reviewer.md` |

**并行调用**：使用 `run_in_background: true` 启动，用 `TaskOutput` 等待结果。**必须等所有模型返回后才能进入下一阶段**。

**等待后台任务**（使用最大超时 600000ms = 10 分钟）：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要**：
- 必须指定 `timeout: 600000`，否则默认只有 30 秒会导致提前超时。
如果 10 分钟后仍未完成，继续用 `TaskOutput` 轮询，**绝对不要 Kill 进程**。
- 若因等待时间过长跳过了等待 TaskOutput 结果，则**必须调用 `AskUserQuestion` 工具询问用户选择继续等待还是 Kill Task。禁止直接 Kill Task。**

**输出丢失检测**（⚠️ 必须执行）：
- 每次 `TaskOutput` 返回后，**立即检查 `<output>` 部分是否为空或缺失**。
- 若输出为空但 `exit_code: 0`，说明 TaskOutput 读取临时文件时发生截断。
- **恢复步骤**：
  1. 用 `Read` 工具直接读取输出文件（路径在启动时的 `Output is being written to:` 中），注意使用 Windows 绝对路径格式（如 `C:\Users\...`）而非 Git Bash 格式（`/c/Users/...`）。
  2. 若临时文件已清理，用 `Glob` 查找 `~/.claude/.ccg/outputs/*.txt`，按时间排序读取最新文件。
  3. 若持久化文件也不存在，用**相同的命令重新调用该 Codex 实例**（使用 `resume` 复用会话避免重新扫描）。
- **禁止**：跳过空输出继续下一阶段、用 `cat` 命令读文件（必须用 `Read` 工具）。

---

## 执行工作流

### 🔍 阶段 1：获取待审查代码

`[模式：研究]`

**无参数时**：执行 `git diff HEAD` 和 `git status --short`

**有参数时**：使用指定的代码/描述

调用 `{{MCP_SEARCH_TOOL}}` 获取相关上下文。

### 🔬 阶段 2：并行审查

`[模式：审查]`

**⚠️ 必须发起两个并行 Bash 调用**（参照上方调用规范）：

1. **Codex 后端审查**：`Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/reviewer.md`
   - 需求：审查代码变更（git diff 内容）
   - OUTPUT：按 Critical/Major/Minor/Suggestion 分类列出安全性、性能、错误处理问题

2. **Codex 架构审查**：`Bash({ command: "...--backend ${CCG_BACKEND:-codex}...", run_in_background: true })`
   - ROLE_FILE: `~/.claude/.ccg/prompts/$CCG_BACKEND/reviewer.md`
   - 需求：审查代码变更（git diff 内容）
   - OUTPUT：按 Critical/Major/Minor/Suggestion 分类列出架构、可维护性、设计一致性问题

用 `TaskOutput` 等待两个模型的审查结果。**必须等所有模型返回后才能进入下一阶段**。

**务必遵循上方 `多模型调用规范` 的 `重要` 指示**

### 🛡️ 阶段 2.5：Claude 本地深度审查

`[模式：深度审查]`

**在等待 Codex 结果返回的同时**，并行 spawn 三个 comprehensive-review 子Agent 进行本地深度审查：

1. **架构审查**：
   ```
   Task({
     subagent_type: "comprehensive-review:architect-review",
     prompt: "审查以下代码变更，关注架构模式、可扩展性、模块耦合度、依赖方向：\n\n<git diff 内容或变更描述>",
     description: "架构维度审查",
     run_in_background: true
   })
   ```

2. **安全审计**：
   ```
   Task({
     subagent_type: "comprehensive-review:security-auditor",
     prompt: "审查以下代码变更，关注 OWASP Top 10、注入风险、认证授权、敏感数据处理：\n\n<git diff 内容或变更描述>",
     description: "安全维度审计",
     run_in_background: true
   })
   ```

3. **代码质量审查**：
   ```
   Task({
     subagent_type: "comprehensive-review:code-reviewer",
     prompt: "审查以下代码变更，关注代码复杂度、错误处理、性能问题、测试覆盖、可维护性：\n\n<git diff 内容或变更描述>",
     description: "代码质量审查",
     run_in_background: true
   })
   ```

**注意**：这三个审查与阶段 2 的 Codex 双模型审查**并行执行**（均设置 `run_in_background: true`）。等待全部 5 个审查结果（2 个 Codex + 3 个 comprehensive-review）返回后，进入阶段 3。

### 🔀 阶段 3：五层综合反馈

`[模式：综合]`

1. 收集全部审查结果（Codex 双模型 + comprehensive-review 三维度 = 五层）
2. **去重合并**：同一问题被多个审查者发现时，保留最详细的描述，标注发现来源
3. **严重程度校准**：按 Critical / Major / Minor / Suggestion 统一分级
4. **交叉验证**：
   - Codex-A 与 Codex-B 一致的结论 → 强信号
   - comprehensive-review 独立发现的问题 → 补充维度
   - 仅单一来源的 Critical → 需二次确认

### 📊 阶段 4：呈现审查结果

`[模式：总结]`

```markdown
## 📋 代码审查报告

### 审查范围
- 变更文件：<数量> | 代码行数：+X / -Y

### 审查来源
| 来源 | 维度 | 状态 |
|------|------|------|
| Codex-A | 安全/性能/错误处理 | ✅ |
| Codex-B | 架构/设计一致性 | ✅ |
| architect-review | 架构模式/可扩展性 | ✅ |
| security-auditor | OWASP/注入/认证 | ✅ |
| code-reviewer | 复杂度/测试/性能 | ✅ |

### 关键问题 (Critical)
> 必须修复才能合并
1. <问题描述> - [发现来源]

### 主要问题 (Major) / 次要问题 (Minor) / 建议 (Suggestions)
...

### 总体评价
- 代码质量：[优秀/良好/需改进]
- 安全评级：[安全/需关注/存在风险]
- 是否可合并：[是/否/需修复后]
```

---

## 关键规则

1. **无参数 = 审查 git diff** – 自动获取当前变更
2. **五层交叉验证** – Codex 双模型 + comprehensive-review 三维度
3. 外部模型对文件系统**零写入权限**
