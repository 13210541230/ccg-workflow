import type { AceToolConfig, InstallResult, WorkflowConfig } from '../types'
import { homedir } from 'node:os'
import fs from 'fs-extra'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'pathe'
import { backupClaudeCodeConfig, buildMcpServerConfig, fixWindowsMcpConfig, mergeMcpServers, readClaudeCodeConfig, writeClaudeCodeConfig } from './mcp'
import { isWindows } from './platform'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Find package root by looking for package.json
function findPackageRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(join(dir, 'package.json'))) {
      return dir
    }
    dir = dirname(dir)
  }
  return startDir
}

const PACKAGE_ROOT = findPackageRoot(__dirname)
const SOURCE_ONLY_AGENT_FILES = new Set([
  'planner.md',
  'ui-ux-designer.md',
  'codex-collaborator.md',
  'codex-operator.md',
])

// Workflow configurations (for compatibility with existing code)
const WORKFLOW_CONFIGS: WorkflowConfig[] = [
  {
    id: 'workflow',
    name: '完整开发工作流',
    nameEn: 'Full Development Workflow',
    category: 'development',
    commands: ['workflow'],
    defaultSelected: false,
    order: 1,
    description: '兼容入口：已收口到 /ccg:manage',
    descriptionEn: 'Compatibility entry now redirected to /ccg:manage',
  },
  {
    id: 'plan',
    name: '多模型协作规划',
    nameEn: 'Multi-Model Planning',
    category: 'development',
    commands: ['plan'],
    defaultSelected: true,
    order: 1.5,
    description: '上下文检索 + 双模型分析 → 生成 Step-by-step 实施计划',
    descriptionEn: 'Context retrieval + dual-model analysis → Step-by-step plan',
  },
  {
    id: 'execute',
    name: '多模型协作执行',
    nameEn: 'Multi-Model Execution',
    category: 'development',
    commands: ['execute'],
    defaultSelected: true,
    order: 1.6,
    description: '根据计划获取原型 → Claude 重构实施 → 多模型审计交付',
    descriptionEn: 'Get prototype from plan → Claude refactor → Multi-model audit',
  },
  {
    id: 'frontend',
    name: '前端专项',
    nameEn: 'Frontend Tasks',
    category: 'development',
    commands: ['frontend'],
    defaultSelected: false,
    order: 2,
    description: '兼容入口：前端任务统一导向 /ccg:manage',
    descriptionEn: 'Compatibility entry: frontend tasks are routed to /ccg:manage',
  },
  {
    id: 'backend',
    name: '后端专项',
    nameEn: 'Backend Tasks',
    category: 'development',
    commands: ['backend'],
    defaultSelected: false,
    order: 3,
    description: '兼容入口：后端任务统一导向 /ccg:manage',
    descriptionEn: 'Compatibility entry: backend tasks are routed to /ccg:manage',
  },
  {
    id: 'feat',
    name: '智能功能开发',
    nameEn: 'Smart Feature Development',
    category: 'development',
    commands: ['feat'],
    defaultSelected: false,
    order: 4,
    description: '兼容入口：功能开发统一导向 /ccg:manage',
    descriptionEn: 'Compatibility entry: feature work is routed to /ccg:manage',
  },
  {
    id: 'analyze',
    name: '技术分析',
    nameEn: 'Technical Analysis',
    category: 'development',
    commands: ['analyze'],
    defaultSelected: true,
    order: 5,
    description: '双模型技术分析，仅分析不修改代码',
    descriptionEn: 'Dual-model technical analysis, analysis only',
  },
  {
    id: 'debug',
    name: '问题诊断',
    nameEn: 'Debug',
    category: 'development',
    commands: ['debug'],
    defaultSelected: true,
    order: 6,
    description: '多模型诊断 + 修复',
    descriptionEn: 'Multi-model diagnosis + fix',
  },
  {
    id: 'optimize',
    name: '性能优化',
    nameEn: 'Performance Optimization',
    category: 'development',
    commands: ['optimize'],
    defaultSelected: false,
    order: 7,
    description: '多模型性能优化',
    descriptionEn: 'Multi-model performance optimization',
  },
  {
    id: 'test',
    name: '测试生成',
    nameEn: 'Test Generation',
    category: 'development',
    commands: ['test'],
    defaultSelected: false,
    order: 8,
    description: '智能路由测试生成',
    descriptionEn: 'Smart routing test generation',
  },
  {
    id: 'review',
    name: '代码审查',
    nameEn: 'Code Review',
    category: 'development',
    commands: ['review'],
    defaultSelected: true,
    order: 9,
    description: '双模型代码审查，无参数时自动审查 git diff',
    descriptionEn: 'Dual-model code review, auto-review git diff when no args',
  },
  {
    id: 'codex',
    name: 'Codex 直连',
    nameEn: 'Codex Direct',
    category: 'development',
    commands: ['codex'],
    defaultSelected: true,
    order: 9.2,
    description: '直接调用运行时后端',
    descriptionEn: 'Direct runtime backend access',
  },
  {
    id: 'enhance',
    name: 'Prompt 增强',
    nameEn: 'Prompt Enhancement',
    category: 'development',
    commands: ['enhance'],
    defaultSelected: true,
    order: 9.5,
    description: 'ace-tool Prompt 增强工具',
    descriptionEn: 'ace-tool prompt enhancement',
  },
  {
    id: 'packs',
    name: '扩展包管理',
    nameEn: 'Extension Packs',
    category: 'development',
    commands: ['packs'],
    defaultSelected: true,
    order: 9.6,
    description: '列出、安装、卸载可选命令包',
    descriptionEn: 'List, install, and remove optional command packs',
  },
  {
    id: 'init-project',
    name: '项目初始化',
    nameEn: 'Project Init',
    category: 'init',
    commands: ['init'],
    defaultSelected: true,
    order: 10,
    description: '初始化项目 AI 上下文，生成 CLAUDE.md',
    descriptionEn: 'Initialize project AI context, generate CLAUDE.md',
  },
  {
    id: 'commit',
    name: 'Git 提交',
    nameEn: 'Git Commit',
    category: 'git',
    commands: ['commit'],
    defaultSelected: true,
    order: 20,
    description: '智能生成 conventional commit 信息',
    descriptionEn: 'Smart conventional commit message generation',
  },
  {
    id: 'rollback',
    name: 'Git 回滚',
    nameEn: 'Git Rollback',
    category: 'git',
    commands: ['rollback'],
    defaultSelected: true,
    order: 21,
    description: '交互式回滚分支到历史版本',
    descriptionEn: 'Interactive rollback to historical version',
  },
  {
    id: 'clean-branches',
    name: 'Git 清理分支',
    nameEn: 'Git Clean Branches',
    category: 'git',
    commands: ['clean-branches'],
    defaultSelected: false,
    order: 22,
    description: '安全清理已合并或过期分支',
    descriptionEn: 'Safely clean merged or stale branches',
  },
  {
    id: 'worktree',
    name: 'Git Worktree',
    nameEn: 'Git Worktree',
    category: 'git',
    commands: ['worktree'],
    defaultSelected: true,
    order: 23,
    description: '管理 Git worktree',
    descriptionEn: 'Manage Git worktree',
  },
  {
    id: 'spec-init',
    name: 'OpenSpec 初始化',
    nameEn: 'OpenSpec Init',
    category: 'spec',
    commands: ['spec-init'],
    defaultSelected: false,
    order: 30,
    description: '初始化 OpenSpec 环境 + 验证多模型 MCP 工具',
    descriptionEn: 'Initialize OpenSpec environment with multi-model MCP validation',
  },
  {
    id: 'spec-research',
    name: '需求研究',
    nameEn: 'Spec Research',
    category: 'spec',
    commands: ['spec-research'],
    defaultSelected: false,
    order: 31,
    description: '需求 → 约束集（并行探索 + OpenSpec 提案）',
    descriptionEn: 'Transform requirements into constraint sets via parallel exploration',
  },
  {
    id: 'spec-plan',
    name: '零决策规划',
    nameEn: 'Spec Plan',
    category: 'spec',
    commands: ['spec-plan'],
    defaultSelected: false,
    order: 32,
    description: '多模型分析 → 消除歧义 → 零决策可执行计划',
    descriptionEn: 'Refine proposals into zero-decision executable plans',
  },
  {
    id: 'spec-impl',
    name: '规范驱动实现',
    nameEn: 'Spec Implementation',
    category: 'spec',
    commands: ['spec-impl'],
    defaultSelected: false,
    order: 33,
    description: '按规范执行 + 多模型协作 + 归档',
    descriptionEn: 'Execute changes via multi-model collaboration with spec compliance',
  },
  {
    id: 'spec-review',
    name: '归档前审查',
    nameEn: 'Spec Review',
    category: 'spec',
    commands: ['spec-review'],
    defaultSelected: false,
    order: 34,
    description: '双模型交叉审查 → Critical 必须修复 → 允许归档',
    descriptionEn: 'Multi-model compliance review before archiving',
  },
  {
    id: 'team-research',
    name: 'Agent Teams 需求研究',
    nameEn: 'Agent Teams Research',
    category: 'development',
    commands: ['team-research'],
    defaultSelected: false,
    order: 1.8,
    description: '并行探索代码库，产出约束集 + 可验证成功判据',
    descriptionEn: 'Parallel codebase exploration, produces constraint sets + success criteria',
  },
  {
    id: 'team-plan',
    name: 'Agent Teams 规划',
    nameEn: 'Agent Teams Planning',
    category: 'development',
    commands: ['team-plan'],
    defaultSelected: false,
    order: 2.1,
    description: 'Lead 调用 Codex 并行分析，产出零决策并行实施计划',
    descriptionEn: 'Lead orchestrates Codex analysis, produces zero-decision parallel plan',
  },
  {
    id: 'team-exec',
    name: 'Agent Teams 并行实施',
    nameEn: 'Agent Teams Parallel Execution',
    category: 'development',
    commands: ['team-exec'],
    defaultSelected: false,
    order: 2.5,
    description: '读取计划文件，spawn Builder teammates 并行写代码，需启用 Agent Teams',
    descriptionEn: 'Read plan file, spawn Builder teammates for parallel implementation',
  },
  {
    id: 'team-review',
    name: 'Agent Teams 审查',
    nameEn: 'Agent Teams Review',
    category: 'development',
    commands: ['team-review'],
    defaultSelected: false,
    order: 3.1,
    description: '双模型交叉审查并行实施产出，分级处理 Critical/Warning/Info',
    descriptionEn: 'Dual-model cross-review with severity classification',
  },
  {
    id: 'manage',
    name: '主Agent调度',
    nameEn: 'Agent Orchestration',
    category: 'development',
    commands: ['manage'],
    defaultSelected: true,
    order: 0.5,
    description: '主Agent调度模式：自动化任务编排 + 状态管理 + 多维审查',
    descriptionEn: 'Main agent orchestration with automated task dispatch and state management',
  },
  {
    id: 'teammate',
    name: 'Teammate 协作',
    nameEn: 'Teammate Collaboration',
    category: 'development',
    commands: ['teammate'],
    defaultSelected: false,
    order: 0.6,
    description: '兼容入口：teammate 模式已并回 /ccg:manage',
    descriptionEn: 'Compatibility entry: teammate mode is folded back into /ccg:manage',
  },
]

