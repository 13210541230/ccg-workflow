import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterAll, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import { getAllCommandIds, getDefaultCommandIds, getOptionalCommandIds, installWorkflows } from '../installer'

const ALL_IDS = getAllCommandIds()
const DEFAULT_IDS = getDefaultCommandIds()
const OPTIONAL_IDS = getOptionalCommandIds()

describe('command set selection', () => {
  it('installs codex in the default core set', () => {
    expect(DEFAULT_IDS).toContain('codex')
    expect(DEFAULT_IDS).toContain('manage')
    expect(DEFAULT_IDS).toContain('packs')
  })

  it('keeps compatibility wrappers out of the default core set', () => {
    expect(DEFAULT_IDS).not.toContain('workflow')
    expect(DEFAULT_IDS).not.toContain('feat')
    expect(DEFAULT_IDS).not.toContain('frontend')
    expect(DEFAULT_IDS).not.toContain('backend')
    expect(DEFAULT_IDS).not.toContain('teammate')
  })

  it('keeps optional extensions out of the default core set', () => {
    expect(DEFAULT_IDS).not.toContain('spec-init')
    expect(DEFAULT_IDS).not.toContain('team-plan')
    expect(DEFAULT_IDS).not.toContain('optimize')
    expect(OPTIONAL_IDS).toContain('spec-init')
    expect(OPTIONAL_IDS).toContain('team-plan')
  })
})

// Collect all .md files recursively
function collectMdFiles(dir: string): string[] {
  const files: string[] = []
  if (!fs.existsSync(dir))
    return files
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory())
      files.push(...collectMdFiles(full))
    else if (entry.name.endsWith('.md'))
      files.push(full)
  }
  return files
}

