# CCG - Claude + Codex Multi-Model Collaboration

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Claude Code](https://img.shields.io/badge/Claude%20Code-Plugin-green.svg)](https://claude.ai/code)

</div>

以 Claude Code 为编排中心，协调 Codex / Gemini 进行多模型协作开发。当前默认后端仍为 Codex，Gemini 链路保留为可切换执行路径。

## 安装

在 Claude Code 中执行：

```
/install-plugin https://github.com/13210541230/ccg-plugin.git
```

**要求**：Claude Code CLI、Node.js 20+

**可选**：Codex CLI、Gemini CLI（按需切换后端时使用）

## 更新

```
/plugin update
```

## 命令

| 命令 | 说明 |
|------|------|
| `/ccg:workflow` | 6 阶段完整工作流 |
| `/ccg:plan` | 多模型协作规划 (Phase 1-2) |
| `/ccg:execute` | 多模型协作执行 (Phase 3-5) |
| `/ccg:feat` | 新功能开发 |
| `/ccg:frontend` | 前端任务 |
| `/ccg:backend` | 后端任务 (Codex) |
| `/ccg:codex` | 直接调用运行时后端 |
| `/ccg:analyze` | 技术分析 |
| `/ccg:debug` | 问题诊断 |
| `/ccg:optimize` | 性能优化 |
| `/ccg:test` | 测试生成 |
| `/ccg:review` | 代码审查 |
| `/ccg:manage` | 主Agent调度 |
| `/ccg:commit` | Git 提交 |
| `/ccg:rollback` | Git 回滚 |
| `/ccg:clean-branches` | 清理分支 |
| `/ccg:worktree` | Worktree 管理 |
| `/ccg:init` | 初始化 CLAUDE.md |
| `/ccg:enhance` | Prompt 增强 |
| `/ccg:spec-init` | 初始化 OPSX 环境 |
| `/ccg:spec-research` | 需求 → 约束集 |
| `/ccg:spec-plan` | 约束 → 零决策计划 |
| `/ccg:spec-impl` | 按计划执行 + 归档 |
| `/ccg:spec-review` | 双模型交叉审查 |
| `/ccg:team-research` | Agent Teams 需求 → 约束集 |
| `/ccg:team-plan` | Agent Teams 约束 → 并行计划 |
| `/ccg:team-exec` | Agent Teams 并行实施 |
| `/ccg:team-review` | Agent Teams 双模型审查 |

### OPSX 规范驱动（v1.7.52+）

集成 [OPSX 架构](https://github.com/fission-ai/opsx)，把需求变成约束，让 AI 没法自由发挥：

```bash
/ccg:spec-init          # 初始化 OPSX 环境
/ccg:spec-research 实现用户认证  # 研究需求 → 输出约束集
/ccg:spec-plan          # 并行分析 → 零决策计划
/ccg:spec-impl          # 按计划执行
/ccg:spec-review        # 独立审查（随时可用）
```

**说明**：`/ccg:spec-*` 命令是 CCG 对 OPSX 的封装，内部调用 `/opsx:*` 命令。每阶段之间可 `/clear`，状态存在 `openspec/` 目录，不怕上下文爆。

### Agent Teams 并行实施（v1.7.60+）

利用 Claude Code Agent Teams 实验特性，spawn 多个 Builder teammates 并行写代码：

```bash
/ccg:team-research 实现实时协作看板 API  # 需求研究 → 约束集
/ccg:team-plan kanban-api               # 规划 → 零决策并行计划
/ccg:team-exec                          # 并行实施
/ccg:team-review                        # 双模型交叉审查
```

**前置条件**：需手动启用 Agent Teams（`settings.json` 中设置 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）

### 规划与执行分离

```bash
/ccg:plan 实现用户认证功能       # 生成实施计划
# 计划保存至 .claude/plan/user-auth.md
/ccg:execute .claude/plan/user-auth.md  # 执行计划
```

## 配置

### 目录结构（插件模式）

```
~/.claude/plugins/cache/ccg-plugin/ccg/<version>/
├── commands/          # 斜杠命令
├── agents/            # 子智能体
├── prompts/           # 专家提示词
├── output-styles/     # 输出风格
├── hooks/             # 自动化钩子
├── scripts/           # codex_bridge.py 等运行时脚本
├── skills/            # CCG 安装的运行时 Skills
└── .claude-plugin/    # 插件元数据
```

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `CCG_BACKEND` | 后端模型切换 (`codex` / `gemini` / `claude`) | `codex` |
| `BASH_DEFAULT_TIMEOUT_MS` | Claude Code Bash 默认超时（毫秒） | 120000 |
| `BASH_MAX_TIMEOUT_MS` | Claude Code Bash 最大超时（毫秒） | 600000 |

配置方式（`~/.claude/settings.json`）：

```json
{
  "env": {
    "BASH_DEFAULT_TIMEOUT_MS": "600000",
    "BASH_MAX_TIMEOUT_MS": "3600000"
  }
}
```

## 已知问题

**空输出恢复**

优先使用内置 `codex-runtime` Skill 或 `codex_bridge.py` 的持久化输出文件，而不是依赖临时 TaskOutput 文件。该 Skill 当前已支持 `codex` / `gemini` / `claude`，但默认仍走 `codex`。

## 架构

```
Claude Code (编排)
       │
   ┌───┴───┐
   ↓       ↓
Codex   Codex-B
(后端)   (前端)
   │       │
   └───┬───┘
       ↓
  Unified Patch
```

外部模型无写入权限，仅返回 Patch，由 Claude 审核后应用。

## 致谢

- [UfoMiao/zcf](https://github.com/UfoMiao/zcf) - Git 工具
- [GudaStudio/skills](https://github.com/GuDaStudio/skills) - 路由设计

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=fengshao1227/ccg-workflow&type=timeline&legend=top-left)](https://www.star-history.com/#fengshao1227/ccg-workflow&type=timeline&legend=top-left)

## License

MIT

---

v1.7.80 | [Issues](https://github.com/fengshao1227/ccg-workflow/issues)