export function getWorkflowConfigs(): WorkflowConfig[] {
  return WORKFLOW_CONFIGS.sort((a, b) => a.order - b.order)
}

export function getWorkflowById(id: string): WorkflowConfig | undefined {
  return WORKFLOW_CONFIGS.find(w => w.id === id)
}

/**
 * Get all command IDs for installation
 * No more presets - always install all commands
 */
export function getAllCommandIds(): string[] {
  return WORKFLOW_CONFIGS.map(w => w.id)
}

export function getDefaultCommandIds(): string[] {
  return WORKFLOW_CONFIGS.filter(w => w.defaultSelected).map(w => w.id)
}

export function getOptionalCommandIds(): string[] {
  return WORKFLOW_CONFIGS.filter(w => !w.defaultSelected).map(w => w.id)
}

/**
 * @deprecated Use getAllCommandIds() instead
 * Kept for backward compatibility
 */
export const WORKFLOW_PRESETS = {
  default: {
    name: '默认核心',
    nameEn: 'Default Core',
    description: '默认安装的核心命令集',
    descriptionEn: 'Default core command set',
    workflows: WORKFLOW_CONFIGS.filter(w => w.defaultSelected).map(w => w.id),
  },
  full: {
    name: '完整',
    nameEn: 'Full',
    description: `全部命令（${WORKFLOW_CONFIGS.length}个）`,
    descriptionEn: `All commands (${WORKFLOW_CONFIGS.length})`,
    workflows: WORKFLOW_CONFIGS.map(w => w.id),
  },
}

