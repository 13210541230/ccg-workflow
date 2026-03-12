#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'

const SERVER_NAME = 'ccg-codex-mcp'
const SERVER_VERSION = '0.2.0'
const __dirname = dirname(fileURLToPath(import.meta.url))
const pluginRoot = __dirname
const helperPath = resolve(pluginRoot, 'scripts', 'ccg_codex_mcp.py')
const pythonCommand = process.env.CCG_MCP_PYTHON || 'python'

let cachedTools = null

process.on('unhandledRejection', (error) => {
  process.stderr.write(`[${SERVER_NAME}] unhandledRejection: ${String(error)}\n`)
})

process.on('uncaughtException', (error) => {
  process.stderr.write(`[${SERVER_NAME}] uncaughtException: ${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})

function jsonText(payload) {
  return JSON.stringify(payload, null, 2)
}

function runHelper(args) {
  if (!existsSync(helperPath)) {
    throw new Error(`Helper not found: ${helperPath}`)
  }

  const completed = spawnSync(
    pythonCommand,
    [helperPath, ...args],
    {
      cwd: pluginRoot,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
      },
      maxBuffer: 10 * 1024 * 1024,
    },
  )

  const stdout = completed.stdout?.trim() || ''
  const stderr = completed.stderr?.trim() || ''

  if (completed.error) {
    throw completed.error
  }

  if (completed.status !== 0 && !stdout) {
    throw new Error(stderr || `Helper exited with code ${completed.status}`)
  }

  try {
    return JSON.parse(stdout || '{}')
  }
  catch (error) {
    throw new Error(stderr || stdout || `Failed to decode helper output: ${String(error)}`)
  }
}

function listTools() {
  if (cachedTools) {
    return cachedTools
  }

  const payload = runHelper(['--tool-definitions'])
  if (payload.success === false) {
    throw new Error(payload.error || 'Failed to load tool definitions')
  }

  cachedTools = payload.tools || []
  return cachedTools
}

function callTool(name, args) {
  const payload = runHelper([
    '--tool',
    name,
    '--arguments-json',
    JSON.stringify(args || {}),
  ])

  return {
    content: [{ type: 'text', text: jsonText(payload) }],
    structuredContent: payload,
    isError: payload.success === false,
  }
}

async function main() {
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: listTools() }
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params?.name
    const argumentsPayload = request.params?.arguments || {}
    return callTool(String(toolName), argumentsPayload)
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`[${SERVER_NAME}] running on stdio via ${pythonCommand}\n`)
}

main().catch((error) => {
  process.stderr.write(`[${SERVER_NAME}] fatal: ${error?.stack || error?.message || String(error)}\n`)
  process.exit(1)
})
