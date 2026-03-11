#!/usr/bin/env node
/**
 * build-plugin.mjs - 从 templates/ 自动生成 Claude Code Plugin 资产到 dist/plugin/
 *
 * 用法：
 *   node scripts/build-plugin.mjs [--out-dir <path>] [--verbose]
 *
 * 转换规则：
 *   1. templates/commands/*.md → dist/plugin/commands/<name>.md
 *   2. templates/commands/agents/*.md → dist/plugin/agents/*.md
 *   3. templates/prompts/ → dist/plugin/prompts/ (直接复制)
 *   4. templates/output-styles/ → dist/plugin/output-styles/ (直接复制)
 *   5. templates/shared/ → dist/plugin/shared/ (变量替换 + 路径替换)
 *   6. templates/plugin/plugin.json → dist/plugin/.claude-plugin/plugin.json (注入版本号)
 *   7. templates/plugin/.mcp.json → dist/plugin/.mcp.json
 *   8. templates/plugin/hooks/ → dist/plugin/hooks/
 *   9. templates/plugin/scripts/ → dist/plugin/scripts/ (codex_bridge.py 等)
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// 源目录
const TEMPLATES_DIR = path.join(ROOT, 'templates')
const COMMANDS_DIR = path.join(TEMPLATES_DIR, 'commands')
const AGENTS_DIR = path.join(COMMANDS_DIR, 'agents')
const PROMPTS_DIR = path.join(TEMPLATES_DIR, 'prompts')
const OUTPUT_STYLES_DIR = path.join(TEMPLATES_DIR, 'output-styles')
const PLUGIN_TEMPLATE_DIR = path.join(TEMPLATES_DIR, 'plugin')
const SKILLS_DIR = path.join(TEMPLATES_DIR, 'skills')

// 默认输出
const DEFAULT_OUT_DIR = path.join(ROOT, 'dist', 'plugin')

// 模板变量 → 硬编码默认值
const INSTALL_VAR_RULES = [
  { pattern: /\{\{LITE_MODE_FLAG\}\}/g, replacement: '' },
  { pattern: /\{\{MCP_SEARCH_TOOL\}\}/g, replacement: 'mcp__fast-context__fast_context_search' },
  { pattern: /\{\{MCP_SEARCH_PARAM\}\}/g, replacement: 'query' },
  { pattern: /\{\{MCP_PATH_PARAM\}\}/g, replacement: 'project_path' },
  { pattern: /\{\{FRONTEND_MODELS\}\}/g, replacement: '["codex"]' },
  { pattern: /\{\{FRONTEND_PRIMARY\}\}/g, replacement: 'codex' },
  { pattern: /\{\{BACKEND_MODELS\}\}/g, replacement: '["codex"]' },
  { pattern: /\{\{BACKEND_PRIMARY\}\}/g, replacement: '${CCG_BACKEND:-codex}' },
  { pattern: /\{\{REVIEW_MODELS\}\}/g, replacement: '["codex","codex"]' },
  { pattern: /\{\{ROUTING_MODE\}\}/g, replacement: 'smart' },
]

// 路径替换规则（优先级从高到低，长匹配优先）
const PATH_RULES = [
  // prompts 目录
  { pattern: /~\/\.claude\/\.ccg\/prompts\//g, replacement: '$CLAUDE_PLUGIN_ROOT/prompts/' },
  { pattern: /~\/\.claude\/\.ccg\/prompts\b/g, replacement: '$CLAUDE_PLUGIN_ROOT/prompts' },
  // shared 目录
  { pattern: /~\/\.claude\/\.ccg\/shared\//g, replacement: '$CLAUDE_PLUGIN_ROOT/shared/' },
  { pattern: /~\/\.claude\/\.ccg\/shared\b/g, replacement: '$CLAUDE_PLUGIN_ROOT/shared' },
  // scripts 目录（codex_bridge.py 等）
  { pattern: /~\/\.claude\/\.ccg\/scripts\//g, replacement: '$CLAUDE_PLUGIN_ROOT/scripts/' },
  { pattern: /~\/\.claude\/\.ccg\/scripts\b/g, replacement: '$CLAUDE_PLUGIN_ROOT/scripts' },
  // agents 目录（Claude Code 插件系统从 cache 加载，此路径仅用于文档引用）
  { pattern: /~\/\.claude\/agents\/ccg\//g, replacement: '$CLAUDE_PLUGIN_ROOT/agents/' },
]

// 构建后禁止出现的 token
const FORBIDDEN_TOKENS = [
  '{{LITE_MODE_FLAG}}',
  '{{MCP_SEARCH_TOOL}}',
  '{{MCP_SEARCH_PARAM}}',
  '{{MCP_PATH_PARAM}}',
  '{{FRONTEND_MODELS}}',
  '{{BACKEND_MODELS}}',
  '{{REVIEW_MODELS}}',
  '{{ROUTING_MODE}}',
  '~/.claude/.ccg/prompts',
  '~/.claude/.ccg/shared',
  '~/.claude/.ccg/scripts',
  'codeagent-persist.sh',
  'codeagent-wrapper',
]

// CLI 参数
const args = process.argv.slice(2)
const outDir = resolveOutDir(args)
const verbose = args.includes('--verbose')

function shouldSkipEntry(name) {
  return name === '__pycache__' || name.endsWith('.pyc')
}

async function main() {
  log(`构建输出: ${outDir}`)

  // 1. 清理输出目录
  await fs.rm(outDir, { recursive: true, force: true })

  // 2. 创建目录结构
  for (const dir of ['.claude-plugin', 'commands', 'agents', 'prompts', 'output-styles', 'hooks', 'scripts', 'shared', 'skills']) {
    await fs.mkdir(path.join(outDir, dir), { recursive: true })
  }

  // 3. 转换命令模板为 commands（扁平 .md 文件）
  const cmdCount = await buildCommands(outDir)

  // 4. 转换 agents
  const agentCount = await buildAgents(outDir)

  // 5. 复制 prompts
  await copyDir(PROMPTS_DIR, path.join(outDir, 'prompts'))

  // 6. 复制 output-styles
  await copyDir(OUTPUT_STYLES_DIR, path.join(outDir, 'output-styles'))

  // 7. 写入 plugin 配置
  await writePluginConfigs(outDir)

  // 8. 复制 shared（多模型调用规范、共享工作流、子Agent prompts）
  const sharedDir = path.join(TEMPLATES_DIR, 'shared')
  try {
    await copyDirWithTransform(sharedDir, path.join(outDir, 'shared'))
    log(`  shared: templates/shared/ → shared/`)
  }
  catch {
    log(`  shared: 目录不存在，跳过`)
  }

  // 9. 复制 hooks
  await copyDir(path.join(PLUGIN_TEMPLATE_DIR, 'hooks'), path.join(outDir, 'hooks'))

  // 10. 复制 scripts（codex_bridge.py + manage 钩子等），强制 LF 行尾
  const scriptsDir = path.join(PLUGIN_TEMPLATE_DIR, 'scripts')
  try {
    await copyDirWithLF(scriptsDir, path.join(outDir, 'scripts'))
    log(`  scripts: manage hooks (LF enforced)`)
  }
  catch {
    log(`  scripts: 目录不存在，跳过`)
  }

  // 11. 复制 skills
  try {
    await copyDirWithTransform(SKILLS_DIR, path.join(outDir, 'skills'))
    log(`  skills: templates/skills/ → skills/`)
  }
  catch {
    log(`  skills: 目录不存在，跳过`)
  }

  // 12. 验证输出
  const warnings = await validateOutput(outDir)

  console.log(`[build-plugin] 完成: ${cmdCount} commands, ${agentCount} agents`)
  if (warnings.length > 0) {
    console.error(`[build-plugin] 验证警告:`)
    for (const w of warnings) {
      console.error(`  - ${w}`)
    }
    process.exitCode = 1
  }
}

function resolveOutDir(argv) {
  const idx = argv.indexOf('--out-dir')
  let dir = DEFAULT_OUT_DIR
  if (idx >= 0 && argv[idx + 1]) {
    dir = path.resolve(ROOT, argv[idx + 1])
  }
  // 安全限制：输出目录必须在项目根目录内
  if (!dir.startsWith(ROOT)) {
    throw new Error(`输出目录必须在项目根目录内: ${dir}`)
  }
  return dir
}

/**
 * 将 templates/commands/*.md 转换为 commands/<name>.md（扁平结构）
 */