export type WorkflowPreset = keyof typeof WORKFLOW_PRESETS

export function getWorkflowPreset(preset: WorkflowPreset): string[] {
  return [...WORKFLOW_PRESETS[preset].workflows]
}

/**
 * Replace template variables in content based on user configuration
 * This injects model routing configs at install time
 * Note: MCP tool names are now hardcoded to ace-tool in templates
 */
export function injectConfigVariables(content: string, config: {
  routing?: {
    mode?: string
    frontend?: { models?: string[], primary?: string }
    backend?: { models?: string[], primary?: string }
    review?: { models?: string[] }
  }
  liteMode?: boolean
  mcpProvider?: string
}): string {
  let processed = content

  // Model routing injection
  const routing = config.routing || {}

  // Frontend models
  const frontendModels = routing.frontend?.models || ['codex']
  const frontendPrimary = routing.frontend?.primary || 'codex'
  processed = processed.replace(/\{\{FRONTEND_MODELS\}\}/g, JSON.stringify(frontendModels))
  processed = processed.replace(/\{\{FRONTEND_PRIMARY\}\}/g, frontendPrimary)

  // Backend models
  const backendModels = routing.backend?.models || ['codex']
  const backendPrimary = routing.backend?.primary || 'codex'
  processed = processed.replace(/\{\{BACKEND_MODELS\}\}/g, JSON.stringify(backendModels))
  processed = processed.replace(/\{\{BACKEND_PRIMARY\}\}/g, backendPrimary)

  // Review models
  const reviewModels = routing.review?.models || ['codex', 'codex']
  processed = processed.replace(/\{\{REVIEW_MODELS\}\}/g, JSON.stringify(reviewModels))

  // Routing mode
  const routingMode = routing.mode || 'smart'
  processed = processed.replace(/\{\{ROUTING_MODE\}\}/g, routingMode)

  // Legacy lite-mode placeholder, kept for template compatibility
  const liteModeFlag = config.liteMode ? '--lite ' : ''
  processed = processed.replace(/\{\{LITE_MODE_FLAG\}\}/g, liteModeFlag)

  // MCP tool injection based on provider ('skip' gets Glob+Grep fallback, default is fast-context)
  const mcpProvider = config.mcpProvider || 'fast-context'
  if (mcpProvider === 'skip') {
    // MCP skipped: remove all MCP tool references, replace with Glob+Grep fallback

    // 1) Agent frontmatter — remove MCP tool from tools declaration
    processed = processed.replace(/,\s*\{\{MCP_SEARCH_TOOL\}\}/g, '')

    // 2) Code blocks containing MCP tool invocation — replace with fallback guidance
    processed = processed.replace(
      /```\n\{\{MCP_SEARCH_TOOL\}\}[\s\S]*?\n```/g,
      '> MCP 未配置。使用 `Glob` 定位文件 + `Grep` 搜索关键符号 + `Read` 读取文件内容。',
    )

    // 3) Inline backtick references — replace with fallback tool names
    processed = processed.replace(
      /`\{\{MCP_SEARCH_TOOL\}\}`/g,
      '`Glob + Grep`（MCP 未配置）',
    )

    // 4) Any remaining bare references (safety net)
    processed = processed.replace(/\{\{MCP_SEARCH_TOOL\}\}/g, 'Glob + Grep')

    // 5) MCP_SEARCH_PARAM / MCP_PATH_PARAM — not applicable when skipped
    processed = processed.replace(/\{\{MCP_SEARCH_PARAM\}\}/g, '')
    processed = processed.replace(/\{\{MCP_PATH_PARAM\}\}/g, '')
  }
  else if (mcpProvider === 'fast-context') {
    // fast-context MCP tools (default)
    processed = processed.replace(/\{\{MCP_SEARCH_TOOL\}\}/g, 'mcp__fast-context__fast_context_search')
    processed = processed.replace(/\{\{MCP_SEARCH_PARAM\}\}/g, 'query')
    processed = processed.replace(/\{\{MCP_PATH_PARAM\}\}/g, 'project_path')
  }
  else {
    // ace-tool / ace-tool-rs MCP tools (default)
    processed = processed.replace(/\{\{MCP_SEARCH_TOOL\}\}/g, 'mcp__ace-tool__search_context')
    processed = processed.replace(/\{\{MCP_SEARCH_PARAM\}\}/g, 'query')
    processed = processed.replace(/\{\{MCP_PATH_PARAM\}\}/g, 'project_root_path')
  }

  return processed
}

