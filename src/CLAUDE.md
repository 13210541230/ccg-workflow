[根目录](../CLAUDE.md) > **src**

# CLI Tool (TypeScript)

**Last Updated**: 2026-02-25 (v1.7.61)

---

## 变更记录 (Changelog)

### 2026-02-25
- 初次由架构扫描器生成此模块文档
- 新增 `i18next` / `i18next-fs-backend` / `pathe` 依赖记录
- 记录 Claude 提示词（claude/ 目录）共 6 个，总专家提示词 19 个

---

## 模块职责

TypeScript CLI 工具，负责 CCG 多模型协作系统的交互式安装、配置、更新和诊断。用户通过 `npx ccg-workflow` 触发，核心能力：

1. **一键安装** -- 交互式引导用户完成命令模板、专家提示词、codeagent-wrapper 二进制、MCP 配置的安装
2. **交互式菜单** -- 提供初始化/更新/卸载/MCP 配置/API 配置/输出风格/实用工具的统一入口
3. **MCP 工具管理** -- 支持 fast-context / ace-tool / ace-tool-rs 及辅助 MCP（Context7/Playwright/DeepWiki/Exa）
4. **跨平台适配** -- Windows MCP 命令包装（cmd /c）、路径规范化、Git Bash 兼容
5. **版本管理** -- 自动检测更新、增量升级工作流模板
6. **配置迁移** -- v1.3.x -> v1.4.0 目录结构自动迁移
7. **国际化** -- 内置中/英双语支持（i18next）

---

## 入口与启动

- **主入口**: `cli.ts` -> `cac('ccg')` -> `cli-setup.ts`
- **构建入口**: `build.config.ts`（unbuild，输出到 `dist/`）
- **npm 入口**: `bin/ccg.mjs` -> `dist/cli.mjs`
- **库导出**: `index.ts`（所有公共 API 导出）

---

## 对外接口

### CLI 命令

| 命令 | 实现文件 | 说明 |
|------|----------|------|
| `ccg` (默认) | `commands/menu.ts` | 显示交互式菜单 |
| `ccg init` / `ccg i` | `commands/init.ts` | 初始化 CCG 系统 |
| `ccg config mcp` | `commands/config-mcp.ts` | MCP 工具配置 |
| `ccg diagnose-mcp` | `commands/diagnose-mcp.ts` | MCP 配置诊断 |
| `ccg fix-mcp` | `commands/diagnose-mcp.ts` | 修复 Windows MCP 配置 |

### CLI 选项

| 选项 | 说明 |
|------|------|
| `--lang, -l <lang>` | 显示语言（zh-CN / en） |
| `--force, -f` | 强制覆盖现有配置 |
| `--skip-prompt, -s` | 跳过所有交互式提示 |
| `--skip-mcp` | 跳过 MCP 配置（更新时使用） |
| `--frontend, -F <models>` | 前端模型 |
| `--backend, -B <models>` | 后端模型 |
| `--mode, -m <mode>` | 协作模式 |
| `--install-dir, -d <path>` | 安装目录 |

### 库导出 (`index.ts`)

```typescript
// 命令
export { init, showMainMenu, update }

// 国际化
export { i18n, initI18n, changeLanguage }

// 配置管理
export { readCcgConfig, writeCcgConfig, createDefaultConfig, createDefaultRouting, getCcgDir, getConfigPath }

// 安装管理
export { getWorkflowConfigs, getWorkflowById, installWorkflows, installAceTool, installAceToolRs, uninstallWorkflows, uninstallAceTool }

// 迁移
export { migrateToV1_4_0, needsMigration }

// 版本
export { getCurrentVersion, getLatestVersion, checkForUpdates, compareVersions }
```

---

## 关键依赖与配置

### 运行时依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `cac` | ^6.7.14 | CLI 框架 |
| `inquirer` | ^12.9.6 | 交互式提示 |
| `ora` | ^9.0.0 | 加载动画 |
| `ansis` | ^4.1.0 | 终端颜色 |
| `fs-extra` | ^11.3.2 | 文件系统工具 |
| `smol-toml` | ^1.4.2 | TOML 解析（配置文件） |
| `i18next` | ^25.5.2 | 国际化框架 |
| `i18next-fs-backend` | ^2.6.0 | i18next 文件后端 |
| `pathe` | ^2.0.3 | 跨平台路径处理 |

