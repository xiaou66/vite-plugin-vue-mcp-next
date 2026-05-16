import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { nanoid } from 'nanoid'
import { z } from 'zod'
import { MCP_TOOL_NAMES } from '../../constants'
import type { VueMcpNextContext } from '../../types'
import { createToolError, createToolResponse } from '../routeTools'

/**
 * 注册 Vue 专属 MCP 工具。
 *
 * Vue 组件、Router 和 Pinia 使用 Runtime Bridge，不走 CDP；独立分组能防止通用 DevTools 路由误用到 Vue 语义。
 */
export function registerVueTools(
  server: McpServer,
  ctx: VueMcpNextContext
): void {
  server.registerTool(
    MCP_TOOL_NAMES.getComponentTree,
    { description: 'Get Vue component tree.' },
    async () =>
      requestVueData(ctx, (event) => {
        void ctx.rpcServer?.getInspectorTree({ event })
      })
  )

  server.registerTool(
    MCP_TOOL_NAMES.getComponentState,
    {
      description: 'Get Vue component state.',
      inputSchema: { componentName: z.string() }
    },
    async ({ componentName }) =>
      requestVueData(ctx, (event) => {
        void ctx.rpcServer?.getInspectorState({ event, componentName })
      })
  )

  server.registerTool(
    MCP_TOOL_NAMES.editComponentState,
    {
      description: 'Edit Vue component state.',
      inputSchema: {
        componentName: z.string(),
        path: z.array(z.string()),
        value: z.string(),
        valueType: z.enum(['string', 'number', 'boolean', 'object', 'array'])
      }
    },
    ({ componentName, path, value, valueType }) => {
      if (!ctx.rpcServer) {
        return vueBridgeUnavailable()
      }

      void ctx.rpcServer.editComponentState({
        componentName,
        path,
        value,
        valueType
      })
      return createToolResponse({ ok: true })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.highlightComponent,
    {
      description: 'Highlight a Vue component.',
      inputSchema: { componentName: z.string() }
    },
    ({ componentName }) => {
      if (!ctx.rpcServer) {
        return vueBridgeUnavailable()
      }

      void ctx.rpcServer.highlightComponent({ componentName })
      return createToolResponse({ ok: true })
    }
  )

  server.registerTool(
    MCP_TOOL_NAMES.getRouterInfo,
    { description: 'Get Vue Router information.' },
    async () =>
      requestVueData(ctx, (event) => {
        ctx.rpcServer?.getRouterInfo({ event })
      })
  )

  server.registerTool(
    MCP_TOOL_NAMES.getPiniaTree,
    { description: 'Get Pinia inspector tree.' },
    async () =>
      requestVueData(ctx, (event) => {
        void ctx.rpcServer?.getPiniaTree({ event })
      })
  )

  server.registerTool(
    MCP_TOOL_NAMES.getPiniaState,
    {
      description: 'Get Pinia store state.',
      inputSchema: { storeName: z.string() }
    },
    async ({ storeName }) =>
      requestVueData(ctx, (event) => {
        void ctx.rpcServer?.getPiniaState({ event, storeName })
      })
  )
}

/**
 * 请求 Vue Runtime Bridge 数据并等待回调。
 *
 * Vue 工具依赖浏览器页面在线，使用超时可以避免 MCP 客户端在页面未打开时永久等待。
 */
async function requestVueData(
  ctx: VueMcpNextContext,
  trigger: (event: string) => void
): Promise<CallToolResult> {
  if (!ctx.rpcServer) {
    return vueBridgeUnavailable()
  }

  const event = nanoid()
  const data = await waitForVueHook(ctx, event, () => {
    trigger(event)
  })

  return {
    ...createToolResponse({ data })
  }
}

/**
 * 等待一次 Vue RPC 回调。
 *
 * 使用 hookOnce 保证同一个 event 只唤醒一个 MCP 请求，避免并发请求互相消费结果。
 */
function waitForVueHook(
  ctx: VueMcpNextContext,
  event: string,
  trigger: () => void
): Promise<unknown> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      resolve({ ok: false, error: 'Vue runtime bridge response timed out' })
    }, 5000)

    ctx.hooks.hookOnce(event, (data) => {
      clearTimeout(timeout)
      resolve(data)
    })
    trigger()
  })
}

/**
 * 返回 Vue bridge 不可用错误。
 *
 * 页面未打开或 runtime 尚未连接时，明确错误比空结果更容易让 AI 指导用户修复环境。
 */
function vueBridgeUnavailable(): CallToolResult {
  return createToolError('Vue runtime bridge is not connected')
}
