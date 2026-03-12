# CCG Multi-Model Collaboration System (ccg-workflow)

**Last Updated**: 2026-03-12 (v1.9.0)

---

## 变更记录 (Changelog)

> 完整变更历史请查看 [CHANGELOG.md](./CHANGELOG.md)

### 2026-03-12 (v1.9.0 - optional command packs + command surface reduction)
- 新增 `/ccg:packs` 核心命令，插件用户可直接列出、安装、卸载可选扩展命令包
- 默认发布面收口到 13 个核心命令；`workflow / feat / frontend / backend / teammate / spec-* / team-* / optimize / test / clean-branches` 改为可选 pack 或源码兼容层
- 新增 `legacy / extras / spec / team` 四类 pack 资产，插件构建与源码安装都会生成对应 manifest 和命令模板
- `ccg-codex` runtime 补齐 `planner` / `executor` 角色，复杂任务可直接建立对应的 Codex teammate 会话
- 发版脚本新增 `packs/` 同步，确保 `/plugin update` 后的发布版可实际安装扩展命令

### 2026-03-12 (v1.8.2 - release pipeline fix for plugin runtime files)
- 修复发版脚本漏同步插件根目录运行时文件的问题，`start.mjs` 与 `server.bundle.mjs` 现在会随 `.mcp.json` 一起发布到 `ccg-plugin`
- 修复 `1.8.1` 发布回归：用户更新发布版后，`ccg-codex` MCP 不再因缺少 Node 运行时入口文件而连接失败

### 2026-03-12 (v1.8.1 - ccg-codex MCP runtime hardening)
- `ccg-codex` 插件入口从直接执行 Python 脚本改为 `node start.mjs`，修复插件环境下相对路径和连接握手不稳定问题
- 新增 Node `server.bundle.mjs`，使用官方 MCP TypeScript SDK 处理 `initialize`、`tools/list`、`ping`
- `ccg_codex_mcp.py` 收口为 helper CLI，继续承接 Codex session / bridge 逻辑，不再直接暴露 MCP stdio server

### 2026-03-12 (v1.7.82 - manage routing hardening + worker reuse)
- `/ccg:manage` 复杂任务默认先尝试 `TeamCreate`，复杂代码修改优先 `ccg:codex-collaborator`，避免错误落到 `general-purpose`
- `analyze-worker`、`plan-worker`、`review-worker`、`execute-worker` 补充 Codex 超时/空输出处理规则，禁止静默降级为 Agent 自行补做
- `manage-state-format.md` 新增 Phase 3 Worker Registry；测试失败或审查回流时优先 resume 原实施 worker，避免重复分析上下文

### 2026-03-12 (v1.8.0 - manage mcp runtime)
- 新增内置 `ccg-codex` MCP server，提供 `codex_once` 与持久化 `codex_session_*` 工具，普通任务也可直接调用通用 Codex 能力
- `/ccg:manage` 重写为简单任务 Claude 直做、复杂任务通过 `ccg-codex` MCP 驱动多角色 Codex 会话
- `manage-state-format.md` 新增 `codex-sessions/` 与 `Session Registry`，统一记录会话复用状态

### 2026-03-11 (v1.7.81 - manage agent-teams default + Codex escalation rules)
- `/ccg:manage` 在 Phase 3/4 默认优先尝试 Agent Teams，仅在 TeamCreate 不可用或失败时降级
- `codex-collaborator` 新增“必须调用 / 禁止调用 / 默认处理”三级 Codex 判定规则
- `analyze-worker`、`plan-worker`、`test-worker` 补充明确的 Codex 触发条件，避免简单任务滥用或复杂任务漏调

### 2026-03-11 (v1.7.79 - manage agent-teams 集成)
- manage.md Phase 3/4 新增 agent-teams subagent 类型表 + TeamCreate/TeamDelete 生命周期
- Agent 调用模板新增 name + team_name 参数，第 4 步新增消息处理指令
- execute-worker 模型选择从文件数量判断重写为 Codex/Claude 能力导向多维判断
- worker prompt recipient 修复：`"lead"` → `"team-lead"`（经实际 teammate 测试验证）