/**
 * Normalize path for the current platform
 * - Windows: C:\Users\zlb (Native Windows path, for PowerShell/CMD compatibility)
 * - Unix: /Users/zlb
 */
function normalizePath(p: string): string {
  if (isWindows()) {
    // Return native Windows path (backslashes)
    // This is critical for PowerShell execution which fails with /c/Users/... style paths
    return p.replace(/\//g, '\\')
  }
  return p
}

/**
 * Convert Windows path to Git Bash compatible format
 * C:\Users\zlb → /c/Users/zlb
 * D:\code → /d/code
 */
function convertToGitBashPath(windowsPath: string): string {
  if (!isWindows()) {
    return windowsPath
  }

  // Normalize to forward slashes first
  let path = windowsPath.replace(/\\/g, '/')

  // Convert drive letter: C:/Users/... → /c/Users/...
  // Match pattern: [A-Z]:/ at the start
  path = path.replace(/^([A-Z]):/i, (_, drive) => `/${drive.toLowerCase()}`)

  return path
}

/**
 * Replace ~ paths in template content with absolute paths
 * This fixes Windows multi-user path resolution issues
 *
 * IMPORTANT: Always use forward slashes (/) for cross-platform compatibility.
 * Windows Git Bash requires forward slashes in heredoc (backslashes get escaped).
 * PowerShell and CMD also support forward slashes for most commands.
 */
function replaceHomePathsInTemplate(content: string, installDir: string): string {
  // Get absolute paths for replacement
  const userHome = homedir()
  const ccgDir = join(installDir, '.ccg')
  const claudeDir = installDir // ~/.claude

  // IMPORTANT: Always use forward slashes for cross-platform compatibility
  // Git Bash on Windows requires forward slashes in heredoc (backslashes get escaped)
  // PowerShell and CMD also support forward slashes for most commands
  const normalizePath = (path: string) => path.replace(/\\/g, '/')

  let processed = content

  // Order matters: replace longer patterns first to avoid partial matches
  // 1. Replace ~/.claude/.ccg with absolute path (longest match first)
  processed = processed.replace(/~\/\.claude\/\.ccg/g, normalizePath(ccgDir))

  // 2. Replace ~/.claude with absolute path
  processed = processed.replace(/~\/\.claude/g, normalizePath(claudeDir))

  // 3. Replace remaining ~/ patterns with user home
  processed = processed.replace(/~\//g, `${normalizePath(userHome)}/`)

  return processed
}

export async function installWorkflows(
  workflowIds: string[],
  installDir: string,
  force = false,
  config?: {
    routing?: {
      mode?: string
      frontend?: { models?: string[], primary?: string }
      backend?: { models?: string[], primary?: string }
      review?: { models?: string[] }
    }
    liteMode?: boolean
    mcpProvider?: string
  },
): Promise<InstallResult> {
  // Default config
  const installConfig = {
    routing: config?.routing || {
      mode: 'smart',
      frontend: { models: ['codex'], primary: 'codex' },
      backend: { models: ['codex'], primary: 'codex' },
      review: { models: ['codex', 'codex'] },
    },
    liteMode: config?.liteMode || false,
    mcpProvider: config?.mcpProvider || 'fast-context',
  }
  const result: InstallResult = {
    success: true,
    installedCommands: [],
    installedPrompts: [],
    installedSkills: [],
    errors: [],
    configPath: '',
  }

  const commandsDir = join(installDir, 'commands', 'ccg')
  const ccgConfigDir = join(installDir, '.ccg') // v1.4.0: 配置目录
  const promptsDir = join(ccgConfigDir, 'prompts') // v1.4.0: prompts 移到配置目录
  const scriptsDir = join(ccgConfigDir, 'scripts')
  const packsDir = join(ccgConfigDir, 'packs')

  await fs.ensureDir(commandsDir)
  await fs.ensureDir(ccgConfigDir)
  await fs.ensureDir(promptsDir)
  await fs.ensureDir(scriptsDir)
  await fs.ensureDir(packsDir)

  // Get template source directory (relative to this package)
  const templateDir = join(PACKAGE_ROOT, 'templates')

  // Install commands
  for (const workflowId of workflowIds) {
    const workflow = getWorkflowById(workflowId)
    if (!workflow) {
      result.errors.push(`Unknown workflow: ${workflowId}`)
      continue
    }

    for (const cmd of workflow.commands) {
      const srcFile = join(templateDir, 'commands', `${cmd}.md`)
      const destFile = join(commandsDir, `${cmd}.md`)

      try {
        if (await fs.pathExists(srcFile)) {
          if (force || !(await fs.pathExists(destFile))) {
            // Read template content, inject config variables, replace ~ paths, then write
            let templateContent = await fs.readFile(srcFile, 'utf-8')
            templateContent = injectConfigVariables(templateContent, installConfig)
            const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
            await fs.writeFile(destFile, processedContent, 'utf-8')
            result.installedCommands.push(cmd)
          }
        }
        else {
          // If template doesn't exist, create placeholder
          const placeholder = `---
description: "${workflow.descriptionEn}"
---

# /ccg:${cmd}

${workflow.description}

> This command is part of CCG multi-model collaboration system.
`
          await fs.writeFile(destFile, placeholder, 'utf-8')
          result.installedCommands.push(cmd)
        }
      }
      catch (error) {
        result.errors.push(`Failed to install ${cmd}: ${error}`)
        result.success = false
      }
    }
  }

  // Install agents directory (subagents - should go to ~/.claude/agents/ccg/)
  const agentsSrcDir = join(templateDir, 'commands', 'agents')
  const agentsDestDir = join(installDir, 'agents', 'ccg')
  if (await fs.pathExists(agentsSrcDir)) {
    try {
      await fs.ensureDir(agentsDestDir)
      const agentFiles = await fs.readdir(agentsSrcDir)
      for (const file of agentFiles) {
        if (file.endsWith('.md') && !SOURCE_ONLY_AGENT_FILES.has(file)) {
          const srcFile = join(agentsSrcDir, file)
          const destFile = join(agentsDestDir, file)
          if (force || !(await fs.pathExists(destFile))) {
            // Read template content, inject config variables, replace ~ paths, then write
            let templateContent = await fs.readFile(srcFile, 'utf-8')
            templateContent = injectConfigVariables(templateContent, installConfig)
            const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
            await fs.writeFile(destFile, processedContent, 'utf-8')
          }
        }
      }
    }
    catch (error) {
      result.errors.push(`Failed to install agents: ${error}`)
      result.success = false
    }
  }

  // Install shared templates (multi-model-spec, dev-domain-workflow, agent-prompts, etc.)
  const sharedTemplateDir = join(templateDir, 'shared')
  const sharedDestDir = join(ccgConfigDir, 'shared')
  if (await fs.pathExists(sharedTemplateDir)) {
    try {
      // Recursively copy shared directory, processing each .md file
      await fs.ensureDir(sharedDestDir)
      const copySharedDir = async (srcDir: string, destDir: string) => {
        await fs.ensureDir(destDir)
        const entries = await fs.readdir(srcDir, { withFileTypes: true })
        for (const entry of entries) {
          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)
          if (entry.isDirectory()) {
            await copySharedDir(srcPath, destPath)
          }
          else if (entry.name.endsWith('.md')) {
            if (force || !(await fs.pathExists(destPath))) {
              let templateContent = await fs.readFile(srcPath, 'utf-8')
              templateContent = injectConfigVariables(templateContent, installConfig)
              const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
              await fs.writeFile(destPath, processedContent, 'utf-8')
            }
          }
          else {
            // Copy non-md files as-is
            if (force || !(await fs.pathExists(destPath))) {
              await fs.copy(srcPath, destPath)
            }
          }
        }
      }
      await copySharedDir(sharedTemplateDir, sharedDestDir)
    }
    catch (error) {
      result.errors.push(`Failed to install shared templates: ${error}`)
      result.success = false
    }
  }

  // Install prompts (codex, gemini, claude role definitions)
  const promptsTemplateDir = join(templateDir, 'prompts')
  if (await fs.pathExists(promptsTemplateDir)) {
    const modelDirs = ['codex', 'gemini', 'claude']
    for (const model of modelDirs) {
      const srcModelDir = join(promptsTemplateDir, model)
      const destModelDir = join(promptsDir, model)

      if (await fs.pathExists(srcModelDir)) {
        try {
          await fs.ensureDir(destModelDir)
          const files = await fs.readdir(srcModelDir)
          for (const file of files) {
            if (file.endsWith('.md')) {
              const srcFile = join(srcModelDir, file)
              const destFile = join(destModelDir, file)
              if (force || !(await fs.pathExists(destFile))) {
                // Read template content, replace ~ paths, then write
                const templateContent = await fs.readFile(srcFile, 'utf-8')
                const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
                await fs.writeFile(destFile, processedContent, 'utf-8')
                result.installedPrompts.push(`${model}/${file.replace('.md', '')}`)
              }
            }
          }
        }
        catch (error) {
          result.errors.push(`Failed to install ${model} prompts: ${error}`)
          result.success = false
        }
      }
    }
  }

  // Install skills (multi-model-collaboration, etc. - should go to ~/.claude/skills/)
  const skillsTemplateDir = join(templateDir, 'skills')
  const skillsDestDir = join(installDir, 'skills')
  if (await fs.pathExists(skillsTemplateDir)) {
    try {
      const copySkillDir = async (srcDir: string, destDir: string) => {
        await fs.ensureDir(destDir)
        const entries = await fs.readdir(srcDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === '__pycache__' || entry.name.endsWith('.pyc')) {
            continue
          }

          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)
          if (entry.isDirectory()) {
            await copySkillDir(srcPath, destPath)
          }
          else if (force || !(await fs.pathExists(destPath))) {
            if (entry.name.endsWith('.md')) {
              const templateContent = await fs.readFile(srcPath, 'utf-8')
              const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
              await fs.writeFile(destPath, processedContent, 'utf-8')
            }
            else if (entry.name.endsWith('.sh') || entry.name.endsWith('.py')) {
              const scriptContent = (await fs.readFile(srcPath, 'utf-8')).replace(/\r\n/g, '\n')
              await fs.writeFile(destPath, scriptContent, 'utf-8')
            }
            else {
              await fs.copy(srcPath, destPath)
            }
          }
        }
      }

      const skillDirs = await fs.readdir(skillsTemplateDir, { withFileTypes: true })
      for (const skillDir of skillDirs) {
        if (skillDir.isDirectory()) {
          await copySkillDir(join(skillsTemplateDir, skillDir.name), join(skillsDestDir, skillDir.name))
          result.installedSkills.push(skillDir.name)
        }
      }
    }
    catch (error) {
      result.errors.push(`Failed to install skills: ${error}`)
      result.success = false
    }
  }

  // Install runtime scripts for command / skill execution outside plugin cache
  try {
    const scriptsTemplateDir = join(templateDir, 'plugin', 'scripts')
    if (await fs.pathExists(scriptsTemplateDir)) {
      const copyRuntimeScripts = async (srcDir: string, destDir: string) => {
        await fs.ensureDir(destDir)
        const entries = await fs.readdir(srcDir, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.name === '__pycache__') {
            continue
          }

          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)
          if (entry.isDirectory()) {
            await copyRuntimeScripts(srcPath, destPath)
            continue
          }

          if (force || !(await fs.pathExists(destPath))) {
            const scriptContent = (await fs.readFile(srcPath, 'utf-8')).replace(/\r\n/g, '\n')
            await fs.writeFile(destPath, scriptContent, 'utf-8')
          }
        }
      }

      await copyRuntimeScripts(scriptsTemplateDir, scriptsDir)
    }
  }
  catch (error) {
    result.errors.push(`Failed to install runtime scripts: ${error}`)
    result.success = false
  }

  // Install optional command pack assets for /ccg:packs
  try {
    const packManifestTemplate = join(templateDir, 'plugin', 'packs', 'manifest.template.json')
    if (await fs.pathExists(packManifestTemplate)) {
      const manifest = await fs.readJSON(packManifestTemplate) as {
        packs?: Record<string, { description?: string, command_names?: string[] }>
      }
      const outputManifest: {
        packs: Record<string, { description: string, command_names: string[], commands: string[] }>
      } = { packs: {} }

      for (const [packName, packConfig] of Object.entries(manifest.packs || {})) {
        const commandNames = Array.isArray(packConfig.command_names) ? packConfig.command_names : []
        const packCommandsDir = join(packsDir, packName, 'commands')
        await fs.ensureDir(packCommandsDir)

        for (const commandName of commandNames) {
          const srcFile = join(templateDir, 'commands', `${commandName}.md`)
          const destFile = join(packCommandsDir, `${commandName}.md`)
          if (!(await fs.pathExists(srcFile))) {
            result.errors.push(`Failed to install pack ${packName}: missing command template ${commandName}.md`)
            result.success = false
            continue
          }

          if (force || !(await fs.pathExists(destFile))) {
            let templateContent = await fs.readFile(srcFile, 'utf-8')
            templateContent = injectConfigVariables(templateContent, installConfig)
            const processedContent = replaceHomePathsInTemplate(templateContent, installDir)
            await fs.writeFile(destFile, processedContent, 'utf-8')
          }
        }

        outputManifest.packs[packName] = {
          description: packConfig.description || '',
          command_names: commandNames,
          commands: commandNames.map(commandName => `commands/${commandName}.md`),
        }
      }

      await fs.writeJSON(join(packsDir, 'manifest.json'), outputManifest, { spaces: 2 })
    }
  }
  catch (error) {
    result.errors.push(`Failed to install command packs: ${error}`)
    result.success = false
  }

  result.configPath = commandsDir
  return result
}

