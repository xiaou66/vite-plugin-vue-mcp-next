import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  updateCodexMcpClientConfig,
  updateJsonMcpClientConfig,
  updateMcpClientConfigs
} from '../../src/plugin/mcpClientConfig'

let tempRoot: string

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'vue-mcp-next-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('JSON MCP client config writer', () => {
  it('creates a JSON MCP config when the file is missing', async () => {
    const configPath = path.join(tempRoot, '.cursor', 'mcp.json')

    await updateJsonMcpClientConfig({
      clientName: 'Cursor',
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/sse',
      serverName: 'vue-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vue-mcp-next': {
          type: 'sse',
          url: 'http://localhost:5173/__mcp/sse'
        }
      }
    })
  })

  it('preserves existing JSON fields and other MCP servers', async () => {
    const configPath = path.join(tempRoot, '.trae', 'mcp.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          keep: true,
          mcpServers: {
            existing: {
              url: 'https://example.com/mcp'
            }
          }
        },
        null,
        2
      )
    )

    await updateJsonMcpClientConfig({
      clientName: 'Trae',
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/sse',
      serverName: 'vue-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      keep: true,
      mcpServers: {
        existing: {
          url: 'https://example.com/mcp'
        },
        'vue-mcp-next': {
          type: 'sse',
          url: 'http://localhost:5173/__mcp/sse'
        }
      }
    })
  })

  it('keeps an existing JSON MCP server unchanged', async () => {
    const configPath = path.join(tempRoot, '.cursor', 'mcp.json')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            'vue-mcp-next': {
              type: 'sse',
              url: 'http://localhost:4100/__mcp/sse'
            }
          }
        },
        null,
        2
      )
    )

    await updateJsonMcpClientConfig({
      clientName: 'Cursor',
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/sse',
      serverName: 'vue-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vue-mcp-next': {
          type: 'sse',
          url: 'http://localhost:4100/__mcp/sse'
        }
      }
    })
  })

  it('does not overwrite invalid JSON config', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const configPath = path.join(tempRoot, '.mcp.json')
    await fs.writeFile(configPath, '{ invalid json')

    await updateJsonMcpClientConfig({
      clientName: 'Claude Code',
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/sse',
      serverName: 'vue-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '{ invalid json'
    )
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        '[vite-plugin-vue-mcp-next] Failed to update Claude Code MCP config'
      )
    )
  })
})

describe('Codex MCP client config writer', () => {
  it('creates Codex config when the file is missing', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vue-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })

  it('appends Codex server while preserving existing config', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      'model = "gpt-5.5"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"\n'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vue-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      'model = "gpt-5.5"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"\n\n[mcp_servers.vue-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })

  it('keeps an existing Codex server block unchanged', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:3000/old/sse"\n\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vue-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:3000/old/sse"\n\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n'
    )
  })

  it('separates appended Codex config when existing file has no trailing newline', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      '[mcp_servers.apifox-filter.env]\nAPIFOX_ACCESS_TOKEN = "redacted"'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vue-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.apifox-filter.env]\nAPIFOX_ACCESS_TOKEN = "redacted"\n\n[mcp_servers.vue-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })

  it('quotes Codex table key when server name contains special characters', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vue mcp next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers."vue mcp next"]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })
})

describe('MCP client config orchestration', () => {
  it('writes enabled client configs and skips disabled clients', async () => {
    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: false,
        trae: true,
        serverName: 'vue-mcp-next'
      }
    )

    await expect(
      fs.readFile(path.join(tempRoot, '.cursor', 'mcp.json'), 'utf-8')
    ).resolves.toContain('http://localhost:5173/__mcp/sse')
    await expect(
      fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf-8')
    ).resolves.toContain('[mcp_servers.vue-mcp-next]')
    await expect(
      fs.access(path.join(tempRoot, '.mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.readFile(path.join(tempRoot, '.trae', 'mcp.json'), 'utf-8')
    ).resolves.toContain('http://localhost:5173/__mcp/sse')
  })
})