async function buildCommands(dir) {
  const entries = await fs.readdir(COMMANDS_DIR, { withFileTypes: true })
  const commandFiles = entries
    .filter(e => e.isFile() && e.name.endsWith('.md'))
    .map(e => e.name)
    .sort()

  let count = 0
  for (const file of commandFiles) {
    const commandName = file.replace(/\.md$/, '')
    const sourcePath = path.join(COMMANDS_DIR, file)
    const targetPath = path.join(dir, 'commands', file)

    const source = await fs.readFile(sourcePath, 'utf-8')
    const transformed = applyRules(source)

    await fs.writeFile(targetPath, transformed, 'utf-8')
    count++
    log(`  command: ${commandName}`)
  }
  return count
}

/**
 * 将 templates/commands/agents/*.md 转换到 agents/
 */
async function buildAgents(dir) {
  const entries = await fs.readdir(AGENTS_DIR, { withFileTypes: true })
  let count = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue

    const sourcePath = path.join(AGENTS_DIR, entry.name)
    const targetPath = path.join(dir, 'agents', entry.name)
    const source = await fs.readFile(sourcePath, 'utf-8')
    const transformed = applyRules(source)
    await fs.writeFile(targetPath, transformed, 'utf-8')
    count++
    log(`  agent: ${entry.name}`)
  }
  return count
}

