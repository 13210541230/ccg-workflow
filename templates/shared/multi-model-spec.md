# 多模型调用规范（共享）

## 工作目录

- `{{WORKDIR}}`：替换为目标工作目录的**绝对路径**
- `CCG_BACKEND`：默认 `codex`。仅当任务明确要求 Gemini/Claude 时切换。
- 如果用户通过 `/add-dir` 添加了多个工作区，先用 Glob/Grep 确定任务相关的工作区
- 如果无法确定，用 `AskUserQuestion` 询问用户选择目标工作区
- 默认使用当前工作目录

## 环境自检（首次调用前执行一次）

解析 `codex_bridge.py` 绝对路径并验证依赖：

```
Bash({
  command: "P=\"$HOME/.claude/plugins/cache/ccg-plugin/ccg\"; R=$(ls -1d \"$P\"/*/ 2>/dev/null | sort -V | tail -1 | sed 's|/$||'); B=\"$R/scripts/codex_bridge.py\"; echo \"PLUGIN_ROOT=$R\"; python --version 2>&1; [ -f \"$B\" ] && echo \"BRIDGE=$B\" && echo 'OK' || echo 'BRIDGE MISSING'",
  description: "解析 codex_bridge.py 路径"
})
```

将输出的 `PLUGIN_ROOT` 和 `BRIDGE` 保存为变量，后续所有调用使用这些绝对路径。

## 调用语法

**新会话调用**：

```
Bash({
  command: "python \"<BRIDGE>\" --backend \"${CCG_BACKEND:-codex}\" --cd \"{{WORKDIR}}\" --role \"<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/<role>.md\" --sandbox read-only --PROMPT '<需求描述。OUTPUT: 期望输出格式>'",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**长 prompt 调用**（避免命令行长度限制，使用工作区内跨平台路径）：

```
# 1. 将 prompt 写入工作区内临时文件
Write({ file_path: "{{WORKDIR}}/.ccg-tmp/codex_prompt.md", content: "<完整 prompt>" })

# 2. 通过 --prompt-file 传递
Bash({
  command: "python \"<BRIDGE>\" --backend \"${CCG_BACKEND:-codex}\" --cd \"{{WORKDIR}}\" --role \"<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/<role>.md\" --sandbox read-only --prompt-file \"{{WORKDIR}}/.ccg-tmp/codex_prompt.md\"",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**复用会话调用**：

```
Bash({
  command: "python \"<BRIDGE>\" --backend \"${CCG_BACKEND:-codex}\" --cd \"{{WORKDIR}}\" --SESSION_ID <SESSION_ID> --PROMPT '<追加指令>'",
  run_in_background: true,
  timeout: 3600000,
  description: "简短描述"
})
```

**会话复用**：每次调用返回 JSON，其中 `SESSION_ID` 字段用于后续 `--SESSION_ID` 复用上下文。

**并行调用**：使用 `run_in_background: true` 启动，用 `TaskOutput` 等待结果。**必须等所有模型返回后才能进入下一阶段**。

## 等待后台任务

使用最大超时 600000ms = 10 分钟：

```
TaskOutput({ task_id: "<task_id>", block: true, timeout: 600000 })
```

**重要**：
- 必须指定 `timeout: 600000`，否则默认只有 30 秒会导致提前超时。
如果 10 分钟后仍未完成，继续用 `TaskOutput` 轮询，**绝对不要 Kill 进程**。
- 若因等待时间过长跳过了等待 TaskOutput 结果，则**必须调用 `AskUserQuestion` 工具询问用户选择继续等待还是 Kill Task。禁止直接 Kill Task。**

## 输出处理

codex_bridge.py 返回 JSON：

```json
{
  "success": true,
  "backend": "codex",
  "SESSION_ID": "uuid",
  "agent_messages": "后端模型的回复内容"
}
```

- `success: true` → 从 `agent_messages` 读取模型产出
- `success: false` → 检查 `error` 字段，决定重试或换策略
- `SESSION_ID` → 立即保存，后续用 `--SESSION_ID` 复用
- 若 `agent_messages` 为空，用 `--return-all-messages` 重跑获取完整信息

## 角色提示词

可用角色通过 `--role` 参数注入，路径跟随 `${CCG_BACKEND:-codex}`：

| 角色 | 路径 | 适用场景 |
|------|------|----------|
| analyzer | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/analyzer.md` | 代码分析/理解 |
| architect | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/architect.md` | 架构设计/方案（默认） |
| debugger | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/debugger.md` | 问题诊断/调试 |
| optimizer | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/optimizer.md` | 性能优化 |
| reviewer | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/reviewer.md` | 代码审查 |
| tester | `<PLUGIN_ROOT>/prompts/${CCG_BACKEND:-codex}/tester.md` | 测试生成 |

仅 `gemini` 额外提供：

| 角色 | 路径 | 适用场景 |
|------|------|----------|
| frontend | `<PLUGIN_ROOT>/prompts/gemini/frontend.md` | Gemini 前端/UI 视角 |
