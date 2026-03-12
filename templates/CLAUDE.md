[根目录](../CLAUDE.md) > **templates**

# Templates (命令模板 + 专家提示词 + 输出风格)

**Last Updated**: 2026-03-12 (manage runtime protocol + phase gates)

---

## 变更记录 (Changelog)

### 2026-03-12 (manage runtime protocol + phase gates)
- `manage.md` 改为：启动或恢复时优先读取任务目录中的 `runtime-protocol.md` / `phase-gate.md` / `progress.md` / `findings.md`
- 新增共享模板 `shared/manage-runtime-protocol.md` 与 `shared/manage-phase-gates.md`，把长期流程铁律与阶段 gate 合同外置
- `manage-state-format.md` 现在把 `runtime-protocol.md` / `phase-gate.md` 纳入任务目录，并定义恢复一致性要求
- `manage-pre-task.sh` / `manage-post-task.sh` 注入当前阶段、下一合法动作、禁止动作、Hard Stop 与恢复必读文件

### 2026-03-12 (manage runtime fallback)
- `manage.md` 改为：复杂任务默认通过 `ccg:codex-*` subagent 加载角色定义并与 `ccg-codex` MCP 协作
- `TeamCreate` 从默认复杂路径降为可选实验路径；仅在显式 Team 模式下要求 `Team Name / Team Lead Name / Teammate Name`
- `manage-state-format.md` 将 `Teammate Registry` 收口为 `Codex Worker Registry`，新增 `Runtime Mode`
- `README.md` 同步更新默认架构描述：简单任务单 worker，复杂任务默认 subagent，Team 仅可选

### 2026-03-12 (optional command packs)
- 新增 `packs.md` 核心命令，用于列出、安装、卸载可选扩展包
- 新增 `plugin/packs/manifest.template.json`，将 `legacy / extras / spec / team` 这 4 组命令构造成可安装 pack
- `installer.ts` 现在会在源码安装时同步生成 `~/.claude/.ccg/packs/`，插件构建会生成 `dist/plugin/packs/`
- `README.md` 更新为：插件用户通过 `/ccg:packs install <pack>` 按需启用扩展命令
- `manage.md` 修正为：主 Agent 永不直接修改源码；简单任务也必须派发给单 worker agent，而不是由 Lead 自己完成