/**
 * 写入 plugin.json（同步版本号）和 .mcp.json
 */
async function writePluginConfigs(dir) {
  // 读取 package.json 版本号
  const pkgJson = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf-8'))

  // 读取 plugin.json 模板并注入版本号
  const pluginJson = JSON.parse(await fs.readFile(path.join(PLUGIN_TEMPLATE_DIR, 'plugin.json'), 'utf-8'))
  pluginJson.version = pkgJson.version
  await fs.writeFile(
    path.join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify(pluginJson, null, 2) + '\n',
    'utf-8',
  )

  // 读取 marketplace.json 模板并注入版本号
  const marketplaceJson = JSON.parse(await fs.readFile(path.join(PLUGIN_TEMPLATE_DIR, 'marketplace.json'), 'utf-8'))
  marketplaceJson.plugins[0].version = pkgJson.version
  await fs.writeFile(
    path.join(dir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify(marketplaceJson, null, 2) + '\n',
    'utf-8',
  )

  // 复制 .mcp.json
  await fs.copyFile(
    path.join(PLUGIN_TEMPLATE_DIR, '.mcp.json'),
    path.join(dir, '.mcp.json'),
  )
  log(`  config: plugin.json (v${pkgJson.version}) + marketplace.json + .mcp.json`)
}

/**
 * 验证输出：扫描所有 .md 文件中是否有禁止 token
 */
async function validateOutput(dir) {
  const warnings = []
  const files = await listFiles(dir)
  // 只验证模板文件（.md/.json），脚本文件（.sh/.py）合法包含这些模式作为替换规则
  const mdFiles = files.filter(f => f.endsWith('.md') || f.endsWith('.json'))

  for (const file of mdFiles) {
    const content = await fs.readFile(file, 'utf-8')
    for (const token of FORBIDDEN_TOKENS) {
      if (content.includes(token)) {
        warnings.push(`禁止 token "${token}" 残留于 ${rel(file)}`)
      }
    }
  }
  return warnings
}

// --- 辅助函数 ---

function applyRules(content) {
  let result = content
  for (const rule of INSTALL_VAR_RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }
  for (const rule of PATH_RULES) {
    result = result.replace(rule.pattern, rule.replacement)
  }
  return result
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, dstPath)
    }
    else {
      await fs.copyFile(srcPath, dstPath)
    }
  }
}

/**
 * 递归复制目录，对 shell 脚本强制 CRLF→LF 转换
 * （Windows 上 git checkout 可能将 .sh 文件转为 CRLF，导致 bash 无法执行）
 */
async function copyDirWithLF(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirWithLF(srcPath, dstPath)
    }
    else if (entry.name.endsWith('.sh') || entry.name.endsWith('.py') || entry.name === 'run-wrapper') {
      const content = (await fs.readFile(srcPath, 'utf-8')).replace(/\r\n/g, '\n')
      await fs.writeFile(dstPath, content, 'utf-8')
      await fs.chmod(dstPath, 0o755).catch(() => {})
    }
    else {
      await fs.copyFile(srcPath, dstPath)
    }
  }
}

/**
 * 递归复制目录，对 .md 文件应用变量替换和路径替换
 */
async function copyDirWithTransform(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkipEntry(entry.name)) continue
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      await copyDirWithTransform(srcPath, dstPath)
    }
    else if (entry.name.endsWith('.md')) {
      const content = await fs.readFile(srcPath, 'utf-8')
      await fs.writeFile(dstPath, applyRules(content), 'utf-8')
    }
    else {
      await fs.copyFile(srcPath, dstPath)
    }
  }
}

async function listFiles(dir) {
  const result = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await listFiles(full))
    }
    else {
      result.push(full)
    }
  }
  return result
}

function rel(filePath) {
  return path.relative(ROOT, filePath).split(path.sep).join('/')
}

function log(msg) {
  if (verbose) console.log(`[build-plugin] ${msg}`)
}

main().catch((err) => {
  console.error(`[build-plugin] 失败:`, err.message || err)
  process.exitCode = 1
})
