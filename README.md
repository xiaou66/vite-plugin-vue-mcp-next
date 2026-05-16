# vite-plugin-vue-mcp-next

一个用于后续接入 Vue/Vite 运行时 MCP 调试能力的 Vite 插件包模板。

当前阶段只初始化工程骨架，不包含 DOM、日志或 MCP 实现。

## 使用方式

```ts
import { defineConfig } from 'vite'
import vueMcpNext from 'vite-plugin-vue-mcp-next'

export default defineConfig({
  plugins: [vueMcpNext()]
})
```

## 脚本

- `pnpm build`：构建 ESM、CJS 和类型声明
- `pnpm typecheck`：执行 TypeScript 静态检查
- `pnpm lint`：执行 ESLint 检查
- `pnpm test`：执行 Vitest 测试
- `pnpm check`：串行执行类型检查、Lint、测试和构建

## 范围

首版只提供 TypeScript Vite 插件包模板。后续调试能力应在明确设计后再添加：

- 运行时 DOM 快照
- 页面 console 日志采集
- MCP 工具入口
- 可选的页面脚本执行能力