// Removed: getClaudeCodeConfigPath - now imported from './mcp'

/**
 * Install and configure ace-tool MCP for Claude Code
 * Writes to ~/.claude.json (the correct config file for Claude Code CLI)
 */
export interface UninstallResult {
  success: boolean
  removedCommands: string[]
  removedPrompts: string[]
  removedAgents: string[]
  removedSkills: string[]
  errors: string[]
}

/**
 * Uninstall workflows by removing their command files
 */
export async function uninstallWorkflows(installDir: string): Promise<UninstallResult> {
  const result: UninstallResult = {
    success: true,
    removedCommands: [],
    removedPrompts: [],
    removedAgents: [],
    removedSkills: [],
    errors: [],
  }

  const commandsDir = join(installDir, 'commands', 'ccg')
  const agentsDir = join(installDir, 'agents', 'ccg')
  const skillsDir = join(installDir, 'skills')
  const ccgConfigDir = join(installDir, '.ccg')

  // Remove CCG commands directory
  if (await fs.pathExists(commandsDir)) {
    try {
      // Get list for reporting
      const files = await fs.readdir(commandsDir)
      for (const file of files) {
        if (file.endsWith('.md')) {
          result.removedCommands.push(file.replace('.md', ''))
        }
      }

      // Force remove the entire directory
      await fs.remove(commandsDir)
    }
    catch (error) {
      result.errors.push(`Failed to remove commands directory: ${error}`)
      result.success = false
    }
  }

  // Remove CCG agents directory
  if (await fs.pathExists(agentsDir)) {
    try {
      // Get list for reporting
      const files = await fs.readdir(agentsDir)
      for (const file of files) {
        result.removedAgents.push(file.replace('.md', ''))
      }

      // Force remove the entire directory
      await fs.remove(agentsDir)
    }
    catch (error) {
      result.errors.push(`Failed to remove agents directory: ${error}`)
      result.success = false
    }
  }

  // Remove CCG skills directory
  if (await fs.pathExists(skillsDir)) {
    try {
      const files = await fs.readdir(skillsDir, { withFileTypes: true })
      for (const file of files) {
        if (file.isDirectory()) {
          result.removedSkills.push(file.name)
        }
      }
      await fs.remove(skillsDir)
    }
    catch (error) {
      result.errors.push(`Failed to remove skills: ${error}`)
      result.success = false
    }
  }

  // Remove .ccg config directory (Force remove)
  if (await fs.pathExists(ccgConfigDir)) {
    try {
      await fs.remove(ccgConfigDir)
      result.removedPrompts.push('ALL_PROMPTS_AND_CONFIGS')
    }
    catch (error) {
      result.errors.push(`Failed to remove .ccg directory: ${error}`)
      // Don't mark as failure just for config, but good to know
    }
  }

  return result
}

