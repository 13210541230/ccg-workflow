---
description: '委派编码任务给 Codex CLI 执行：原型实现、算法设计、复杂调试、代码审查、性能优化。当另一个模型的视角有助于当前任务时自动触发'
---

# Codex Collaborator

$ARGUMENTS

---

## 环境准备（首次调用前执行一次）

解析 codex_bridge.py 绝对路径：

```
Bash({
  command: "P=\"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"; R=$(ls -1d \"$P\"/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); B=\"$R/scripts/codex_bridge.py\"; echo \"PLUGIN_ROOT=$R\"; python --version 2>&1; [ -f \"$B\" ] && echo \"BRIDGE=$B\" && echo 'OK' || echo 'BRIDGE MISSING'",
  description: "解析 codex_bridge.py 路径"
})
```

保存 `PLUGIN_ROOT` 和 `BRIDGE`。若 `BRIDGE MISSING` → 告知用户需要安装 CCG 插件。

## 自适应策略（先判断再调用）

**不是所有任务都需要 Codex**：

| 场景 | 策略 |
|------|------|
| 单文件简单修改、lint/格式问题 | Claude 直接做，**跳过 Codex** |
| 复杂逻辑/算法/多文件重构 | 调用 Codex |
| 调试复杂问题（竞态、状态机） | 调用 Codex（debugger 角色） |
| 代码审查（逻辑、正确性） | 调用 Codex（reviewer 角色） |
| 架构设计 | 调用 Codex（architect 角色） |
| 性能优化 | 调用 Codex（optimizer 角色） |
| 测试生成 | 调用 Codex（tester 角色） |

## 角色选择

通过 `--role` 参数注入专家角色，默认 **architect**：

| 任务类型 | 角色 | 路径 |
|----------|------|------|
| 代码分析/理解 | analyzer | `<PLUGIN_ROOT>/prompts/codex/analyzer.md` |
| 架构设计/方案 | architect | `<PLUGIN_ROOT>/prompts/codex/architect.md` |
| 问题诊断/调试 | debugger | `<PLUGIN_ROOT>/prompts/codex/debugger.md` |
| 性能优化 | optimizer | `<PLUGIN_ROOT>/prompts/codex/optimizer.md` |
| 代码审查 | reviewer | `<PLUGIN_ROOT>/prompts/codex/reviewer.md` |
| 测试生成 | tester | `<PLUGIN_ROOT>/prompts/codex/tester.md` |

## 输出契约

根据任务类型在 PROMPT 末尾附加**唯一一种**：

| 任务类型 | 输出契约 |
|----------|----------|
| 原型/实现草案 | `OUTPUT: Unified Diff Patch ONLY. Do not modify files.` |
| 代码审查/审计 | `OUTPUT: Markdown review report ONLY. Do not modify files.` |
| 调试/根因分析 | `OUTPUT: Markdown analysis ONLY. Do not modify files.` |
| 规划 | `OUTPUT: Markdown plan ONLY. Do not modify files.` |

**禁止**混合不同契约。

## 调用语法

**新会话**：

```
Bash({
  command: "python \"<BRIDGE>\" --cd \"$(pwd)\" --role \"<PLUGIN_ROOT>/prompts/codex/<role>.md\" --sandbox read-only --PROMPT '<英文自然语言指令。OUTPUT: <输出契约>'",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex <角色>：<任务简述>"
})
```

**长 prompt**（避免命令行溢出，使用工作区内跨平台路径）：

```
Write({ file_path: "<WORKDIR>/.ccg-tmp/codex_prompt.md", content: "<完整 prompt>" })
Bash({
  command: "python \"<BRIDGE>\" --cd \"$(pwd)\" --role \"<PLUGIN_ROOT>/prompts/codex/<role>.md\" --sandbox read-only --prompt-file \"<WORKDIR>/.ccg-tmp/codex_prompt.md\"",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex <角色>：<任务简述>"
})
```

**复用会话**：

```
Bash({
  command: "python \"<BRIDGE>\" --cd \"$(pwd)\" --SESSION_ID <SESSION_ID> --PROMPT '<追加指令>'",
  run_in_background: true,
  timeout: 3600000,
  description: "Codex 追加：<简述>"
})
```

等待结果：`TaskOutput({ task_id: "<id>", block: true, timeout: 600000 })`

## 输出处理

codex_bridge.py 返回 JSON：
- `success: true` → 从 `agent_messages` 读取 Codex 产出
- `success: false` → 检查 `error`，用 `--return-all-messages` 重跑
- `SESSION_ID` → 立即保存，后续用 `--SESSION_ID` 复用

## 核心约束

- 与 Codex 交互用**英语**，与用户交互用**中文**
- Codex 输出是"粗糙原型"——应用前**必须审查和重构**
- 默认 `--sandbox read-only`，仅在必要时用 `--yolo`
- 优先复用会话（`--SESSION_ID`）保持上下文连贯
- 同一任务最多 **5 轮** Codex 交互
