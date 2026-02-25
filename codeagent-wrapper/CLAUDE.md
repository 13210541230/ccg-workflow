[根目录](../CLAUDE.md) > **codeagent-wrapper**

# codeagent-wrapper (Go)

**Last Updated**: 2026-02-25 (v5.7.2)

---

## 变更记录 (Changelog)

### 2026-02-25
- 初次由架构扫描器生成此模块文档

---

## 模块职责

codeagent-wrapper 是一个跨平台 Go 命令行工具，充当 AI CLI 后端（Codex / Gemini / Claude）的统一调用层。核心能力：

1. **多后端调度** -- 通过 `--backend` 参数选择 codex / gemini / claude 后端
2. **JSON Stream 解析** -- 解析各后端的流式 JSON 输出（SSE），提取 agent_message
3. **并行任务执行** -- `--parallel` 模式支持 DAG 拓扑排序 + 并发 worker
4. **Web UI 实时流** -- 内嵌 SSE WebServer，向浏览器推送实时输出（可通过 `--lite` 禁用）
5. **跨平台适配** -- Windows 进程树终止（taskkill /T）、Git Bash 路径规范化、控制台隐藏
6. **输出持久化** -- 将结果写入 `~/.claude/.ccg/outputs/` 防止 Claude Code TaskOutput 临时文件丢失
7. **ROLE_FILE 注入** -- 支持 `ROLE_FILE: <path>` 指令，在运行时注入角色提示词文件内容

---

## 入口与启动

- **主入口**: `main.go` -> `run()` 函数
- **版本**: v5.7.2（内嵌常量）
- **构建**: Go 1.21+，无第三方依赖（纯标准库）
- **跨平台编译**: `build-all.sh`（输出到 `../bin/`）

```bash
# 单一模式
codeagent-wrapper --backend codex "task text" [workdir]
codeagent-wrapper --backend gemini - [workdir] <<'EOF'
<task>
EOF

# 恢复会话
codeagent-wrapper resume <session_id> "task" [workdir]

# 并行模式
codeagent-wrapper --parallel < tasks.txt
codeagent-wrapper --parallel --full-output < tasks.txt

# Lite 模式（禁用 Web UI，更快响应）
codeagent-wrapper --lite --backend codex "task"
```

---

## 对外接口

### CLI 参数

