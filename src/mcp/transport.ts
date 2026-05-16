/* eslint-disable @typescript-eslint/no-deprecated -- 当前需要兼容仍使用 /sse 与 /messages 的 MCP 客户端，Streamable HTTP 会在同一文件中后续扩展。 */
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ViteDevServer } from 'vite'

/**
 * 在 Vite dev server 上挂载 MCP 路由。
 *
 * 当前保留 SSE 路由是为了兼容 Cursor 等仍使用 `/sse` 和 `/messages` 的 MCP 客户端；
 * 后续如果客户端统一转向 Streamable HTTP，可以在这里新增 `/mcp` 而不影响工具注册层。
 */
export function setupMcpTransport(
  base: string,
  server: McpServer,
  vite: ViteDevServer
): void {
  const transports = new Map<string, SSEServerTransport>()

  vite.middlewares.use(`${base}/sse`, (_req, res) => {
    const transport = new SSEServerTransport(`${base}/messages`, res)
    transports.set(transport.sessionId, transport)
    res.on('close', () => {
      transports.delete(transport.sessionId)
    })
    void server.connect(transport).catch((error: unknown) => {
      res.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })

  vite.middlewares.use(`${base}/messages`, (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const query = new URLSearchParams(req.url?.split('?').pop() || '')
    const sessionId = query.get('sessionId')

    if (!sessionId) {
      res.statusCode = 400
      res.end('Bad Request')
      return
    }

    const transport = transports.get(sessionId)

    if (!transport) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    void transport.handlePostMessage(req, res).catch((error: unknown) => {
      res.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })
}