/**
 * Uninstall ace-tool MCP configuration from ~/.claude.json
 */
export async function uninstallAceTool(): Promise<{ success: boolean, message: string }> {
  try {
    const existingConfig = await readClaudeCodeConfig()

    if (!existingConfig) {
      return {
        success: true,
        message: 'No ~/.claude.json found, nothing to remove',
      }
    }

    // Check if ace-tool exists
    if (!existingConfig.mcpServers || !existingConfig.mcpServers['ace-tool']) {
      return {
        success: true,
        message: 'ace-tool MCP not found in config',
      }
    }

    // Backup before modifying
    await backupClaudeCodeConfig()

    // Remove ace-tool from mcpServers
    delete existingConfig.mcpServers['ace-tool']

    // Write back
    await writeClaudeCodeConfig(existingConfig)

    return {
      success: true,
      message: 'ace-tool MCP removed from ~/.claude.json',
    }
  }
  catch (error) {
    return {
      success: false,
      message: `Failed to uninstall ace-tool: ${error}`,
    }
  }
}

export async function installAceTool(config: AceToolConfig): Promise<{ success: boolean, message: string, configPath?: string }> {
  const { baseUrl, token } = config

  try {
    // Read existing config or create new one
    let existingConfig = await readClaudeCodeConfig()

    if (!existingConfig) {
      existingConfig = { mcpServers: {} }
    }

    // Backup before modifying (if config exists)
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig()
      if (backupPath) {
        console.log(`  ✓ Backup created: ${backupPath}`)
      }
    }

    // Build args array (with -y flag for npx auto-confirm)
    const args = ['-y', 'ace-tool@latest']
    if (baseUrl) {
      args.push('--base-url', baseUrl)
    }
    if (token) {
      args.push('--token', token)
    }

    // Create base ace-tool MCP server config
    const aceToolConfig = buildMcpServerConfig({
      type: 'stdio' as const,
      command: 'npx',
      args,
    })

    // Merge new server into existing config
    let mergedConfig = mergeMcpServers(existingConfig, {
      'ace-tool': aceToolConfig,
    })

    // Apply Windows fixes if needed
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig)
      console.log('  ✓ Applied Windows MCP configuration fixes')
    }

    // Write config back (preserve all other fields)
    await writeClaudeCodeConfig(mergedConfig)

    return {
      success: true,
      message: isWindows()
        ? 'ace-tool MCP configured successfully with Windows compatibility'
        : 'ace-tool MCP configured successfully',
      configPath: join(homedir(), '.claude.json'),
    }
  }
  catch (error) {
    return {
      success: false,
      message: `Failed to configure ace-tool: ${error}`,
    }
  }
}