### 开发依赖

| 包 | 用途 |
|----|------|
| `typescript` ^5.9.2 | 类型检查 |
| `unbuild` ^3.6.1 | 构建工具 |
| `tsx` ^4.20.5 | TS 执行器（开发模式） |
| `@antfu/eslint-config` ^5.4.1 | ESLint 配置 |
| `eslint` ^9.36.0 | 代码检查 |

### 配置文件

| 文件 | 用途 |
|------|------|
| `package.json` | npm 包配置 |
| `tsconfig.json` | TypeScript 配置 |
| `build.config.ts` | unbuild 构建配置 |

---

## 数据模型 (`types/index.ts`)

### 核心类型

| 类型 | 说明 |
|------|------|
| `SupportedLang` | `'zh-CN' \| 'en'` |
| `ModelType` | `'codex' \| 'gemini' \| 'claude'` |
| `CollaborationMode` | `'parallel' \| 'smart' \| 'sequential'` |
| `RoutingStrategy` | `'parallel' \| 'fallback' \| 'round-robin'` |

### 核心接口

| 接口 | 说明 |
|------|------|
| `ModelRouting` | 模型路由配置（前端/后端/审查） |
| `CcgConfig` | CCG 主配置（general/routing/workflows/paths/mcp/performance） |
| `WorkflowConfig` | 工作流定义（id/name/category/commands） |
| `InitOptions` | 初始化选项 |
| `InstallResult` | 安装结果 |
| `AceToolConfig` | ace-tool MCP 配置 |

---

## 源文件清单

### 入口层
| 文件 | 职责 |
|------|------|
| `cli.ts` | CLI 主入口（cac 初始化） |
| `cli-setup.ts` | 命令注册 + 帮助文本 |
| `index.ts` | 库导出 |

### 命令层 (`commands/`)
| 文件 | 职责 |
|------|------|
| `init.ts` | 初始化命令（MCP 选择、API 配置、安装流程） |
| `update.ts` | 更新命令（版本检测、增量升级） |
| `menu.ts` | 交互式菜单（init/update/config/tools/uninstall/help） |
| `config-mcp.ts` | MCP 工具配置（fast-context/ace-tool/辅助工具） |
| `diagnose-mcp.ts` | MCP 诊断 + Windows 修复 |

### 工具层 (`utils/`)
| 文件 | 职责 |
|------|------|
| `installer.ts` | 核心安装逻辑（命令/提示词/agents/skills/二进制/MCP） |
| `config.ts` | CCG 配置管理（TOML 读写） |
| `mcp.ts` | MCP 配置管理（claude.json 读写/Windows 修复/备份） |
| `platform.ts` | 跨平台工具（Windows/macOS/Linux 检测、MCP 命令包装） |
| `version.ts` | 版本管理（npm registry 查询、语义化版本比较） |
| `migration.ts` | v1.3.x -> v1.4.0 迁移 |

### 其他层
| 文件 | 职责 |
|------|------|
| `i18n/index.ts` | 国际化（内嵌中/英文翻译资源） |
| `types/index.ts` | 类型定义 |
| `types/cli.ts` | CLI 选项类型 |

---

## 测试与质量

- **测试**: 暂无自动化测试文件（TypeScript 部分）
- **类型检查**: `pnpm typecheck`（tsc --noEmit）
- **代码检查**: `pnpm lint`（eslint）
- **构建验证**: `pnpm build`（unbuild）

---

## 常见问题 (FAQ)

**Q: Windows 上 MCP 工具启动失败？**
A: 需要用 `cmd /c` 包装 npx 命令。运行 `npx ccg fix-mcp` 自动修复。

**Q: 如何更新命令模板但保留 MCP 配置？**
A: 使用 `--skip-mcp` 选项：`npx ccg-workflow init --force --skip-mcp --skip-prompt`

**Q: 安装时路径中包含 `~` 不解析？**
A: `replaceHomePathsInTemplate()` 在安装时将所有 `~/.claude/...` 替换为绝对路径。

---

**扫描覆盖率**: 100%
**最后更新**: 2026-02-25