// ─────────────────────────────────────────────────────────────
// E2E: installWorkflows with mcpProvider='skip'
// ─────────────────────────────────────────────────────────────
describe('installWorkflows E2E — mcpProvider="skip"', () => {
  const tmpDir = join(tmpdir(), `ccg-test-skip-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  it('installs all workflows without errors', async () => {
    const result = await installWorkflows(ALL_IDS, tmpDir, true, {
      mcpProvider: 'skip',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.installedCommands.length).toBeGreaterThan(0)
  })

  it('generated command files contain no MCP tool references', async () => {
    const cmdDir = join(tmpDir, 'commands', 'ccg')
    const files = collectMdFiles(cmdDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const rel = file.replace(tmpDir + '/', '')
      expect(content, `${rel} should not contain mcp__ace-tool`).not.toContain('mcp__ace-tool__search_context')
      expect(content, `${rel} should not contain mcp__fast-context`).not.toContain('mcp__fast-context__fast_context_search')
      expect(content, `${rel} should not contain {{MCP_SEARCH_TOOL}}`).not.toContain('{{MCP_SEARCH_TOOL}}')
      expect(content, `${rel} should not contain {{MCP_SEARCH_PARAM}}`).not.toContain('{{MCP_SEARCH_PARAM}}')
    }
  })

  it('generated agent files contain no MCP tool references', async () => {
    const agentDir = join(tmpDir, 'agents', 'ccg')
    const files = collectMdFiles(agentDir)
    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const content = readFileSync(file, 'utf-8')
      const rel = file.replace(tmpDir + '/', '')
      expect(content, `${rel} should not contain mcp__ace-tool`).not.toContain('mcp__ace-tool__search_context')
      expect(content, `${rel} should not contain mcp__fast-context`).not.toContain('mcp__fast-context__fast_context_search')
      expect(content, `${rel} should not contain {{MCP_SEARCH_TOOL}}`).not.toContain('{{MCP_SEARCH_TOOL}}')
    }
  })

  it('excludes legacy source-only agents from installation', async () => {
    const agentDir = join(tmpDir, 'agents', 'ccg')
    expect(fs.existsSync(join(agentDir, 'planner.md'))).toBe(false)
    expect(fs.existsSync(join(agentDir, 'ui-ux-designer.md'))).toBe(false)
    expect(fs.existsSync(join(agentDir, 'codex-collaborator.md'))).toBe(false)
    expect(fs.existsSync(join(agentDir, 'codex-operator.md'))).toBe(false)
    expect(fs.existsSync(join(agentDir, 'codex-analyzer.md'))).toBe(true)
  })

  it('plan.md contains Glob + Grep fallback guidance', async () => {
    const content = readFileSync(join(tmpDir, 'commands', 'ccg', 'plan.md'), 'utf-8')
    expect(content).toContain('Glob + Grep')
    expect(content).toContain('MCP 未配置')
  })

  it('execute.md contains Glob + Grep fallback guidance', async () => {
    const content = readFileSync(join(tmpDir, 'commands', 'ccg', 'execute.md'), 'utf-8')
    expect(content).toContain('Glob + Grep')
    expect(content).toContain('MCP 未配置')
  })

  it('keeps active codex teammate agents installed', async () => {
    const content = readFileSync(join(tmpDir, 'agents', 'ccg', 'codex-analyzer.md'), 'utf-8')
    expect(content).toContain('mcp__agent-platform-mcp__codex_session_ensure')
    expect(content).toContain('mcp__agent-platform-mcp__codex_session_send')
  })

  it('installs optional command pack assets for packs command', async () => {
    const manifestPath = join(tmpDir, '.ccg', 'packs', 'manifest.json')
    expect(fs.existsSync(manifestPath)).toBe(true)

    const manifest = fs.readJSONSync(manifestPath)
    expect(manifest.packs.legacy.command_names).toContain('workflow')
    expect(manifest.packs.spec.command_names).toContain('spec-plan')
    expect(fs.existsSync(join(tmpDir, '.ccg', 'packs', 'extras', 'commands', 'optimize.md'))).toBe(true)
    expect(fs.existsSync(join(tmpDir, '.ccg', 'packs', 'team', 'commands', 'team-review.md'))).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────
// E2E: installWorkflows with mcpProvider='fast-context' (default)
// ─────────────────────────────────────────────────────────────
describe('installWorkflows E2E — mcpProvider="fast-context" (default)', () => {
  const tmpDir = join(tmpdir(), `ccg-test-fc-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  it('installs all workflows and injects fast-context references', async () => {
    const result = await installWorkflows(ALL_IDS, tmpDir, true, {
      mcpProvider: 'fast-context',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('generated files contain mcp__fast-context__fast_context_search', async () => {
    const planContent = readFileSync(join(tmpDir, 'commands', 'ccg', 'plan.md'), 'utf-8')
    expect(planContent).toContain('mcp__fast-context__fast_context_search')
    expect(planContent).not.toContain('{{MCP_SEARCH_TOOL}}')
  })

  it('keeps active codex teammate agents stable under fast-context install', async () => {
    const analyzerContent = readFileSync(join(tmpDir, 'agents', 'ccg', 'codex-analyzer.md'), 'utf-8')
    expect(analyzerContent).toContain('mcp__agent-platform-mcp__codex_session_ensure')
    expect(analyzerContent).not.toContain('{{MCP_SEARCH_TOOL}}')
  })
})

// ─────────────────────────────────────────────────────────────
// E2E: installWorkflows with mcpProvider='ace-tool' (explicit)
// ─────────────────────────────────────────────────────────────
describe('installWorkflows E2E — mcpProvider="ace-tool" (explicit)', () => {
  const tmpDir = join(tmpdir(), `ccg-test-ace-${Date.now()}`)

  afterAll(async () => {
    await fs.remove(tmpDir)
  })

  it('installs all workflows and injects ace-tool references', async () => {
    const result = await installWorkflows(ALL_IDS, tmpDir, true, {
      mcpProvider: 'ace-tool',
    })
    expect(result.success).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('generated files contain mcp__ace-tool__search_context (correct injection)', async () => {
    const planContent = readFileSync(join(tmpDir, 'commands', 'ccg', 'plan.md'), 'utf-8')
    expect(planContent).toContain('mcp__ace-tool__search_context')
    expect(planContent).not.toContain('{{MCP_SEARCH_TOOL}}')
  })

  it('keeps active codex teammate agents stable under ace-tool install', async () => {
    const analyzerContent = readFileSync(join(tmpDir, 'agents', 'ccg', 'codex-analyzer.md'), 'utf-8')
    expect(analyzerContent).toContain('mcp__agent-platform-mcp__codex_session_ensure')
    expect(analyzerContent).not.toContain('{{MCP_SEARCH_TOOL}}')
  })
})
