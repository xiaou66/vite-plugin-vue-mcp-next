import { describe, expect, it, vi } from 'vitest'
import { MCP_TOOL_NAMES } from '../../src/constants'
import { createServerVueRuntimeRpc } from '../../src/mcp/vueRpc'

describe('storage contracts', () => {
  it('exposes storage tool names and runtime callbacks', () => {
    const ctx = {
      hooks: { callHook: vi.fn() }
    } as never

    const rpc = createServerVueRuntimeRpc(ctx)

    expect(MCP_TOOL_NAMES.listStorage).toBe('list_storage')
    expect(MCP_TOOL_NAMES.getStorageItem).toBe('get_storage_item')
    expect(MCP_TOOL_NAMES.setStorageItem).toBe('set_storage_item')
    expect(MCP_TOOL_NAMES.deleteStorageItem).toBe('delete_storage_item')
    expect(MCP_TOOL_NAMES.clearStorage).toBe('clear_storage')
    expect('manageStorage' in rpc).toBe(true)
    expect('onStorageUpdated' in rpc).toBe(true)
  })
})