### 2026-03-11 (v1.7.80 - wrapper-free runtime + Gemini bridge 恢复)
- 运行时主链切换为 `codex_bridge.py + codex-runtime Skill`，移除 `codeagent-wrapper` 二进制依赖
- `codex_bridge.py` 恢复多后端执行，支持 `codex` / `gemini` / `claude`
- `codex-runtime` Skill runner 改为多后端，默认仍走 Codex，Gemini 链路保留
- 共享调用规范改为通过 `CCG_BACKEND` 解析 prompts 路径，避免配置层和运行时脱节

### 2026-03-10 (v1.7.78 - manage SubAgent 文件指向派发)
- manage.md SubAgent 派发从 4 步简化为 3 步，子Agent 自行读取 prompt 文件
- 消除主 Agent 读取 prompt 全文的上下文开销

### 2026-03-10 (v1.7.77 - manage 文件化 Prompt 管道)
- assemble-prompt.sh 重构为文件读写模式（`--input-dir` / `--output`），删除环境变量传参
- manage.md SubAgent 派发改为 4 步文件化管道（Write → Bash → Read → Agent）
- manage-state-format.md 新增 inputs/prompts 目录规范

### 2026-03-10 (v1.7.76 - .gitattributes CRLF 自保护)
- .gitattributes 添加自保护规则防止自身被 CRLF 化
- ccg-plugin run-wrapper glob 改为直接路径 + 强制重新索引

### 2026-03-10 (v1.7.75 - manage 迭代循环 + CRLF 修复)
- 修复 CRLF 行尾导致所有 .sh 脚本在 Windows 上无法执行（新增 .gitattributes + 构建时 LF 强制）
- manage Phase 3/4/5 重构为迭代循环（实施→测试→审查→修复），最多 3 轮收敛
- Phase 4 审查后 Critical 修复强制 spawn execute-worker（禁止主 Agent 直接编辑源码）
- Phase 5 测试从"可选"改为"必须"，不可测试时强制向用户说明原因
- assemble-prompt.sh 新增 6 条防御性替换规则对齐 build-plugin.mjs

### 2026-03-09 (v1.7.74 - manage 双向通信)
- manage Phase 3/4 改造为 Agent Teams Teammate 模式，支持 Worker ↔ 主 Agent 阻塞式请求
- execute-worker 新增 4 种通信触发场景，review-worker 新增 3 种
- assemble-prompt.sh 新增 `{{TEAM_NAME}}` 占位符，progress.md 新增消息日志表
- Agent Teams 不可用时自动降级为旧模式

### 2026-03-09 (v1.7.73 - codex-operator 人机反转代理)
- 新增 `codex-operator` agent：Agent 扮演人类审查者，Codex(GPT-5.4) 自主执行，5 轮交互上限
- 修复 manage.md 后台 Agent 等待机制缺失，防止 resume 运行中 Agent 报错
- agents 数量 4→5

### 2026-03-08 (v1.7.71 - manage 轻量化重构)
- manage.md 从 853→269 行，转为纯编排器（删除多模型调用规范、外置状态文件格式）
- 5 个 worker 模板新增自适应 Codex 策略：简单任务 Claude 直接处理，复杂任务 Codex 双模型

### 2026-03-08 (v1.7.70 - manage 子Agent 路径修复)
- 修复 `$CLAUDE_PLUGIN_ROOT` 在 Task spawn 子Agent 中不继承，导致 Codex 双模型调用失败
- manage.md Phase 0 新增路径解析步骤（0.0），启动时解析 plugin root 绝对路径
- 子Agent 模板注入时用绝对路径替换环境变量占位符

