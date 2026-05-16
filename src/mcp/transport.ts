/* eslint-disable @typescript-eslint/no-deprecated -- 当前需要兼容仍使用 /sse 与 /messages 的 MCP 客户端，同时提供 /mcp 给只支持 Streamable HTTP 的客户端。 */
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { ViteDevServer } from 'vite'

/**
 * 在 Vite dev server 上挂载 MCP 路由。
 *
 * 当前同时保留 SSE 和 Streamable HTTP，是因为不同 MCP 客户端的传输支持不一致；
 * 每次连接都创建独立 McpServer，可以避免一个 server 实例被多个 transport 复用导致状态互相影响。
 */
export function setupMcpTransport(
  base: string,
  createServer: () => McpServer,
  vite: ViteDevServer
): void {
  const transports = new Map<
    string,
    { server: McpServer; transport: SSEServerTransport }
  >()

  vite.middlewares.use(`${base}/sse`, (_req, res) => {
    const transport = new SSEServerTransport(`${base}/messages`, res)
    const server = createServer()
    transports.set(transport.sessionId, { server, transport })
    res.on('close', () => {
      transports.delete(transport.sessionId)
      void server.close()
    })
    void server.connect(transport).catch((error: unknown) => {
      res.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })

  vite.middlewares.use(`${base}/mcp`, (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    })
    const server = createServer()
    res.on('close', () => {
      void transport.close()
      void server.close()
    })

    void server
      .connect(transport)
      .then(() => transport.handleRequest(req, res))
      .catch((error: unknown) => {
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

    const entry = transports.get(sessionId)

    if (!entry) {
      res.statusCode = 404
      res.end('Not Found')
      return
    }

    void entry.transport.handlePostMessage(req, res).catch((error: unknown) => {
      res.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })
}
