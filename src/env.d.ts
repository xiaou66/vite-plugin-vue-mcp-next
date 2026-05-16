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
