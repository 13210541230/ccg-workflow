# agent-platform-mcp 设计文档

**日期**: 2026-04-03  
**状态**: 已审批  
**背景**: 从 ccg-workflow 插件中提取 ccg-codex MCP server，重写为独立通用 MCP，支持能力级别映射和多后端自适应选择。

---

## 1. 目标

将 ccg-codex MCP server 独立为新仓库 `agent-platform-mcp`，满足：

- 不依赖 ccg-workflow/ccg-plugin，可单独 clone + 运行
- 纯 Python 实现（官方 `mcp` SDK），去掉 Node.js 层
- 使用 `mycodex` 作为默认 executor
- 读取 `~/.agent-platform/config.json` 的模型映射表，通过 `capability` 参数自适应选择模型和推理强度，降低成本
- 注册到 `~/.claude.json`，永久生效，不受插件安装器干扰

---

## 2. 仓库结构

```
agent-platform-mcp/
├── src/
│   ├── server.py       # MCP server 入口，声明所有工具，路由到各层
│   ├── config.py       # 读 ~/.agent-platform/config.json，解析 capability→model/effort
│   ├── bridge.py       # subprocess 调用 mycodex/claude_code/gemini
│   ├── session.py      # 会话注册表 CRUD（创建/发送/查询/列表/关闭）
│   └── models.py       # 工具参数 Pydantic 模型
├── pyproject.toml      # 依赖：mcp, pydantic
└── README.md
```

---

## 3. 工具接口

共 6 个工具：

| 工具 | 用途 |
|------|------|
| `codex_once` | 一次性任务，无会话保持 |
| `codex_session_ensure` | 创建或复用命名会话 |
| `codex_session_send` | 向已有会话发送提示词 |
| `codex_session_status` | 读取会话元数据 |
| `codex_session_list` | 列出所有活跃会话 |
| `codex_session_close` | 关闭会话释放资源 |

保留现有工具命名以兼容 CCG 现有调用方（`codex_session_list` / `codex_session_close` 为新增）。

### 公共参数（执行类工具）

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `executor` | str | config.default_executor | mycodex / claude_code / gemini |
| `capability` | str | "medium" | small / medium / large |
| `model` | str \| None | None | 覆盖 capability 映射 |
| `reasoning_effort` | str \| None | None | 覆盖 capability 映射 |
| `workdir` | str | "." | 执行工作目录 |
| `role` | str \| None | None | 内置角色名或提示词文件绝对路径 |
| `sandbox` | str | "workspace-write" | read-only / workspace-write / danger-full-access |

---

## 4. capability 映射逻辑

```
capability: "small" | "medium" | "large"
  ↓ config.py 读取
  executor_model_table[executor][capability][0]
  → { model, reasoning_effort }

优先级（高→低）：
  显式 model 参数 > capability 映射 > config.default_model
  显式 reasoning_effort > capability 映射 > "medium"

降级策略：
  config.json 不存在 → 内置默认（mycodex, gpt-5.4, medium）
  executor 不在映射表 → 使用 config.default_model
  capability 不在映射表 → 使用 "medium" 档
```

---

## 5. 数据流

```
Claude Code
  → MCP Protocol (stdio)
    → server.py（工具路由）
      → config.py（capability → model/reasoning_effort）
      → session.py（会话状态读写）
      → bridge.py（subprocess 调用 mycodex/claude_code）
          → mycodex exec --model <m> --reasoning-effort <e> --session <id> ...
```

---

## 6. bridge.py 调用约定

```python
# executor_path 从 config.executor_paths[executor] 读取
# 例：config.executor_paths["mycodex"] = "mycodex"
cmd = [executor_path, "exec",
       "--model", model,
       "--reasoning-effort", reasoning_effort,
       "--sandbox", sandbox,
       "--cd", workdir,
       "--json"]

if session_id:
    cmd += ["--session", session_id]
```

- 提示词通过临时文件传入（与现有 codex_bridge.py 保持一致）
- Windows 兼容：自动检测 npm 全局路径
- 输出解析：监听 `--json` 输出流，提取结果
- **role 解析规则**：绝对路径直接使用；非路径字符串视为内置角色名，在 `~/.agent-platform/prompts/<executor>/<role>.md` 中查找

---

## 7. 会话注册表

**路径**: `~/.agent-platform/mcp/sessions/registry.json`

```json
{
  "my-session": {
    "session_id": "sess_xxx",
    "executor": "mycodex",
    "model": "gpt-5.4",
    "capability": "medium",
    "reasoning_effort": "medium",
    "created_at": "2026-04-03T10:00:00Z",
    "last_used": "2026-04-03T10:05:00Z",
    "workdir": "/path/to/project"
  }
}
```

---

## 8. 安装与注册

```bash
# 1. clone 仓库
git clone <repo> ~/.agent-platform/mcp/agent-platform-mcp
cd ~/.agent-platform/mcp/agent-platform-mcp
pip install -e .

# 2. 注册到 ~/.claude.json（一次性）
# mcpServers 中添加：
{
  "agent-platform-mcp": {
    "type": "stdio",
    "command": "python",
    "args": ["C:/Users/xxx/.agent-platform/mcp/agent-platform-mcp/src/server.py"]
  }
}
```

升级只需 `git pull`，无需重新注册。

---

## 9. 与 ccg-workflow 的关系

- ccg-workflow 的 `ccg-codex` MCP 注册（`.mcp.json`）保留用于兼容旧安装
- 新安装推荐改用 `agent-platform-mcp`，工具名完全兼容
- ccg-workflow 后续可移除 `src/plugin/` 目录和 `start.mjs` 相关内容

---

## 10. 依赖

| 依赖 | 版本 | 用途 |
|------|------|------|
| `mcp` | ≥1.0 | 官方 MCP Python SDK |
| `pydantic` | ≥2.0 | 工具参数模型 |
| Python | ≥3.11 | 运行时 |
