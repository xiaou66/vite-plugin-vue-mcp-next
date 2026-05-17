/**
 * Vue 单文件组件声明。
 *
 * Playground 使用 `.vue` 文件做手动验证，TypeScript 主配置需要识别该模块格式。
 */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'

  const component: DefineComponent<object, object, unknown>
  export default component
}

/**
 * snapdom 扩展虚拟模块声明。
 *
 * 浏览器 runtime 通过该模块读取 Vite 已静态解析的用户插件路径，避免动态 import 失去 alias 支持。
 */
declare module 'virtual:vite-plugin-vue-mcp-next/screenshot-config' {
  /** Vite import 路径到模块命名空间对象的映射，适合 runtime 按用户原始配置查表加载。 */
  export const screenshotModuleRegistry: Record<
    string,
    Record<string, unknown>
  >
}

/**
 * snapdom loader 虚拟模块声明。
 *
 * optional peer 只能在宿主项目的 Vite 模块图里解析，因此 runtime 通过该模块取得可失败的加载器。
 */
declare module 'virtual:vite-plugin-vue-mcp-next/snapdom-loader' {
  /** 加载 snapdom 的函数，缺失 optional peer 时会拒绝并返回可给 MCP 展示的错误。 */
  export const loadSnapdom: () => Promise<{
    snapdom: (
      element: Element,
      options: Record<string, unknown>
    ) => Promise<{
      toBlob: (options?: Record<string, unknown>) => Promise<Blob>
    }>
  }>
}