### 2026-03-08 (v1.7.69 - 模板去重合并)
- 新增 `templates/shared/` 共享片段目录（multi-model-spec / dev-domain-workflow / agent-prompts）
- 11 个命令模板提取多模型调用规范为运行时引用，各减少 ~45 行
- frontend.md / backend.md 共享 6 阶段工作流，各从 164→53 行
- manage.md 的 5 个子Agent prompt 外置，从 1357→828 行
- installer.ts 新增 shared/ 递归安装逻辑
- 总计减少 ~1,100 行重复内容

### 2026-03-08 (v1.7.68 - upstream 合并 + 适配)
- 合并 upstream 5 个提交：MCP skip 修复、OpenSpec 1.2 适配、spec-research 并行调用补全
- 测试体系：新增 vitest（34 单元 + 12 E2E = 46 个测试），覆盖 skip/fast-context/ace-tool
- 适配改造：所有模板 Gemini 引用替换为 Codex-B，默认 provider 改为 fast-context

### 2026-02-25 (插件集成 + manage 命令)
- 新增 `/ccg:manage` 主Agent调度命令（自动化编排 + planning-with-files 状态管理）
- `debug.md` 集成 sequential-thinking 结构化假设推理
- `plan.md` 集成 sequential-thinking 需求分解
- `review.md` 集成 comprehensive-review 三维本地审查（架构+安全+代码质量）
- 命令模板统计：26 -> 27 个

### 2026-02-25 (架构扫描更新)
- 全仓重新扫描，更新文件统计与模块覆盖率
- 新增模块级 CLAUDE.md：`src/CLAUDE.md`、`templates/CLAUDE.md`
- 更新专家提示词统计：12 -> 19 个（Codex 6 + Gemini 7 + Claude 6）
- 更新命令模板统计：25 -> 26 个（含 enhance）
- 新增 `.claude/index.json` 覆盖率报告与缺口分析
- 新增 `persist.go` 输出持久化模块记录

### 2026-02-10 (v1.7.60)
- Agent Teams 系列：新增 4 个独立命令（`team-research`/`team-plan`/`team-exec`/`team-review`）
- 并行实施：利用 Claude Code Agent Teams spawn Builder teammates 并行写代码
- 完整链路：需求->约束 -> 消除歧义->计划 -> 并行实施 -> 双模型审查
- 完全独立：Team 系列不依赖现有 ccg 命令，自成体系

### 2026-02-08 (v1.7.57)
- MCP 工具扩展：新增 fast-context（推荐）+ 辅助工具（Context7/Playwright/DeepWiki/Exa）
- API 配置：初始化和菜单新增 API 配置，自动添加优化配置和权限白名单
- 实用工具：新增 ccusage（用量分析）+ CCometixLine（状态栏）
- Claude Code 安装：支持 npm/homebrew/curl/powershell/cmd 多种方式

### 2026-01-26 (v1.7.52)
- OpenSpec 升级：迁移到 OPSX 架构，废弃 `/openspec:xxx`，启用 `/opsx:xxx`
- 命令更新：更新 `spec-*` 系列命令以支持新的 `/opsx` 命令

### 2026-01-25 (v1.7.51)
- 修复默认语言为英文的问题：将 CLI 所有命令描述从硬编码英文改为中文

### 2026-01-21 (v1.7.47)
- 修复 `gemini/architect.md` 缺失：新增前端架构师角色提示词
- 专家提示词数量：12 -> 13 个（Codex 6 + Gemini 7）

---

## 项目愿景

**CCG (Claude + Codex)** 是一个多模型协作开发系统，以 Claude Code 为编排中心，通过 Codex teammate + MCP runtime 实现稳定协作。运行时默认走 Codex，同时保留 Gemini 作为可切换后端链路。以 Claude Code Plugin 形式分发，用户通过 `/install-plugin` 安装 13 个核心命令，并可通过 `/ccg:packs` 按需启用扩展命令。

---

## 架构总览

