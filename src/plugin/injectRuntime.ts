import type { IndexHtmlTransformResult, ResolvedConfig } from 'vite'
import { RESOLVED_VIRTUAL_RUNTIME_ID, VIRTUAL_RUNTIME_ID } from '../constants'
import type { ResolvedVueMcpNextOptions } from '../types'

/**
 * 管理运行时脚本注入。
 *
 * Vite 项目可能使用 HTML 入口，也可能通过框架入口文件启动，
 * 因此注入逻辑必须同时支持 `transformIndexHtml` 和 `appendTo` 两种方式。
 */
export interface RuntimeInjectionController {
  /** 解析虚拟模块 ID，使浏览器端可以通过 Vite 加载 runtime client。 */
  resolveId(importee: string): string | undefined
  /** 加载 runtime client 模块内容。 */
  load(id: string): string | undefined
  /** 在 HTML 入口中注入 runtime client。 */
  transformIndexHtml(html: string): IndexHtmlTransformResult | undefined
  /** 在非 HTML 入口中追加 runtime import。 */
  transform(code: string, id: string, ssr?: boolean): string | undefined
}

/**
 * 创建运行时注入控制器。
 *
 * 将注入行为拆出 Vite 插件主文件，可以让后续测试单独覆盖 HTML 注入和 appendTo 注入。
 */
export function createRuntimeInjectionController(
  options: ResolvedVueMcpNextOptions,
  getConfig: () => ResolvedConfig | undefined
): RuntimeInjectionController {
  return {
    resolveId(importee) {
      if (importee === VIRTUAL_RUNTIME_ID) {
        return RESOLVED_VIRTUAL_RUNTIME_ID
      }

      return undefined
    },
    load(id) {
      if (id !== RESOLVED_VIRTUAL_RUNTIME_ID) {
        return undefined
      }

      return "import { startRuntimeClient } from '@xiaou66/vite-plugin-vue-mcp-next/runtime/client';\nvoid startRuntimeClient();"
    },
    transformIndexHtml(html) {
      if (options.appendTo) {
        return undefined
      }

      const base = getConfig()?.base || '/'

      return {
        html,
        tags: [
          {
            tag: 'script',
            injectTo: 'head-prepend',
            attrs: {
              type: 'module',
              src: `${base}@id/${VIRTUAL_RUNTIME_ID}`
            }
          }
        ]
      }
    },
    transform(code, id, ssr) {
      if (ssr || !options.appendTo) {
        return undefined
      }

      const [filename] = id.split('?', 2)
      const matched =
        typeof options.appendTo === 'string'
          ? filename.endsWith(options.appendTo)
          : options.appendTo.test(filename)

      if (!matched) {
        return undefined
      }

      return `import '${VIRTUAL_RUNTIME_ID}';\n${code}`
    }
  }
}
