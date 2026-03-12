[根目录](../CLAUDE.md) > **templates**

# Templates (命令模板 + 专家提示词 + 输出风格)

**Last Updated**: 2026-03-12 (teammate command draft)

---

## 变更记录 (Changelog)

### 2026-03-12 (teammate command draft)
- 新增 `teammate.md` 命令模板，定义 Claude Lead / 多个角色化 Codex Partner 的完整协作工作流
- 新增 `shared/teammate-bus-format.md`，规范多 Partner 的 `messages.jsonl` / `registry.json` / `artifacts/`
- 安装器与 README 接入 `/ccg:teammate`，明确支持 `planner / executor / reviewer` 多会话复用，作为未来替代 `manage` 的实验命令

### 2026-03-12 (generic codex mcp)
- 新增 `plugin/scripts/ccg_codex_mcp.py`，提供通用 `ccg-codex` MCP server
- `templates/plugin/.mcp.json` 接入内置 MCP，支持 `codex_once` 与持久化 `codex_session_*` 工具
- `teammate.md` 改为优先通过 MCP 维持连续对话，而不是在模板里手工管理 `SESSION_ID`

### 2026-03-12 (manage mcp refactor)
- `manage.md` 重写为：简单任务 Claude 直做，复杂任务通过 `ccg-codex` MCP 驱动多角色 Codex 会话
- `manage-state-format.md` 新增 `codex-sessions/` 与 `Session Registry`，统一记录 `Session Name / Session ID / 可复用状态`
- `manage` 不再把 Codex 连续对话建立在 agent resume 文本协议上，而是建立在持久化 MCP session 工具上

### 2026-03-12 (manage routing hardening)
- `manage.md` 强化为：复杂任务先尝试 `TeamCreate`，Phase 3 复杂代码修改优先 `ccg:codex-collaborator`
- `analyze/plan/review/execute-worker` 补充 Codex 超时/空输出处理规则，禁止静默降级为 Agent 自行补做
- `execute-worker` 明确复杂跨文件修改属于 Codex-agent 路径，普通 worker 不得硬做
- `manage.md` / `manage-state-format.md` 新增 Phase 3 Worker Registry，测试失败或审查回流时优先 resume 原实施 worker，避免重复分析上下文

### 2026-03-09 (codex-operator 子Agent)
- 新增 `codex-operator.md` 通用 Codex 代理子Agent（迭代编排，最多 5 轮）
- 统计更新：4 -> 5 子智能体

### 2026-03-11 (wrapper-free runtime + runtime docs sync)
- 新增 `codex.md` 运行时直连命令模板
- 新增 `codex-collaborator.md` 子Agent，子智能体数量更新为 6
- 统计更新：27 -> 28 命令模板，5 -> 6 子智能体

### 2026-02-25 (插件集成)
- 新增 `manage.md` 主Agent调度命令
- `debug.md` 集成 sequential-thinking
- `plan.md` 集成 sequential-thinking
- `review.md` 集成 comprehensive-review 三维审查
- 统计更新：26 -> 27 命令模板

### 2026-02-25
- 初次由架构扫描器生成此模块文档
- 统计：28 命令模板 + 6 子智能体 + 19 专家提示词 + 5 输出风格 + Skills/运行时脚本

---

## 模块职责

存放所有安装时复制到用户 `~/.claude/` 目录的模板文件。安装时由 `src/utils/installer.ts` 进行变量注入（模型路由配置、MCP 工具名、路径替换）后写入目标位置。

---

## 目录结构

