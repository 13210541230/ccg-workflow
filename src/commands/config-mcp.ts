import ansis from 'ansis'
import inquirer from 'inquirer'
import { i18n } from '../i18n'
import { installAceTool, installAceToolRs, installFastContext, installMcpServer, uninstallAceTool, uninstallFastContext, uninstallMcpServer } from '../utils/installer'

/**
 * Configure MCP tools after installation
 */
export async function configMcp(): Promise<void> {
  console.log()
  console.log(ansis.cyan.bold(`  配置 MCP 工具`))
  console.log()

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: '选择操作',
    choices: [
      { name: `${ansis.green('➜')} 代码检索 MCP ${ansis.gray('(fast-context / ace-tool)')}`, value: 'code-retrieval' },
      { name: `${ansis.blue('➜')} 辅助工具 MCP ${ansis.gray('(context7 / Playwright / exa...)')}`, value: 'auxiliary' },
      { name: `${ansis.red('✕')} 卸载 MCP`, value: 'uninstall' },
      new inquirer.Separator(),
      { name: `${ansis.gray('返回')}`, value: 'cancel' },
    ],
  }])

  if (action === 'cancel')
    return

  if (action === 'code-retrieval') {
    await handleCodeRetrieval()
  }
  else if (action === 'auxiliary') {
    await handleAuxiliary()
  }
  else if (action === 'uninstall') {
    await handleUninstall()
  }
}

async function handleCodeRetrieval(): Promise<void> {
  console.log()

  const { tool } = await inquirer.prompt([{
    type: 'list',
    name: 'tool',
    message: '选择代码检索工具',
    choices: [
      { name: `fast-context ${ansis.green('(推荐)')} ${ansis.gray('- AI 语义代码搜索')}`, value: 'fast-context' },
      { name: `ace-tool ${ansis.red('(收费)')} ${ansis.gray('- Node.js')}`, value: 'ace-tool' },
      { name: `ace-tool-rs ${ansis.red('(收费)')} ${ansis.gray('- Rust')}`, value: 'ace-tool-rs' },
      new inquirer.Separator(),
      { name: `${ansis.gray('返回')}`, value: 'cancel' },
    ],
  }])

  if (tool === 'cancel')
    return

  if (tool === 'fast-context') {
    await handleInstallFastContext()
  }
  else {
    await handleInstallAceTool(tool === 'ace-tool-rs')
  }
}

async function handleInstallAceTool(isRs: boolean): Promise<void> {
  const toolName = isRs ? 'ace-tool-rs' : 'ace-tool'

  console.log()
  console.log(ansis.cyan(`📖 获取 ${toolName} 访问方式：`))
  console.log(`   ${ansis.gray('•')} ${ansis.cyan('官方服务')}: ${ansis.underline('https://augmentcode.com/')}`)
  console.log(`   ${ansis.gray('•')} ${ansis.cyan('中转服务')} ${ansis.yellow('(无需注册)')}: ${ansis.underline('https://linux.do/t/topic/1291730')}`)
  console.log()

  const answers = await inquirer.prompt([
    { type: 'input', name: 'baseUrl', message: `Base URL ${ansis.gray('(中转服务必填，官方留空)')}` },
    { type: 'password', name: 'token', message: `Token ${ansis.gray('(必填)')}`, validate: (v: string) => v.trim() !== '' || '请输入 Token' },
  ])

  console.log()
  console.log(ansis.yellow(`⏳ 正在配置 ${toolName} MCP...`))

  const result = await (isRs ? installAceToolRs : installAceTool)({
    baseUrl: answers.baseUrl?.trim() || undefined,
    token: answers.token.trim(),
  })

  console.log()
  if (result.success) {
    console.log(ansis.green(`✓ ${toolName} MCP 配置成功！`))
    console.log(ansis.gray(`  重启 Claude Code CLI 使配置生效`))
  }
  else {
    console.log(ansis.red(`✗ ${toolName} MCP 配置失败: ${result.message}`))
  }
}

