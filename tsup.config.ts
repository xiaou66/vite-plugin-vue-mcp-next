import { defineConfig } from 'tsup'

/**
 * 包构建配置。
 *
 * Vite 虚拟模块只会在宿主项目的 dev server 中解析，发布包构建阶段必须保留 import 字面量，
 * 适用于 runtime 代码需要等待 Vite 插件运行后再接入项目级配置的场景。
 */
const VITE_RUNTIME_EXTERNALS = [
  'vite',
  'virtual:vite-plugin-vue-mcp-next/screenshot-config'
]

export default defineConfig({
  entry: ['src/index.ts', 'src/runtime/client.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  target: 'node18',
  external: VITE_RUNTIME_EXTERNALS
})