```mermaid
graph TD
    User["用户"] --> Plugin["/install-plugin"]
    Plugin --> Init["一键安装"]

    Init --> Commands["commands/<br/>13 个核心命令"]
    Init --> Agents["agents/<br/>6 个子智能体"]
    Init --> Prompts["prompts/<br/>19 个专家提示词"]
    Init --> Runtime["scripts + skills<br/>wrapper-free runtime"]

    User2["Claude Code 用户"] --> SlashCmd["/ccg:manage<br/>/ccg:packs<br/>..."]
    SlashCmd --> Commands

    Commands --> Bridge["codex_bridge.py<br/>(multi-backend bridge)"]
    Commands --> Skill["codex-runtime<br/>(Skill + script)"]
    Bridge --> Codex["Codex CLI<br/>(默认后端)"]
    Bridge --> Gemini["Gemini CLI<br/>(保留可切换链路)"]
    Skill --> Codex2["Codex CLI<br/>(默认执行)"]
    Skill --> Gemini2["Gemini CLI<br/>(按需切换)"]
    Skill --> Claude2["Claude CLI<br/>(兼容链路)"]

    style CLI fill:#90EE90
    style Bridge fill:#87CEEB
    style Skill fill:#87CEEB
```

---

## 模块结构图

```mermaid
graph TD
    A["(根) ccg-workflow<br/>v1.9.0"] --> B["src/<br/>TypeScript CLI"]
    A --> C["templates/skills/<br/>运行时 Skill"]
    A --> D["templates/<br/>命令 + 提示词"]
    A --> E["templates/plugin/scripts/<br/>运行时脚本"]

    B --> B1["commands/<br/>5 个 CLI 命令"]
    B --> B2["utils/<br/>6 个工具模块"]
    B --> B3["i18n/<br/>国际化"]
    B --> B4["types/<br/>类型定义"]

    D --> D1["commands/<br/>29 模板 + 6 agents"]
    D --> D2["prompts/<br/>19 专家提示词"]
    D --> D3["output-styles/<br/>5 输出风格"]
    D --> D4["skills/<br/>Skill + script"]

    click B "./src/CLAUDE.md" "查看 CLI 模块文档"
    click D "./templates/CLAUDE.md" "查看 templates 模块文档"
```

---

## 模块索引

| 模块 | 路径 | 语言 | 职责 | 文档 |
|------|------|------|------|------|
| CLI Tool | `src/` | TypeScript | 交互式安装/配置/更新/诊断 | [src/CLAUDE.md](./src/CLAUDE.md) |
| Runtime Skills | `templates/skills/` | Markdown + Script | 无二进制 Codex 运行时承接 | (随 templates 安装) |
| Templates | `templates/` | Markdown | 26 命令模板 + 19 专家提示词 + 5 输出风格 + Skills | [templates/CLAUDE.md](./templates/CLAUDE.md) |
| Runtime Scripts | `templates/plugin/scripts/` | Python + Bash | bridge / prompt 组装 / hooks | [templates/CLAUDE.md](./templates/CLAUDE.md) |

---

## 运行与开发

### 用户安装（插件模式）

在 Claude Code 中执行：
```
/install-plugin https://github.com/13210541230/ccg-plugin.git
```

更新插件：
```
/plugin update
```

### 开发模式

```bash
# 安装依赖
pnpm install

# 开发运行
pnpm dev

# 类型检查
pnpm typecheck

# 代码检查
pnpm lint
pnpm lint:fix

# 构建
pnpm build
```

### Runtime Skill / Script

```bash
python ~/.claude/skills/codex-runtime/scripts/ccg-codex-run.py --help
python ~/.claude/.ccg/scripts/codex_bridge.py --help
```

---

## 对外接口

### Slash Commands 接口（29 个命令）

**开发工作流（12 个）**:

