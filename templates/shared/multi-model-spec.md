# 多模型调用规范（共享）

## 工作目录

- `{{WORKDIR}}`：替换为目标工作目录的**绝对路径**
- 如果用户通过 `/add-dir` 添加了多个工作区，先用 Glob/Grep 确定任务相关的工作区
- 如果无法确定，用 `AskUserQuestion` 询问用户选择目标工作区
- 默认使用当前工作目录

## 调用语法

**新会话调用**：

```
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} - \"{{WORKDIR}}\" <<'EOF'
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

**复用会话调用**：

```
Bash({
  command: "~/.claude/bin/codeagent-wrapper {{LITE_MODE_FLAG}}--backend ${CCG_BACKEND:-codex} resume <SESSION_ID> - \"{{WORKDIR}}\" <<'EOF'
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

**会话复用**：每次调用返回 `SESSION_ID: xxx`，后续阶段用 `resume xxx` 子命令复用上下文（注意：是 `resume`，不是 `--resume`）。

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

## 输出丢失检测（必须执行）

- 每次 `TaskOutput` 返回后，**立即检查 `<output>` 部分是否为空或缺失**。
- 若输出为空但 `exit_code: 0`，说明 TaskOutput 读取临时文件时发生截断。
- **恢复步骤**：
  1. 用 `Read` 工具直接读取输出文件（路径在启动时的 `Output is being written to:` 中），注意使用 Windows 绝对路径格式（如 `C:\Users\...`）而非 Git Bash 格式（`/c/Users/...`）。
  2. 若临时文件已清理，用 `Glob` 查找 `~/.claude/.ccg/outputs/*.txt`，按时间排序读取最新文件。
  3. 若持久化文件也不存在，用**相同的命令重新调用该 Codex 实例**（使用 `resume` 复用会话避免重新扫描）。
- **禁止**：跳过空输出继续下一阶段、用 `cat` 命令读文件（必须用 `Read` 工具）。