/**
 * Install and configure ace-tool-rs MCP for Claude Code
 * ace-tool-rs is a Rust implementation of ace-tool, more lightweight and faster
 */
export async function installAceToolRs(config: AceToolConfig): Promise<{ success: boolean, message: string, configPath?: string }> {
  const { baseUrl, token } = config

  try {
    // Read existing config or create new one
    let existingConfig = await readClaudeCodeConfig()

    if (!existingConfig) {
      existingConfig = { mcpServers: {} }
    }

    // Backup before modifying (if config exists)
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig()
      if (backupPath) {
        console.log(`  ✓ Backup created: ${backupPath}`)
      }
    }

    // Build args array for ace-tool-rs
    const args = ['ace-tool-rs']
    if (baseUrl) {
      args.push('--base-url', baseUrl)
    }
    if (token) {
      args.push('--token', token)
    }

    // Create base ace-tool-rs MCP server config
    const aceToolRsConfig = buildMcpServerConfig({
      type: 'stdio' as const,
      command: 'npx',
      args,
      env: {
        RUST_LOG: 'info',
      },
    })

    // Merge new server into existing config
    let mergedConfig = mergeMcpServers(existingConfig, {
      'ace-tool': aceToolRsConfig,
    })

    // Apply Windows fixes if needed
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig)
      console.log('  ✓ Applied Windows MCP configuration fixes')
    }

    // Write config back (preserve all other fields)
    await writeClaudeCodeConfig(mergedConfig)

    return {
      success: true,
      message: isWindows()
        ? 'ace-tool-rs MCP configured successfully with Windows compatibility'
        : 'ace-tool-rs MCP configured successfully',
      configPath: join(homedir(), '.claude.json'),
    }
  }
  catch (error) {
    return {
      success: false,
      message: `Failed to configure ace-tool-rs: ${error}`,
    }
  }
}