### 2026-03-12 (manage teammate architecture)
- `manage.md` 改为 Lead -> `codex-analyzer|planner|executor|reviewer` worker -> `ccg-codex` MCP 的双层结构
- 新增 4 个角色化 teammate agent：`codex-analyzer.md`、`codex-planner.md`、`codex-executor.md`、`codex-reviewer.md`
- `manage-state-format.md` 与 `teammate-bus-format.md` 改为双层注册表：上层 worker/teammate 注册表，下层 `Codex Session Registry`
- `workflow.md`、`feat.md`、`frontend.md`、`backend.md`、`teammate.md` 仅保留为源码兼容层，不再进入插件构建产物
- `planner.md`、`ui-ux-designer.md`、`codex-collaborator.md`、`codex-operator.md` 仅保留为源码兼容层，不再进入默认安装和插件构建
- `optimize.md`、`test.md`、`clean-branches.md`、`spec-*`、`team-*` 仅保留为可选扩展源码，不再进入默认插件构建

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
- `manage.md` 曾强化为：复杂任务先尝试 `TeamCreate`，Phase 3 复杂代码修改优先 `ccg:codex-collaborator`
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
+-- commands/              # 31 个斜杠命令模板 -> ~/.claude/commands/ccg/
|   +-- agents/            # 10 个子智能体（其中 6 个进入默认安装/插件构建） -> ~/.claude/agents/ccg/
|   |   +-- planner.md             # 源码兼容层，不进入默认安装/插件构建
|   |   +-- ui-ux-designer.md      # 源码兼容层，不进入默认安装/插件构建
|   |   +-- init-architect.md
|   |   +-- codex-operator.md      # 源码兼容层，不进入默认安装/插件构建
|   |   +-- codex-collaborator.md  # 源码兼容层，不进入默认安装/插件构建
|   |   +-- codex-analyzer.md
|   |   +-- codex-planner.md
|   |   +-- codex-executor.md
|   |   +-- codex-reviewer.md
|   +-- get-current-datetime.md
|   +-- workflow.md         # 源码兼容入口，不进入插件构建
|   +-- plan.md             # 多模型协作规划
|   +-- execute.md          # 多模型协作执行
|   +-- frontend.md         # 源码兼容入口，不进入插件构建
|   +-- backend.md          # 源码兼容入口，不进入插件构建
|   +-- codex.md            # 运行时直连后端
|   +-- packs.md            # 扩展包管理
|   +-- feat.md             # 源码兼容入口，不进入插件构建
|   +-- analyze.md          # 技术分析
|   +-- debug.md            # 问题诊断
|   +-- optimize.md         # 可选扩展源码，不进入插件构建
|   +-- test.md             # 可选扩展源码，不进入插件构建
|   +-- review.md           # 代码审查
|   +-- enhance.md          # Prompt 增强
|   +-- init.md             # 项目初始化
|   +-- commit.md           # Git 智能提交
|   +-- rollback.md         # Git 回滚
|   +-- clean-branches.md   # 可选扩展源码，不进入插件构建
|   +-- worktree.md         # Git Worktree
|   +-- spec-init.md        # 可选扩展源码，不进入插件构建
|   +-- spec-research.md    # 可选扩展源码，不进入插件构建
|   +-- spec-plan.md        # 可选扩展源码，不进入插件构建
|   +-- spec-impl.md        # 可选扩展源码，不进入插件构建
|   +-- spec-review.md      # 可选扩展源码，不进入插件构建
|   +-- team-research.md    # 可选扩展源码，不进入插件构建
|   +-- team-plan.md        # 可选扩展源码，不进入插件构建
|   +-- team-exec.md        # 可选扩展源码，不进入插件构建
|   +-- team-review.md      # 可选扩展源码，不进入插件构建
|   +-- teammate.md         # 源码兼容入口，不进入插件构建
|   +-- validation-probe.md # Validation-only probe (excluded from CLI installer and plugin build)
+-- prompts/               # 25 个专家提示词 -> ~/.claude/.ccg/prompts/
|   +-- codex/             # 8 个 Codex 角色
|   |   +-- analyzer.md / architect.md / debugger.md / executor.md / optimizer.md / planner.md / reviewer.md / tester.md
|   +-- gemini/            # 9 个 Gemini 角色
|   |   +-- analyzer.md / architect.md / debugger.md / executor.md / frontend.md / optimizer.md / planner.md / reviewer.md / tester.md
|   +-- claude/            # 8 个 Claude 角色
|       +-- analyzer.md / architect.md / debugger.md / executor.md / optimizer.md / planner.md / reviewer.md / tester.md
+-- output-styles/         # 5 个输出风格 -> ~/.claude/output-styles/
|   +-- abyss-cultivator.md
|   +-- engineer-professional.md
|   +-- laowang-engineer.md
|   +-- nekomata-engineer.md
|   +-- ojousama-engineer.md
+-- skills/                # Codex runtime Skill
+-- plugin/packs/          # 可选命令包定义与 manifest 模板
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
| Codex | 8 | analyzer / architect / debugger / executor / optimizer / planner / reviewer / tester |
| Gemini | 9 | analyzer / architect / debugger / executor / frontend / optimizer / planner / reviewer / tester |
| Claude | 8 | analyzer / architect / debugger / executor / optimizer / planner / reviewer / tester |
| **合计** | **25** | |

---

**扫描覆盖率**: 100%
**最后更新**: 2026-03-12