| 命令 | 用途 | 模型 |
|------|------|------|
| `/ccg:workflow` | 完整 6 阶段工作流 | Codex + Codex |
| `/ccg:plan` | 多模型协作规划（Phase 1-2） | Codex + Codex |
| `/ccg:execute` | 多模型协作执行（Phase 3-5） | Codex + Claude |
| `/ccg:frontend` | 前端专项（快速模式） | Codex |
| `/ccg:backend` | 后端专项（快速模式） | Codex |
| `/ccg:feat` | 智能功能开发 | 规划 + 实施 |
| `/ccg:analyze` | 技术分析（仅分析） | Codex + Codex |
| `/ccg:debug` | 问题诊断 + 修复 | Codex + Codex |
| `/ccg:optimize` | 性能优化 | Codex + Codex |
| `/ccg:test` | 测试生成 | 智能路由 |
| `/ccg:review` | 代码审查（自动 git diff） | Codex + Codex |
| `/ccg:manage` | 主Agent调度（自动化编排） | sequential-thinking + comprehensive-review |

**运行时直连工具（1 个）**:

| 命令 | 用途 | 模型 |
|------|------|------|
| `/ccg:codex` | 直接通过 bridge/Skill 调用外部后端 | Codex / Gemini / Claude |

**Prompt 工具（1 个）**:

| 命令 | 用途 |
|------|------|
| `/ccg:enhance` | ace-tool Prompt 增强 |

**项目管理（1 个）**:

| 命令 | 用途 |
|------|------|
| `/ccg:init` | 初始化项目 CLAUDE.md |

**Git 工具（4 个）**:

| 命令 | 用途 |
|------|------|
| `/ccg:commit` | 智能提交（conventional commit） |
| `/ccg:rollback` | 交互式回滚 |
| `/ccg:clean-branches` | 清理已合并分支 |
| `/ccg:worktree` | Worktree 管理 |

**OpenSpec 系列（5 个）**:

| 命令 | 用途 |
|------|------|
| `/ccg:spec-init` | OpenSpec 初始化 |
| `/ccg:spec-research` | 需求研究 -> 约束集 |
| `/ccg:spec-plan` | 多模型分析 -> 零决策计划 |
| `/ccg:spec-impl` | 规范驱动实现 |
| `/ccg:spec-review` | 归档前双模型审查 |

**Agent Teams 并行实施（4 个）**（v1.7.60+，需 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`）:

| 命令 | 用途 | 说明 |
|------|------|------|
| `/ccg:team-research` | 需求 -> 约束集 | 并行探索代码库，双 Codex 分析 |
| `/ccg:team-plan` | 约束 -> 并行计划 | 消除歧义，拆分为文件范围隔离的独立子任务 |
| `/ccg:team-exec` | 并行实施 | spawn Builder teammates 并行写代码 |
| `/ccg:team-review` | 双模型审查 | 双 Codex 交叉审查 |

---

## 固定配置

v1.7.0 起，以下配置不再支持自定义：

| 项目 | 固定值 | 原因 |
|------|--------|------|
| 语言 | 中文 | 所有模板为中文 |
| 前端模型 | Codex | 双 Codex 架构 |
| 后端模型 | Codex（默认），可通过 `CCG_BACKEND=gemini` 或 `CCG_BACKEND=claude` 切换 | 默认保持 Codex，Gemini 链路保留 |
| 协作模式 | smart | 最佳实践 |
| 命令数量 | 29 个 | 全部安装 |

---

## 测试策略

| 模块 | 测试情况 |
|------|----------|
| `templates/skills/codex-runtime/` | Skill 文档 + 持久化 runner 脚本，覆盖 Codex/Gemini/Claude 无二进制运行时链路 |
| `src/` (TypeScript) | 46 个测试（34 单元 + 12 E2E），vitest |
| `templates/` (Markdown) | 无自动化测试；通过安装流程间接验证 |

---

## 编码规范

- **TypeScript**: `@antfu/eslint-config`，ESNext target，strict mode
- **Go**: 标准 Go 格式（gofmt），纯标准库无外部依赖
- **Markdown**: 命令模板使用 `---` frontmatter 描述用途
- **构建**: unbuild（TypeScript）、`go build`（Go）

---

## 关键依赖与配置

### TypeScript 依赖

**运行时**: `cac` / `inquirer` / `ora` / `ansis` / `fs-extra` / `smol-toml` / `i18next` / `i18next-fs-backend` / `pathe`

**开发**: `typescript` / `unbuild` / `tsx` / `eslint` / `@antfu/eslint-config`

### Go 依赖

- Go 1.21+，纯标准库（无第三方依赖）

### 配置文件路径

| 文件 | 用途 |
|------|------|
| `~/.claude/.ccg/config.toml` | CCG 主配置 |
| `~/.claude.json` | Claude Code MCP 服务配置 |
| `~/.claude/settings.json` | Claude Code 设置（API/权限/状态栏） |

---

## 相关文件清单

### 核心源码

```
src/
+-- cli.ts                     # CLI 入口
+-- cli-setup.ts               # 命令注册
+-- index.ts                   # 库导出
+-- commands/
|   +-- init.ts                # 初始化命令
|   +-- update.ts              # 更新命令
|   +-- menu.ts                # 交互式菜单
|   +-- config-mcp.ts          # MCP 配置
|   +-- diagnose-mcp.ts        # MCP 诊断
+-- utils/
|   +-- installer.ts           # 安装逻辑（核心）
|   +-- config.ts              # 配置管理
|   +-- mcp.ts                 # MCP 工具集成
|   +-- platform.ts            # 跨平台工具
|   +-- version.ts             # 版本管理
|   +-- migration.ts           # 数据迁移
+-- i18n/
|   +-- index.ts               # 国际化
+-- types/
    +-- index.ts               # 类型定义
    +-- cli.ts                 # CLI 类型