| 参数 | 说明 |
|------|------|
| `--backend <name>` | 选择后端：codex / gemini / claude |
| `--lite`, `-L` | Lite 模式：禁用 WebServer，加速响应 |
| `--parallel` | 并行模式：从 stdin 读取 DAG 任务配置 |
| `--full-output` | 并行模式完整输出（默认为摘要模式） |
| `--gemini-model <name>` | 指定 Gemini 模型（仅 gemini 后端有效） |
| `--skip-permissions` | 跳过 Claude 权限检查 |
| `--version`, `-v` | 输出版本号 |
| `--help`, `-h` | 输出帮助信息 |
| `--cleanup` | 清理旧日志文件 |
| `resume <sid> <task>` | 恢复已有会话 |

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CODEX_TIMEOUT` | 超时（秒或毫秒） | 7200s |
| `CODEX_REQUIRE_APPROVAL` | 启用手动审批 | false |
| `CODEAGENT_ASCII_MODE` | ASCII 状态符号 | false |
| `CODEAGENT_LITE_MODE` | Lite 模式 | false |
| `CODEAGENT_POST_MESSAGE_DELAY` | 消息后延迟（秒） | 5s |
| `CODEAGENT_MAX_PARALLEL_WORKERS` | 最大并行 worker 数 | 无限制 |
| `GEMINI_MODEL` | 默认 Gemini 模型名 | (空) |

### 退出码

| 码 | 含义 |
|----|------|
| 0 | 成功 |
| 1 | 一般错误 |
| 124 | 超时 |
| 127 | 后端命令未找到 |
| 130 | 中断（Ctrl+C） |

---

## 关键依赖与配置

- **语言**: Go 1.21
- **外部依赖**: 无（纯标准库）
- **go.mod**: `module codeagent-wrapper`
- **配置读取**: `~/.claude/settings.json` 中的 `env` 字段（用于 Claude 后端环境变量注入）

---

## 数据模型

### 核心结构体 (`config.go`)

| 结构体 | 用途 |
|--------|------|
| `Config` | CLI 参数解析结果（mode/task/backend/workdir 等） |
| `ParallelConfig` | 并行模式任务配置（tasks 数组 + 全局 backend） |
| `TaskSpec` | 单个任务定义（id/task/workdir/dependencies/backend） |
| `TaskResult` | 任务执行结果（exit_code/message/session_id/coverage/files 等） |

### 后端接口 (`backend.go`)

```go
type Backend interface {
    Name() string
    BuildArgs(cfg *Config, targetArg string) []string
    Command() string
}
```

实现：`CodexBackend` / `GeminiBackend` / `ClaudeBackend`

### JSON 事件类型 (`parser.go`)

| 类型 | 后端 | 用途 |
|------|------|------|
| `JSONEvent` | Codex | `type` + `thread_id` + `item` |
| `ClaudeEvent` | Claude | `type` + `subtype` + `session_id` + `result` |
| `GeminiEvent` | Gemini | `type` + `session_id` + `content` + `delta` |

---

## 源文件清单

### 核心逻辑
| 文件 | 职责 |
|------|------|
| `main.go` | 入口、参数路由、单任务/并行模式分发 |
| `config.go` | CLI 参数解析、并行配置解析、后端注册 |
| `backend.go` | Backend 接口 + 3 个后端实现（codex/claude/gemini） |
| `executor.go` | 任务执行引擎：进程管理、信号转发、并发调度、DAG 拓扑排序 |
| `parser.go` | 多后端 JSON Stream 解析器（Codex/Claude/Gemini 格式） |
| `filter.go` | stderr 噪声过滤器 |
| `logger.go` | 异步日志写入器（缓冲通道 + 单 worker goroutine） |
| `server.go` | 内嵌 SSE WebServer（实时输出流推送） |
| `utils.go` | 工具函数（超时、stdin、路径规范化、输出提取） |
| `persist.go` | 输出持久化（写入 `~/.claude/.ccg/outputs/`） |
| `wrapper_name.go` | 运行时可执行文件名检测 |
| `process_check_windows.go` | Windows 进程检查（build tag: windows） |
| `process_check_unix.go` | Unix 进程检查（build tag: !windows） |
| `windows_console.go` | Windows 控制台窗口隐藏 |
| `windows_console_unix.go` | Unix 空实现 |

### 测试文件（16 个）
| 文件 | 覆盖范围 |
|------|----------|
| `main_test.go` | run() 函数、参数解析 |
| `main_integration_test.go` | 集成测试 |
| `backend_test.go` | 后端选择、参数构建 |
| `executor_concurrent_test.go` | 并发执行引擎 |
| `concurrent_stress_test.go` | 并发压力测试 |
| `filter_test.go` | stderr 过滤器 |
| `logger_test.go` | 日志系统 |
| `logger_additional_coverage_test.go` | 日志补充覆盖 |
| `logger_suffix_test.go` | 日志后缀 |
| `log_writer_limit_test.go` | 日志写入限制 |
| `parser_token_too_long_test.go` | 超长 token 解析 |
| `parser_unknown_event_test.go` | 未知事件处理 |
| `utils_test.go` | 工具函数 |
| `bench_test.go` | 性能基准测试 |
| `path_normalization_test.go` | 路径规范化 |
| `process_check_test.go` | 进程检查 |
| `wrapper_name_test.go` | wrapper 名称检测 |

---

## 测试与质量

- **测试框架**: Go 标准 `testing` 包
- **测试文件数**: 16 个（`*_test.go`）
- **覆盖范围**: 核心逻辑（executor/parser/backend/config/logger/utils）均有测试
- **特殊测试**: 并发压力测试、性能基准测试
- **运行**: `cd codeagent-wrapper && go test ./...`

---

## 常见问题 (FAQ)

**Q: Windows 上后端进程无法正常退出？**
A: 使用 `taskkill /T /F /PID` 终止进程树。`terminateCommand()` 在 Windows 上自动使用此方式。

**Q: Git Bash 路径无法识别？**
A: `normalizeWindowsPath()` 会将 `/c/Users/...` 转换为 `C:/Users/...` 格式。

**Q: 并行模式如何控制并发数？**
A: 设置环境变量 `CODEAGENT_MAX_PARALLEL_WORKERS=N`，默认无限制。

---

**扫描覆盖率**: 98%
**最后更新**: 2026-02-25
