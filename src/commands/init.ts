import type { CollaborationMode, InitOptions, ModelRouting, ModelType, SupportedLang } from '../types'
import ansis from 'ansis'
import fs from 'fs-extra'
import inquirer from 'inquirer'
import ora from 'ora'
import { homedir } from 'node:os'
import { join } from 'pathe'
import { i18n } from '../i18n'
import { createDefaultConfig, ensureCcgDir, getCcgDir, readCcgConfig, writeCcgConfig } from '../utils/config'
import { getDefaultCommandIds, getOptionalCommandIds, installAceTool, installAceToolRs, installFastContext, installWorkflows } from '../utils/installer'
import { migrateToV1_4_0, needsMigration } from '../utils/migration'

export async function init(options: InitOptions = {}): Promise<void> {
  console.log()
  console.log(ansis.cyan.bold(`  CCG - Claude + Codex + Gemini`))
  console.log(ansis.gray(`  多模型协作开发工作流`))
  console.log()

  // Fixed configuration
  const language: SupportedLang = 'zh-CN'
  const frontendModels: ModelType[] = ['gemini']
  const backendModels: ModelType[] = ['codex']
  const mode: CollaborationMode = 'smart'
  const selectedWorkflows = getDefaultCommandIds()
  const optionalWorkflows = getOptionalCommandIds()

  // Performance mode selection
  let liteMode = false

  // MCP Tool Selection
  let mcpProvider = 'fast-context'
  let aceToolBaseUrl = ''
  let aceToolToken = ''
  let fastContextApiKey = ''

  // Skip MCP configuration if --skip-mcp is passed (used during update)
  if (options.skipMcp) {
    mcpProvider = 'skip'
  }
  else if (!options.skipPrompt) {
    console.log()
    console.log(ansis.cyan.bold(`  🔧 MCP 代码检索工具配置`))
    console.log()

    const { selectedMcp } = await inquirer.prompt([{
      type: 'list',
      name: 'selectedMcp',
      message: '选择代码检索 MCP 工具',
      choices: [
        {
          name: `fast-context ${ansis.green('(推荐)')} ${ansis.gray('- AI 语义代码搜索 (Windsurf Devstral)')}`,
          value: 'fast-context',
        },
        {
          name: `ace-tool ${ansis.red('(收费)')} ${ansis.gray('(Node.js) - Augment 官方')}`,
          value: 'ace-tool',
        },
        {
          name: `ace-tool-rs ${ansis.red('(收费)')} ${ansis.gray('(Rust) - 更轻量')}`,
          value: 'ace-tool-rs',
        },
        {
          name: `跳过 ${ansis.gray('- 稍后手动配置')}`,
          value: 'skip',
        },
      ],
      default: 'fast-context',
    }])

    mcpProvider = selectedMcp

    // Configure ace-tool or ace-tool-rs if selected
    if (selectedMcp === 'ace-tool' || selectedMcp === 'ace-tool-rs') {
      const toolName = selectedMcp === 'ace-tool-rs' ? 'ace-tool-rs' : 'ace-tool'
      const toolDesc = selectedMcp === 'ace-tool-rs' ? i18n.t('init:aceToolRs.description') : i18n.t('init:aceTool.description')

      console.log()
      console.log(ansis.cyan.bold(`  🔧 ${toolName} MCP 配置`))
      console.log(ansis.gray(`     ${toolDesc}`))
      console.log()

      const { skipToken } = await inquirer.prompt([{
        type: 'confirm',
        name: 'skipToken',
        message: '是否跳过 Token 配置？（可稍后运行 npx ccg config mcp 配置）',
        default: false,
      }])

      if (!skipToken) {
        console.log()
        console.log(ansis.cyan(`     📖 获取 ace-tool 访问方式：`))
        console.log()
        console.log(`     ${ansis.gray('•')} ${ansis.cyan('官方服务')}: ${ansis.underline('https://augmentcode.com/')}`)
        console.log(`       ${ansis.gray('注册账号后获取 Token')}`)
        console.log()
        console.log(`     ${ansis.gray('•')} ${ansis.cyan('中转服务')} ${ansis.yellow('(无需注册)')}: ${ansis.underline('https://linux.do/t/topic/1291730')}`)
        console.log(`       ${ansis.gray('linux.do 社区提供的免费中转服务')}`)
        console.log()

        const aceAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: `Base URL ${ansis.gray('(使用中转服务时必填，官方服务留空)')}`,
            default: '',
          },
          {
            type: 'password',
            name: 'token',
            message: `Token ${ansis.gray('(必填)')}`,
            mask: '*',
            validate: (input: string) => input.trim() !== '' || '请输入 Token',
          },
        ])
        aceToolBaseUrl = aceAnswers.baseUrl || ''
        aceToolToken = aceAnswers.token || ''
      }
      else {
        console.log()
        console.log(ansis.yellow(`  ℹ️  已跳过 Token 配置`))
        console.log(ansis.gray(`     • ace-tool MCP 将不会自动安装`))
        console.log(ansis.gray(`     • 可稍后运行 ${ansis.cyan('npx ccg config mcp')} 配置 Token`))
        console.log(ansis.gray(`     • 获取 Token: ${ansis.cyan('https://augmentcode.com/')}`))
        console.log()
      }
    }
    // Configure fast-context if selected
    else if (selectedMcp === 'fast-context') {
      console.log()
      console.log(ansis.cyan.bold(`  🔧 fast-context MCP 配置`))
      console.log(ansis.gray(`     AI 语义代码搜索，基于 Windsurf Devstral 模型`))
      console.log()

      const { skipKey } = await inquirer.prompt([{
        type: 'confirm',
        name: 'skipKey',
        message: '是否跳过 API Key 配置？（可稍后运行 npx ccg config mcp 配置）',
        default: false,
      }])

      if (!skipKey) {
        console.log()
        console.log(ansis.cyan(`     📖 获取 Windsurf API Key：`))
        console.log()
        console.log(`     ${ansis.gray('1.')} 安装 Windsurf IDE（${ansis.underline('https://windsurf.com/')}）`)
        console.log(`     ${ansis.gray('2.')} 或手动输入已有的 Windsurf API Key`)
        console.log()

        const fcAnswers = await inquirer.prompt([{
          type: 'password',
          name: 'apiKey',
          message: `Windsurf API Key ${ansis.gray('(sk-ws-xxx)')}`,
          mask: '*',
          validate: (input: string) => input.trim() !== '' || '请输入 API Key',
        }])
        fastContextApiKey = fcAnswers.apiKey || ''
      }
      else {
        console.log()
        console.log(ansis.yellow(`  ℹ️  已跳过 API Key 配置`))
        console.log(ansis.gray(`     • fast-context MCP 将不会自动安装`))
        console.log(ansis.gray(`     • 可稍后运行 ${ansis.cyan('npx ccg config mcp')} 配置`))
        console.log(ansis.gray(`     • 获取 Key: ${ansis.cyan('https://windsurf.com/')}`))
        console.log()
      }
    }
    else {
      console.log()
      console.log(ansis.yellow(`  ℹ️  已跳过 MCP 配置`))
      console.log(ansis.gray(`     • 可稍后手动配置任何 MCP 服务`))
      console.log()
    }
  }

  // Claude Code API configuration
  let apiUrl = ''
  let apiKey = ''

  if (!options.skipPrompt) {
    console.log()
    console.log(ansis.cyan.bold(`  🔑 Claude Code API 配置`))
    console.log()

    const { configureApi } = await inquirer.prompt([{
      type: 'confirm',
      name: 'configureApi',
      message: '是否配置自定义 API？（使用官方账号可跳过）',
      default: false,
    }])

    if (configureApi) {
      const apiAnswers = await inquirer.prompt([
        {
          type: 'input',
          name: 'url',
          message: `API URL ${ansis.gray('(必填)')}`,
          validate: (v: string) => v.trim() !== '' || '请输入 API URL',
        },
        {
          type: 'password',
          name: 'key',
          message: `API Key ${ansis.gray('(必填)')}`,
          mask: '*',
          validate: (v: string) => v.trim() !== '' || '请输入 API Key',
        },
      ])
      apiUrl = apiAnswers.url?.trim() || ''
      apiKey = apiAnswers.key?.trim() || ''
    }
  }

  // Performance mode selection (always ask unless skipPrompt is true)
  if (!options.skipPrompt) {
    // Read existing config to show current setting
    const existingConfig = await readCcgConfig()
    const currentLiteMode = existingConfig?.performance?.liteMode || false

    console.log()
    const { enableWebUI } = await inquirer.prompt([{
      type: 'confirm',
      name: 'enableWebUI',
      message: `启用 Web UI 实时输出？${ansis.gray('(禁用可加速响应)')}`,
      default: !currentLiteMode, // Default to current setting (inverted)
    }])

    liteMode = !enableWebUI
  }
  else {
    // In non-interactive mode (update), preserve existing liteMode setting
    const existingConfig = await readCcgConfig()
    if (existingConfig?.performance?.liteMode !== undefined) {
      liteMode = existingConfig.performance.liteMode
    }
  }

  // Build routing config (fixed: Gemini frontend, Codex backend)
  const routing: ModelRouting = {
    frontend: {
      models: frontendModels,
      primary: 'gemini',
      strategy: 'fallback',
    },
    backend: {
      models: backendModels,
      primary: 'codex',
      strategy: 'fallback',
    },
    review: {
      models: ['codex', 'gemini'],
      strategy: 'parallel',
    },
    mode,
  }

  // Show summary
  console.log()
  console.log(ansis.yellow('━'.repeat(50)))
  console.log(ansis.bold(`  ${i18n.t('init:summary.title')}`))
  console.log()
  console.log(`  ${ansis.cyan('模型路由')}  ${ansis.green('Gemini')} (前端) + ${ansis.blue('Codex')} (后端)`)
  console.log(`  ${ansis.cyan('默认命令')}  ${ansis.yellow(selectedWorkflows.length.toString())} 个`)
  console.log(`  ${ansis.cyan('扩展命令')}  ${ansis.gray(optionalWorkflows.length.toString())} 个 ${ansis.gray('(源码保留，默认不安装)')}`)
  console.log(`  ${ansis.cyan('MCP 工具')}  ${mcpProvider === 'fast-context' ? ansis.green('fast-context') : (mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') ? (aceToolToken ? ansis.green(mcpProvider) : ansis.yellow(`${mcpProvider} (待配置)`)) : ansis.gray('跳过')}`)
  console.log(`  ${ansis.cyan('Web UI')}    ${liteMode ? ansis.gray('禁用') : ansis.green('启用')}`)
  console.log(ansis.yellow('━'.repeat(50)))
  console.log()

  // Confirm in interactive mode (skip if force is true)
  if (!options.skipPrompt && !options.force) {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirmed',
      message: i18n.t('init:confirmInstall'),
      default: true,
    }])

    if (!confirmed) {
      console.log(ansis.yellow(i18n.t('init:installCancelled')))
      return
    }
  }

  // Install
  const spinner = ora(i18n.t('init:installing')).start()

  try {
    // v1.4.0: Auto-migrate from old directory structure
    if (await needsMigration()) {
      spinner.text = 'Migrating from v1.3.x to v1.4.0...'
      const migrationResult = await migrateToV1_4_0()

      if (migrationResult.migratedFiles.length > 0) {
        spinner.info(ansis.cyan('Migration completed:'))
        console.log()
        for (const file of migrationResult.migratedFiles) {
          console.log(`  ${ansis.green('✓')} ${file}`)
        }
        if (migrationResult.skipped.length > 0) {
          console.log()
          console.log(ansis.gray('  Skipped:'))
          for (const file of migrationResult.skipped) {
            console.log(`  ${ansis.gray('○')} ${file}`)
          }
        }
        console.log()
        spinner.start(i18n.t('init:installing'))
      }

      if (migrationResult.errors.length > 0) {
        spinner.warn(ansis.yellow('Migration completed with errors:'))
        for (const error of migrationResult.errors) {
          console.log(`  ${ansis.red('✗')} ${error}`)
        }
        console.log()
        spinner.start(i18n.t('init:installing'))
      }
    }

    await ensureCcgDir()

    // Create config
    const config = createDefaultConfig({
      language,
      routing,
      installedWorkflows: selectedWorkflows,
      mcpProvider,
      liteMode,
    })

    // Save config FIRST - ensure it's created even if installation fails
    await writeCcgConfig(config)

    // Install workflows and commands
    const installDir = options.installDir || join(homedir(), '.claude')
    const result = await installWorkflows(selectedWorkflows, installDir, options.force, {
      routing,
      liteMode,
      mcpProvider,
    })

    // Install ace-tool or ace-tool-rs MCP if token was provided
    if ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && aceToolToken) {
      const toolName = mcpProvider === 'ace-tool-rs' ? 'ace-tool-rs' : 'ace-tool'
      const installFn = mcpProvider === 'ace-tool-rs' ? installAceToolRs : installAceTool

      spinner.text = mcpProvider === 'ace-tool-rs' ? i18n.t('init:aceToolRs.installing') : i18n.t('init:aceTool.installing')
      const aceResult = await installFn({
        baseUrl: aceToolBaseUrl,
        token: aceToolToken,
      })
      if (aceResult.success) {
        spinner.succeed(ansis.green(i18n.t('init:installSuccess')))
        console.log()
        console.log(`    ${ansis.green('✓')} ${toolName} MCP ${ansis.gray(`→ ${aceResult.configPath}`)}`)
      }
      else {
        spinner.warn(ansis.yellow(mcpProvider === 'ace-tool-rs' ? i18n.t('init:aceToolRs.failed') : i18n.t('init:aceTool.failed')))
        console.log(ansis.gray(`      ${aceResult.message}`))
      }
    }
    // Install fast-context MCP if API key was provided
    else if (mcpProvider === 'fast-context' && fastContextApiKey) {
      spinner.text = '正在配置 fast-context MCP...'
      const fcResult = await installFastContext({
        windsurfApiKey: fastContextApiKey,
      })
      if (fcResult.success) {
        spinner.succeed(ansis.green(i18n.t('init:installSuccess')))
        console.log()
        console.log(`    ${ansis.green('✓')} fast-context MCP ${ansis.gray(`→ ${fcResult.configPath}`)}`)
      }
      else {
        spinner.warn(ansis.yellow('fast-context MCP 配置失败'))
        console.log(ansis.gray(`      ${fcResult.message}`))
      }
    }
    else if (mcpProvider === 'fast-context' && !fastContextApiKey) {
      spinner.succeed(ansis.green(i18n.t('init:installSuccess')))
      console.log()
      console.log(`    ${ansis.yellow('⚠')} fast-context MCP 未安装 ${ansis.gray('(API Key 未提供)')}`)
      console.log(`    ${ansis.gray('→')} 稍后运行 ${ansis.cyan('npx ccg config mcp')} 完成配置`)
    }
    else if ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && !aceToolToken) {
      const toolName = mcpProvider === 'ace-tool-rs' ? 'ace-tool-rs' : 'ace-tool'
      spinner.succeed(ansis.green(i18n.t('init:installSuccess')))
      console.log()
      console.log(`    ${ansis.yellow('⚠')} ${toolName} MCP 未安装 ${ansis.gray('(Token 未提供)')}`)
      console.log(`    ${ansis.gray('→')} 稍后运行 ${ansis.cyan('npx ccg config mcp')} 完成配置`)
    }
    else {
      spinner.succeed(ansis.green(i18n.t('init:installSuccess')))
    }

    // Save API configuration if provided
    if (apiUrl && apiKey) {
      const settingsPath = join(installDir, 'settings.json')
      let settings: Record<string, any> = {}
      if (await fs.pathExists(settingsPath)) {
        settings = await fs.readJSON(settingsPath)
      }
      if (!settings.env)
        settings.env = {}
      settings.env.ANTHROPIC_BASE_URL = apiUrl
      settings.env.ANTHROPIC_API_KEY = apiKey
      delete settings.env.ANTHROPIC_AUTH_TOKEN // 避免冲突
      // 默认优化配置
      settings.env.DISABLE_TELEMETRY = '1'
      settings.env.DISABLE_ERROR_REPORTING = '1'
      settings.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
      settings.env.CLAUDE_CODE_ATTRIBUTION_HEADER = '0'
      settings.env.MCP_TIMEOUT = '60000'
      // CCG 运行链路权限白名单
      if (!settings.permissions)
        settings.permissions = {}
      if (!settings.permissions.allow)
        settings.permissions.allow = []
      const workflowPerms = [
        'Bash(bash */scripts/assemble-prompt.sh*)',
        'Bash(python */scripts/codex_bridge.py*)',
        'Bash(python */skills/codex-runtime/scripts/ccg-codex-run.py*)',
      ]
      for (const perm of workflowPerms) {
        if (!settings.permissions.allow.includes(perm))
          settings.permissions.allow.push(perm)
      }
      await fs.writeJSON(settingsPath, settings, { spaces: 2 })
      console.log()
      console.log(`    ${ansis.green('✓')} API 配置 ${ansis.gray(`→ ${settingsPath}`)}`)
    }

    // Show result summary
    console.log()
    console.log(ansis.cyan(`  ${i18n.t('init:installedCommands')}`))
    result.installedCommands.forEach((cmd) => {
      console.log(`    ${ansis.green('✓')} /ccg:${cmd}`)
    })

    // Show installed prompts
    if (result.installedPrompts.length > 0) {
      console.log()
      console.log(ansis.cyan(`  ${i18n.t('init:installedPrompts')}`))
      // Group by model
      const grouped: Record<string, string[]> = {}
      result.installedPrompts.forEach((p) => {
        const [model, role] = p.split('/')
        if (!grouped[model])
          grouped[model] = []
        grouped[model].push(role)
      })
      Object.entries(grouped).forEach(([model, roles]) => {
        console.log(`    ${ansis.green('✓')} ${model}: ${roles.join(', ')}`)
      })
    }

    if (result.installedSkills.length > 0) {
      console.log()
      console.log(ansis.cyan('  已安装 Skills:'))
      result.installedSkills.forEach((skill) => {
        console.log(`    ${ansis.green('✓')} ${skill}`)
      })
    }

    // Show errors if any
    if (result.errors.length > 0) {
      console.log()
      console.log(ansis.red(`  ⚠ ${i18n.t('init:installationErrors')}`))
      result.errors.forEach((error) => {
        console.log(`    ${ansis.red('✗')} ${error}`)
      })
    }

    // Show MCP resources if user skipped installation
    if (mcpProvider === 'skip' || ((mcpProvider === 'ace-tool' || mcpProvider === 'ace-tool-rs') && !aceToolToken) || (mcpProvider === 'fast-context' && !fastContextApiKey)) {
      console.log()
      console.log(ansis.cyan.bold(`  📖 MCP 服务选项`))
      console.log()
      console.log(ansis.gray(`     如需使用代码检索功能，可选择以下 MCP 服务：`))
      console.log()
      console.log(`     ${ansis.green('1.')} ${ansis.cyan('ace-tool / ace-tool-rs')}: ${ansis.underline('https://augmentcode.com/')}`)
      console.log(`        ${ansis.gray('Augment 官方，含 Prompt 增强 + 代码检索')}`)
      console.log()
      console.log(`     ${ansis.green('2.')} ${ansis.cyan('ace-tool 中转服务')} ${ansis.yellow('(无需注册)')}: ${ansis.underline('https://linux.do/t/topic/1291730')}`)
      console.log(`        ${ansis.gray('linux.do 社区提供的免费中转服务')}`)
      console.log()
      console.log(`     ${ansis.green('3.')} ${ansis.cyan('fast-context')}: ${ansis.underline('https://windsurf.com/')}`)
      console.log(`        ${ansis.gray('AI 语义代码搜索，需要 Windsurf API Key')}`)
      console.log()
    }

    console.log()
  }
  catch (error) {
    spinner.fail(ansis.red(i18n.t('init:installFailed')))
    console.error(error)
  }
}
