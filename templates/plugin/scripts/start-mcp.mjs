#!/usr/bin/env node
/**
 * start-mcp.mjs - 跨平台 MCP server 启动器
 * 在 Windows 上自动使用 cmd /c 包装 npx 命令
 */
import { spawn } from 'node:child_process'

const server = process.argv[2]
if (!server) {
  console.error('Usage: node start-mcp.mjs <server-name>')
  process.exit(1)
}

const servers = {
  'fast-context': {
    pkg: '@sammysnake/fast-context-mcp@next',
    args: ['--prefer-online'],
  },
  'sequential-thinking': {
    pkg: '@modelcontextprotocol/server-sequential-thinking',
    args: [],
  },
}

const config = servers[server]
if (!config) {
  console.error(`Unknown MCP server: ${server}`)
  process.exit(1)
}

const isWindows = process.platform === 'win32'
const npxArgs = ['-y', ...config.args, config.pkg]

const child = isWindows
  ? spawn('cmd', ['/c', 'npx', ...npxArgs], { stdio: 'inherit', env: process.env })
  : spawn('npx', npxArgs, { stdio: 'inherit', env: process.env })

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error(`Failed to start ${server}:`, err.message)
  process.exit(1)
})
