import type { IndexHtmlTransformResult, ResolvedConfig } from 'vite'
import {
  RESOLVED_VIRTUAL_RUNTIME_ID,
  RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID,
  VIRTUAL_RUNTIME_ID,
  VIRTUAL_SCREENSHOT_CONFIG_ID
} from '../constants'
import type { SnapdomPluginImport } from '../types'
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

      if (importee === VIRTUAL_SCREENSHOT_CONFIG_ID) {
        return RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID
      }

      return undefined
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_RUNTIME_ID) {
        return "import { startRuntimeClient } from '@xiaou66/vite-plugin-vue-mcp-next/runtime/client';\nvoid startRuntimeClient();"
      }

      if (id === RESOLVED_VIRTUAL_SCREENSHOT_CONFIG_ID) {
        return createScreenshotConfigModule(options)
      }

      return undefined
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

/**
 * 生成 snapdom 扩展虚拟模块。
 *
 * 用户配置的是 Vite import 路径，必须让 Vite 通过静态 import 解析 alias、TS 和插件转换；
 * runtime 再按原始 path 查表，可以避免浏览器原生动态 import 无法理解别名。
 */
function createScreenshotConfigModule(
  options: ResolvedVueMcpNextOptions
): string {
  const paths = collectScreenshotImportPaths(options)
  const imports = paths
    .map((item, index) => `import * as m${String(index)} from ${JSON.stringify(item)};`)
    .join('\n')
  const entries = paths
    .map((item, index) => `${JSON.stringify(item)}: m${String(index)}`)
    .join(',\n  ')

  return `${imports}\nexport const screenshotModuleRegistry = {\n  ${entries}\n};\n`
}

/**
 * 收集截图配置中的 Vite import 路径。
 *
 * 插件、filter 和 fallbackURL 都可能引用用户源码模块，去重后生成虚拟模块可以减少重复 import。
 */
function collectScreenshotImportPaths(
  options: ResolvedVueMcpNextOptions
): string[] {
  const paths = new Set<string>()

  for (const plugin of options.screenshot.snapdom.plugins) {
    paths.add(getPluginPath(plugin))
  }

  if (options.screenshot.snapdom.filter) {
    paths.add(options.screenshot.snapdom.filter)
  }

  if (options.screenshot.snapdom.fallbackURL) {
    paths.add(options.screenshot.snapdom.fallbackURL)
  }

  return [...paths]
}

/**
 * 读取插件路径。
 *
 * 支持字符串和对象两种配置形态，可以让用户在简单默认导出和带参数插件工厂之间选择。
 */
function getPluginPath(plugin: SnapdomPluginImport): string {
  return typeof plugin === 'string' ? plugin : plugin.path
}