/**
 * fast-context MCP configuration
 */
export interface FastContextConfig {
  windsurfApiKey: string
}

/**
 * Install and configure fast-context MCP for Claude Code
 * fast-context is an AI-driven semantic code search using Windsurf's Devstral model
 */
export async function installFastContext(config: FastContextConfig): Promise<{ success: boolean, message: string, configPath?: string }> {
  const { windsurfApiKey } = config

  try {
    // 1. Read existing Claude Code config
    let existingConfig = await readClaudeCodeConfig()
    if (!existingConfig) {
      existingConfig = { mcpServers: {} }
    }

    // Backup before modifying
    if (existingConfig.mcpServers && Object.keys(existingConfig.mcpServers).length > 0) {
      const backupPath = await backupClaudeCodeConfig()
      if (backupPath) {
        console.log(`  ✓ Backup created: ${backupPath}`)
      }
    }

    // 2. Build fast-context MCP server config
    const fastContextMcpConfig = buildMcpServerConfig({
      type: 'stdio' as const,
      command: 'npx',
      args: ['-y', '--prefer-online', '@sammysnake/fast-context-mcp@next'],
      env: { WINDSURF_API_KEY: windsurfApiKey },
    })

    // 3. Merge into existing config
    let mergedConfig = mergeMcpServers(existingConfig, {
      'fast-context': fastContextMcpConfig,
    })

    // Apply Windows fixes if needed
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig)
    }

    // 4. Write config back
    await writeClaudeCodeConfig(mergedConfig)

    return {
      success: true,
      message: 'fast-context MCP configured successfully',
      configPath: join(homedir(), '.claude.json'),
    }
  }
  catch (error) {
    return {
      success: false,
      message: `Failed to configure fast-context: ${error}`,
    }
  }
}

/**
 * Uninstall fast-context MCP from Claude Code
 */
export async function uninstallFastContext(): Promise<{ success: boolean, message: string }> {
  try {
    // 1. Remove from claude.json
    const existingConfig = await readClaudeCodeConfig()
    if (existingConfig?.mcpServers?.['fast-context']) {
      delete existingConfig.mcpServers['fast-context']
      await writeClaudeCodeConfig(existingConfig)
    }

    return {
      success: true,
      message: 'fast-context MCP uninstalled successfully',
    }
  }
  catch (error) {
    return {
      success: false,
      message: `Failed to uninstall fast-context: ${error}`,
    }
  }
}

/**
 * Install a generic MCP server to Claude Code
 */
export async function installMcpServer(
  id: string,
  command: string,
  args: string[],
  env: Record<string, string> = {},
): Promise<{ success: boolean, message: string }> {
  try {
    await backupClaudeCodeConfig()
    const existingConfig = await readClaudeCodeConfig()

    const serverConfig = buildMcpServerConfig({ type: 'stdio', command, args, env })

    let mergedConfig = mergeMcpServers(existingConfig, { [id]: serverConfig })
    if (isWindows()) {
      mergedConfig = fixWindowsMcpConfig(mergedConfig)
    }

    await writeClaudeCodeConfig(mergedConfig)

    return { success: true, message: `${id} MCP installed successfully` }
  }
  catch (error) {
    return { success: false, message: `Failed to install ${id}: ${error}` }
  }
}

/**
 * Uninstall a generic MCP server from Claude Code
 */
export async function uninstallMcpServer(id: string): Promise<{ success: boolean, message: string }> {
  try {
    const existingConfig = await readClaudeCodeConfig()
    if (existingConfig?.mcpServers?.[id]) {
      delete existingConfig.mcpServers[id]
      await writeClaudeCodeConfig(existingConfig)
    }

    return { success: true, message: `${id} MCP uninstalled successfully` }
  }
  catch (error) {
    return { success: false, message: `Failed to uninstall ${id}: ${error}` }
  }
}
