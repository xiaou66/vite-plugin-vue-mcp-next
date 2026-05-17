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
      serverName: 'vite-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vite-mcp-next': {
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
      serverName: 'vite-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      keep: true,
      mcpServers: {
        existing: {
          url: 'https://example.com/mcp'
        },
        'vite-mcp-next': {
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
            'vite-mcp-next': {
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
      serverName: 'vite-mcp-next'
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vite-mcp-next': {
          type: 'sse',
          url: 'http://localhost:4100/__mcp/sse'
        }
      }
    })
  })

  it('renames a legacy JSON MCP server to the default server name', async () => {
    const configPath = path.join(tempRoot, '.mcp.json')
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          keep: true,
          mcpServers: {
            'vue-mcp-next': {
              type: 'sse',
              url: 'http://localhost:4100/__mcp/sse',
              env: {
                KEEP: 'true'
              }
            }
          }
        },
        null,
        2
      )
    )

    await updateJsonMcpClientConfig({
      clientName: 'Claude Code',
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/sse',
      serverName: 'vite-mcp-next',
      legacyServerNames: ['vue-mcp-next']
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      keep: true,
      mcpServers: {
        'vite-mcp-next': {
          type: 'sse',
          url: 'http://localhost:4100/__mcp/sse',
          env: {
            KEEP: 'true'
          }
        }
      }
    })
  })

  it('does not migrate legacy JSON MCP server when the new name already exists', async () => {
    const configPath = path.join(tempRoot, '.mcp.json')
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            'vue-mcp-next': {
              type: 'sse',
              url: 'http://localhost:4100/__mcp/sse'
            },
            'vite-mcp-next': {
              type: 'sse',
              url: 'http://localhost:5173/__mcp/sse'
            }
          }
        },
        null,
        2
      )
    )

    await updateJsonMcpClientConfig({
      clientName: 'Claude Code',
      configPath,
      mcpUrl: 'http://localhost:9999/__mcp/sse',
      serverName: 'vite-mcp-next',
      legacyServerNames: ['vue-mcp-next']
    })

    const raw = await fs.readFile(configPath, 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vue-mcp-next': {
          type: 'sse',
          url: 'http://localhost:4100/__mcp/sse'
        },
        'vite-mcp-next': {
          type: 'sse',
          url: 'http://localhost:5173/__mcp/sse'
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
      serverName: 'vite-mcp-next'
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
      serverName: 'vite-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
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
      serverName: 'vite-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      'model = "gpt-5.5"\n\n[mcp_servers.existing]\nurl = "https://example.com/mcp"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })

  it('appends new Codex server when legacy name is not configured for migration', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:3000/old/sse"\n\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vite-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:3000/old/sse"\n\n[mcp_servers.other]\nurl = "https://example.com/mcp"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )
  })

  it('renames a legacy Codex MCP server and child tables to the default server name', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      'model = "gpt-5.5"\n\n[mcp_servers.vue-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n\n[mcp_servers.vue-mcp-next.env]\nKEEP = "true"\n'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:5173/__mcp/mcp',
      serverName: 'vite-mcp-next',
      legacyServerNames: ['vue-mcp-next']
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      'model = "gpt-5.5"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n\n[mcp_servers.vite-mcp-next.env]\nKEEP = "true"\n'
    )
  })

  it('does not migrate legacy Codex MCP server when the new name already exists', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
    )

    await updateCodexMcpClientConfig({
      configPath,
      mcpUrl: 'http://localhost:9999/__mcp/mcp',
      serverName: 'vite-mcp-next',
      legacyServerNames: ['vue-mcp-next']
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
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
      serverName: 'vite-mcp-next'
    })

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.apifox-filter.env]\nAPIFOX_ACCESS_TOKEN = "redacted"\n\n[mcp_servers.vite-mcp-next]\nurl = "http://localhost:5173/__mcp/mcp"\n'
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
  it('does not create client configs when no client entry exists in auto mode', async () => {
    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {}
    )

    await expect(
      fs.access(path.join(tempRoot, '.cursor', 'mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.codex', 'config.toml'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.trae', 'mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes only detected client configs in auto mode', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })

    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {}
    )

    await expect(
      fs.access(path.join(tempRoot, '.cursor', 'mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf-8')
    ).resolves.toContain('[mcp_servers.vite-mcp-next]')
    await expect(
      fs.access(path.join(tempRoot, '.mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.trae', 'mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('detects Claude Code only when root .mcp.json exists in auto mode', async () => {
    await fs.writeFile(path.join(tempRoot, '.mcp.json'), '{}\n')

    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {}
    )

    const raw = await fs.readFile(path.join(tempRoot, '.mcp.json'), 'utf-8')
    expect(JSON.parse(raw)).toEqual({
      mcpServers: {
        'vite-mcp-next': {
          type: 'sse',
          url: 'http://localhost:5173/__mcp/sse'
        }
      }
    })
    await expect(
      fs.access(path.join(tempRoot, '.codex', 'config.toml'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('creates a client config when the client is explicitly enabled', async () => {
    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {
        mcpClients: {
          codex: true
        }
      }
    )

    await expect(
      fs.readFile(path.join(tempRoot, '.codex', 'config.toml'), 'utf-8')
    ).resolves.toContain('[mcp_servers.vite-mcp-next]')
    await expect(
      fs.access(path.join(tempRoot, '.cursor', 'mcp.json'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('skips a detected client when the client is explicitly disabled', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })

    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: false,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {
        mcpClients: {
          codex: false
        }
      }
    )

    await expect(
      fs.access(path.join(tempRoot, '.codex', 'config.toml'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('migrates an existing detected JSON MCP server from the legacy default name', async () => {
    const configPath = path.join(tempRoot, '.mcp.json')
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          mcpServers: {
            'vue-mcp-next': {
              type: 'sse',
              url: 'http://localhost:4100/__mcp/sse',
              env: {
                KEEP: 'true'
              }
            }
          }
        },
        null,
        2
      )
    )

    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {}
    )

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      `${JSON.stringify(
        {
          mcpServers: {
            'vite-mcp-next': {
              type: 'sse',
              url: 'http://localhost:4100/__mcp/sse',
              env: {
                KEEP: 'true'
              }
            }
          }
        },
        null,
        2
      )}\n`
    )
  })

  it('migrates an existing detected Codex MCP server from the legacy default name', async () => {
    const configPath = path.join(tempRoot, '.codex', 'config.toml')
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    await fs.writeFile(
      configPath,
      '[mcp_servers.vue-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n[mcp_servers.vue-mcp-next.env]\nKEEP = "true"\n'
    )

    await updateMcpClientConfigs(
      tempRoot,
      'http://localhost:5173/__mcp/sse',
      'http://localhost:5173/__mcp/mcp',
      {
        cursor: true,
        codex: true,
        claudeCode: true,
        trae: true,
        serverName: 'vite-mcp-next'
      },
      {}
    )

    await expect(fs.readFile(configPath, 'utf-8')).resolves.toBe(
      '[mcp_servers.vite-mcp-next]\nurl = "http://localhost:4100/__mcp/mcp"\n[mcp_servers.vite-mcp-next.env]\nKEEP = "true"\n'
    )
  })
})