```

### 模板文件

```
templates/
+-- commands/                  # 29 个斜杠命令
+-- commands/agents/           # 6 个子智能体
+-- prompts/codex/             # 6 个 Codex 提示词
+-- prompts/gemini/            # 7 个 Gemini 提示词
+-- prompts/claude/            # 6 个 Claude 提示词
+-- output-styles/             # 5 个输出风格
+-- skills/codex-runtime/      # wrapper-free runtime Skill
+-- plugin/scripts/            # bridge + assemble + hooks
```

---

## AI 使用指引

- 使用 `/ccg:workflow` 进行完整 6 阶段开发工作流
- 使用 `/ccg:plan` + `/ccg:execute` 分步执行规划和实施
- 前端任务用 `/ccg:frontend`（路由到 Codex）
- 后端任务用 `/ccg:backend`（路由到 Codex）
- Agent Teams 系列需先启用 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- 代码审查无参数时自动审查 `git diff`

---

## 发版规则（必须严格遵守）

每次发版必须完成以下所有步骤，缺一不可：

### 1. 更新版本号
- 编辑 `package.json` 中的 `version` 字段

### 2. 更新 CHANGELOG.md
- 在顶部添加新版本条目
- 格式：`## [x.y.z] - YYYY-MM-DD`

### 3. 更新 README.md
- 更新命令表（如有新增命令）
- 更新底部版本号

### 4. 更新 CLAUDE.md
- 更新顶部 `Last Updated` 日期和版本号
- 添加变更记录条目
- 更新命令数量、接口表等受影响的章节

### 5. 构建 + 同步插件 + 推送

使用 release 技能自动化（详见 `.claude/skills/release/`）：

```bash
bash .claude/skills/release/scripts/release.sh x.y.z
```

脚本自动完成：更新版本号 → 构建插件 → 运行测试 → 同步到 ccg-plugin → 推送 ccg-plugin

然后手动提交 ccg-workflow：
```bash
git add -A
git commit -m "chore: bump version to x.y.z"
git push origin main
```

### 检查清单
- [ ] package.json 版本号已更新
- [ ] CHANGELOG.md 已添加新版本条目
- [ ] README.md 已更新
- [ ] CLAUDE.md 已更新
- [ ] 插件构建通过（`node scripts/build-plugin.mjs`）
- [ ] 测试通过（`npx vitest run`）
- [ ] ccg-plugin 已推送
- [ ] ccg-workflow 已推送

---

**扫描覆盖率**: 98%+
**最后更新**: 2026-02-25