```
templates/
+-- commands/              # 29 个斜杠命令模板 -> ~/.claude/commands/ccg/
|   +-- agents/            # 6 个子智能体 -> ~/.claude/agents/ccg/
|   |   +-- planner.md
|   |   +-- ui-ux-designer.md
|   |   +-- init-architect.md
|   |   +-- codex-operator.md
|   |   +-- codex-collaborator.md
|   +-- get-current-datetime.md
|   +-- workflow.md         # 完整 6 阶段工作流
|   +-- plan.md             # 多模型协作规划
|   +-- execute.md          # 多模型协作执行
|   +-- frontend.md         # 前端专项
|   +-- backend.md          # 后端专项
|   +-- codex.md            # 运行时直连后端
|   +-- feat.md             # 智能功能开发
|   +-- analyze.md          # 技术分析
|   +-- debug.md            # 问题诊断
|   +-- optimize.md         # 性能优化
|   +-- test.md             # 测试生成
|   +-- review.md           # 代码审查
|   +-- enhance.md          # Prompt 增强
|   +-- init.md             # 项目初始化
|   +-- commit.md           # Git 智能提交
|   +-- rollback.md         # Git 回滚
|   +-- clean-branches.md   # Git 清理分支
|   +-- worktree.md         # Git Worktree
|   +-- spec-init.md        # OpenSpec 初始化
|   +-- spec-research.md    # 需求研究
|   +-- spec-plan.md        # 零决策规划
|   +-- spec-impl.md        # 规范驱动实现
|   +-- spec-review.md      # 归档前审查
|   +-- team-research.md    # Agent Teams 需求研究
|   +-- team-plan.md        # Agent Teams 规划
|   +-- team-exec.md        # Agent Teams 并行实施
|   +-- team-review.md      # Agent Teams 审查
|   +-- teammate.md         # Claude/Codex 多角色多会话协作
+-- prompts/               # 19 个专家提示词 -> ~/.claude/.ccg/prompts/
|   +-- codex/             # 6 个 Codex 角色
|   |   +-- analyzer.md / architect.md / debugger.md / optimizer.md / reviewer.md / tester.md
|   +-- gemini/            # 7 个 Gemini 角色
|   |   +-- analyzer.md / architect.md / debugger.md / frontend.md / optimizer.md / reviewer.md / tester.md
|   +-- claude/            # 6 个 Claude 角色
|       +-- analyzer.md / architect.md / debugger.md / optimizer.md / reviewer.md / tester.md
+-- output-styles/         # 5 个输出风格 -> ~/.claude/output-styles/
|   +-- abyss-cultivator.md
|   +-- engineer-professional.md
|   +-- laowang-engineer.md
|   +-- nekomata-engineer.md
|   +-- ojousama-engineer.md
+-- skills/                # Codex runtime Skill
```

---

## 模板变量注入

安装时 `installer.ts` 会替换以下占位符：

| 占位符 | 说明 |
|--------|------|
| `{{FRONTEND_MODELS}}` | 前端模型列表（JSON 数组） |
| `{{FRONTEND_PRIMARY}}` | 前端主模型 |
| `{{BACKEND_MODELS}}` | 后端模型列表（JSON 数组） |
| `{{BACKEND_PRIMARY}}` | 后端主模型 |
| `{{REVIEW_MODELS}}` | 审查模型列表（JSON 数组） |
| `{{ROUTING_MODE}}` | 路由模式（smart/parallel/sequential） |
| `{{LITE_MODE_FLAG}}` | Lite 模式标志（`--lite ` 或空） |
| `{{MCP_SEARCH_TOOL}}` | MCP 搜索工具名 |
| `{{MCP_SEARCH_PARAM}}` | MCP 搜索参数名 |
| `{{MCP_PATH_PARAM}}` | MCP 路径参数名 |
| `~/.claude/...` | 替换为用户主目录的绝对路径 |

---

## 命令分类

### 开发工作流（13 个）
workflow / plan / execute / frontend / backend / feat / analyze / debug / optimize / test / review / manage / teammate

### 运行时直连工具（1 个）
codex

### Prompt 工具（1 个）
enhance

### 项目管理（1 个）
init

### Git 工具（4 个）
commit / rollback / clean-branches / worktree

### OpenSpec 系列（5 个）
spec-init / spec-research / spec-plan / spec-impl / spec-review

### Agent Teams 系列（4 个）
team-research / team-plan / team-exec / team-review

---

## 专家提示词统计

| 模型 | 数量 | 角色列表 |
|------|------|----------|
| Codex | 6 | analyzer / architect / debugger / optimizer / reviewer / tester |
| Gemini | 7 | analyzer / architect / debugger / frontend / optimizer / reviewer / tester |
| Claude | 6 | analyzer / architect / debugger / optimizer / reviewer / tester |
| **合计** | **19** | |

---

**扫描覆盖率**: 100%
**最后更新**: 2026-02-25