async function handleInstallFastContext(): Promise<void> {
  console.log()
  console.log(ansis.cyan(`📖 获取 Windsurf API Key：`))
  console.log(`   ${ansis.gray('1.')} 安装 Windsurf IDE（${ansis.underline('https://windsurf.com/')}）`)
  console.log(`   ${ansis.gray('2.')} 或手动输入已有的 Windsurf API Key`)
  console.log()

  const { method } = await inquirer.prompt([{
    type: 'list',
    name: 'method',
    message: '选择 API Key 获取方式',
    choices: [
      { name: `自动提取 ${ansis.green('(推荐)')} ${ansis.gray('- 从本地 Windsurf 安装提取')}`, value: 'auto' },
      { name: `手动输入 ${ansis.gray('- 直接输入 API Key')}`, value: 'manual' },
    ],
  }])

  let apiKey = ''
  if (method === 'manual') {
    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: `Windsurf API Key ${ansis.gray('(sk-ws-xxx)')}`,
      mask: '*',
      validate: (v: string) => v.trim() !== '' || '请输入 API Key',
    }])
    apiKey = key.trim()
  }
  else {
    console.log()
    console.log(ansis.yellow('⏳ 正在从 Windsurf 提取 API Key...'))
    console.log(ansis.gray('  请确保 Windsurf IDE 已安装并登录'))
    // 用户需要自行通过 extract_windsurf_key 工具或手动获取
    const { key } = await inquirer.prompt([{
      type: 'password',
      name: 'key',
      message: `自动提取失败？请手动输入 Windsurf API Key`,
      mask: '*',
      validate: (v: string) => v.trim() !== '' || '请输入 API Key',
    }])
    apiKey = key.trim()
  }

  console.log()
  console.log(ansis.yellow('⏳ 正在配置 fast-context MCP...'))

  const result = await installFastContext({ windsurfApiKey: apiKey })

  console.log()
  if (result.success) {
    console.log(ansis.green('✓ fast-context MCP 配置成功！'))
    console.log(ansis.gray('  重启 Claude Code CLI 使配置生效'))
  }
  else {
    console.log(ansis.red(`✗ fast-context MCP 配置失败: ${result.message}`))
  }
}

// 辅助工具 MCP 配置
const AUXILIARY_MCPS = [
  { id: 'context7', name: 'Context7', desc: '获取最新库文档', command: 'npx', args: ['-y', '@upstash/context7-mcp@latest'] },
  { id: 'Playwright', name: 'Playwright', desc: '浏览器自动化/测试', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
  { id: 'mcp-deepwiki', name: 'DeepWiki', desc: '知识库查询', command: 'npx', args: ['-y', 'mcp-deepwiki@latest'] },
  { id: 'exa', name: 'Exa', desc: '搜索引擎（需 API Key）', command: 'npx', args: ['-y', 'exa-mcp-server@latest'], requiresApiKey: true, apiKeyEnv: 'EXA_API_KEY' },
]

async function handleAuxiliary(): Promise<void> {
  console.log()

  const { selected } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'selected',
    message: '选择要安装的辅助工具（空格选择，回车确认）',
    choices: AUXILIARY_MCPS.map(m => ({
      name: `${m.name} ${ansis.gray(`- ${m.desc}`)}`,
      value: m.id,
    })),
  }])

  if (!selected || selected.length === 0) {
    console.log(ansis.gray('未选择任何工具'))
    return
  }

  console.log()

  for (const id of selected) {
    const mcp = AUXILIARY_MCPS.find(m => m.id === id)!
    let env: Record<string, string> = {}

    if (mcp.requiresApiKey) {
      console.log(ansis.cyan(`📖 获取 ${mcp.name} API Key：`))
      console.log(`   访问 ${ansis.underline('https://exa.ai/')} 注册获取（有免费额度）`)
      console.log()

      const { apiKey } = await inquirer.prompt([{
        type: 'password',
        name: 'apiKey',
        message: `${mcp.name} API Key`,
        mask: '*',
        validate: (v: string) => v.trim() !== '' || '请输入 API Key',
      }])
      env[mcp.apiKeyEnv!] = apiKey.trim()
    }

    console.log(ansis.yellow(`⏳ 正在安装 ${mcp.name}...`))
    const result = await installMcpServer(mcp.id, mcp.command, mcp.args, env)

    if (result.success) {
      console.log(ansis.green(`✓ ${mcp.name} 安装成功`))
    }
    else {
      console.log(ansis.red(`✗ ${mcp.name} 安装失败: ${result.message}`))
    }
  }

  console.log()
  console.log(ansis.gray('重启 Claude Code CLI 使配置生效'))
}

async function handleUninstall(): Promise<void> {
  console.log()

  const allMcps = [
    { name: 'ace-tool', value: 'ace-tool' },
    { name: 'fast-context', value: 'fast-context' },
    ...AUXILIARY_MCPS.map(m => ({ name: m.name, value: m.id })),
  ]

  const { targets } = await inquirer.prompt([{
    type: 'checkbox',
    name: 'targets',
    message: '选择要卸载的 MCP（空格选择，回车确认）',
    choices: allMcps,
  }])

  if (!targets || targets.length === 0) {
    console.log(ansis.gray('未选择任何工具'))
    return
  }

  console.log()

  for (const target of targets) {
    console.log(ansis.yellow(`⏳ 正在卸载 ${target}...`))

    let result
    if (target === 'ace-tool') {
      result = await uninstallAceTool()
    }
    else if (target === 'fast-context') {
      result = await uninstallFastContext()
    }
    else {
      result = await uninstallMcpServer(target)
    }

    if (result.success) {
      console.log(ansis.green(`✓ ${target} 已卸载`))
    }
    else {
      console.log(ansis.red(`✗ ${target} 卸载失败: ${result.message}`))
    }
  }

  console.log()
}
