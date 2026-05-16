# vite-plugin-vue-mcp-next

面向 Vite + Vue 开发态的 Runtime DevTools MCP 插件。插件会在 Vite dev server 中挂载 MCP（Model Context Protocol，本地工具调用协议）服务，并注入浏览器 runtime，让 AI 客户端读取页面 DOM、Console 日志、Network 请求、Vue 组件树、Router、Pinia 状态，并在显式授权后执行控制台表达式。

该插件只面向本地开发环境。生产构建默认不包含调试采集逻辑。

## 能力概览

| 能力 | 默认通道 | 配置 CDP 后 | 说明 |
|---|---|---|---|
| 页面列表 | Vite entry + Runtime | Vite entry + Runtime + CDP target | 用于多页面和多 tab 场景下选择调试目标 |
| DOM tree | Runtime Hook | CDP 优先，Hook 兜底 | 可返回裁剪后的运行时 DOM 结构 |
| DOM selector 查询 | Runtime Hook | CDP 优先，Hook 兜底 | 可按 selector 返回节点文本、属性和布局信息 |
| Console 日志 | Runtime Hook | CDP 优先，Hook 兜底 | 采集 `log/info/warn/error/debug` 和运行时日志 |
| Evaluate 控制台执行 | Runtime Hook | CDP 优先，Hook 兜底 | 默认关闭，必须显式开启 |
| Network 请求 | Runtime Hook | CDP 优先，Hook 兜底 | 返回请求 URL、query、body、status、headers、response body |
| Vue 组件树 | Vue Runtime Bridge | Vue Runtime Bridge | Vue 专属语义不走 CDP |
| Vue 组件状态 | Vue Runtime Bridge | Vue Runtime Bridge | 读取和编辑组件状态 |
| Router 信息 | Vue Runtime Bridge | Vue Runtime Bridge | 返回当前路由和路由表 |
| Pinia 状态 | Vue Runtime Bridge | Vue Runtime Bridge | 返回 Pinia inspector tree 和 store state |

## 安装与使用

```bash
pnpm add -D @xiaou66/vite-plugin-vue-mcp-next
```

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueMcpNext from '@xiaou66/vite-plugin-vue-mcp-next'

export default defineConfig({
  plugins: [vue(), vueMcpNext()]
})
```

启动 Vite 后，默认会暴露两个 MCP 入口：

```text
SSE: http://localhost:<vite-port>/__mcp/sse
Streamable HTTP: http://localhost:<vite-port>/__mcp/mcp
```

启动 Vite dev server 后，插件会自动写入常见 AI 客户端的项目级 MCP 配置，服务名默认是 `vue-mcp-next`。自动配置只会在缺少同名 server 条目时新增配置；如果用户已经配置了 `vue-mcp-next`，插件不会重复写入或覆盖原配置。

| 客户端 | 自动配置文件 | 默认端点 |
|---|---|---|
| Cursor | `.cursor/mcp.json` | SSE |
| Codex | `.codex/config.toml` | Streamable HTTP |
| Claude Code | `.mcp.json` | SSE |
| Trae | `.trae/mcp.json` | SSE |

实际端口以启动日志中的 `MCP: SSE server is running at ...` 和 `MCP: Streamable HTTP server is running at ...` 为准。

### 手动配置 MCP 客户端

如果你不想使用自动配置，或需要把地址复制到其他支持 HTTP MCP 的客户端，可以手动配置当前 Vite dev server 的 MCP 地址。

Cursor、Claude Code、Trae 等 JSON 配置客户端可以使用：

```json
{
  "mcpServers": {
    "vue-mcp-next": {
      "type": "sse",
      "url": "http://localhost:5173/__mcp/sse"
    }
  }
}
```

Codex 使用 TOML 配置：

```toml
[mcp_servers.vue-mcp-next]
url = "http://localhost:5173/__mcp/mcp"
```

`5173` 是示例端口。若 Vite 使用了其他端口，请替换为启动日志中打印的 MCP 地址。

## 完整配置

```ts
vueMcpNext({
  mcpPath: '/__mcp',
  host: 'localhost',
  printUrl: true,
  updateCursorMcpJson: true,
  mcpClients: {
    cursor: true,
    codex: true,
    claudeCode: true,
    trae: true,
    serverName: 'vue-mcp-next'
  },
  appendTo: undefined,
  runtime: {
    mode: 'auto',
    evaluate: {
      enabled: false,
      timeoutMs: 3000
    }
  },
  cdp: {
    browserUrl: undefined,
    wsEndpoint: undefined,
    targetUrlPattern: undefined
  },
  network: {
    mode: 'auto',
    maxRecords: 500,
    captureRequestBody: true,
    captureResponseBody: true,
    maxBodySize: 100_000,
    maskHeaders: ['authorization', 'cookie', 'set-cookie']
  },
  dom: {
    maxDepth: 8,
    maxNodes: 2000,
    maxTextLength: 300
  },
  console: {
    maxRecords: 1000
  }
})
```

### 顶层配置

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `mcpPath` | `string` | `'/__mcp'` | MCP 服务挂载路径，实际 SSE 地址是 `${mcpPath}/sse`，Streamable HTTP 地址是 `${mcpPath}/mcp` |
| `host` | `string` | `'localhost'` | 打印 MCP 地址和写入 MCP 客户端配置时使用的 host |
| `printUrl` | `boolean` | `true` | 是否在 Vite 启动日志中打印 MCP SSE 地址 |
| `mcpClients` | `{ cursor?: boolean; codex?: boolean; claudeCode?: boolean; trae?: boolean; serverName?: string }` | 全部启用 | 是否自动写入 Cursor、Codex、Claude Code、Trae 的项目级 MCP 配置 |
| `updateCursorMcpJson` | `boolean | { enabled: boolean; serverName?: string }` | `true` | 兼容旧配置，建议新项目使用 `mcpClients` |
| `appendTo` | `string | RegExp` | `undefined` | 非 HTML 入口注入点。配置后会在匹配入口模块前追加 runtime import |

`appendTo` 适合 playground、框架包装入口、或不希望通过 `transformIndexHtml` 注入的场景：

```ts
vueMcpNext({
  appendTo: 'src/main.ts'
})
```

### Runtime 配置

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `runtime.mode` | `'auto' | 'cdp' | 'hook'` | `'auto'` | DOM、Console、Evaluate 等通用 DevTools 能力的通道策略 |
| `runtime.evaluate.enabled` | `boolean` | `false` | 是否允许 MCP 客户端执行页面表达式 |
| `runtime.evaluate.timeoutMs` | `number` | `3000` | Hook fallback 执行表达式的超时时间 |

`evaluate_script` 默认关闭。该能力可以读取和修改页面状态，必须由使用者显式开启：

```ts
vueMcpNext({
  runtime: {
    evaluate: {
      enabled: true
    }
  }
})
```

Hook fallback 当前执行的是表达式，不是完整语句块：

```js
// 可以
(console.warn('mcp log', { ok: true }), 'logged')

// 不可以
console.warn('mcp log', { ok: true }); 'logged'
```

如果需要完整 DevTools Console 行为，建议配置 CDP。

### CDP 配置

CDP（Chrome DevTools Protocol，Chrome DevTools 使用的浏览器调试协议）是可选能力。配置后，DOM、Console、Evaluate、Network 等通用 DevTools 能力会优先走 CDP；未配置或 target 不匹配时走页面 Hook 兜底。

```ts
vueMcpNext({
  cdp: {
    browserUrl: 'http://127.0.0.1:9222',
    targetUrlPattern: 'localhost:5173'
  }
})
```

也可以直接传入页面 WebSocket endpoint：

```ts
vueMcpNext({
  cdp: {
    wsEndpoint: 'ws://127.0.0.1:9222/devtools/page/xxx'
  }
})
```

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `cdp.browserUrl` | `string` | `undefined` | Chrome remote debugging HTTP 地址，例如 `http://127.0.0.1:9222` |
| `cdp.wsEndpoint` | `string` | `undefined` | 已知页面 WebSocket endpoint。配置后会直接连接该 endpoint |
| `cdp.targetUrlPattern` | `string | RegExp` | `undefined` | 多 tab 或多页面时用于匹配目标页面 URL |

启动 Chrome remote debugging 的示例：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/vite-plugin-vue-mcp-next-chrome
```

也可以连接 Electron、ZTools 等已经暴露 CDP 的应用。例如调试中已验证 `http://127.0.0.1:9222/json/list` 能返回 ZTools 页面 target，MCP 工具可直接对这些 `cdp:*` 页面执行 DOM、Evaluate、Console、Network 调试。

安全注意：CDP remote debugging 具备强页面控制能力，只应在本机开发环境使用，不要暴露到公网或共享网络。

### Network 配置

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `network.mode` | `'auto' | 'cdp' | 'hook' | 'off'` | `'auto'` | Network 采集通道策略 |
| `network.maxRecords` | `number` | `500` | 最大缓存请求数 |
| `network.captureRequestBody` | `boolean` | `true` | 是否采集请求体 |
| `network.captureResponseBody` | `boolean` | `true` | 是否采集响应体 |
| `network.maxBodySize` | `number` | `100_000` | 请求体和响应体最大采集长度 |
| `network.maskHeaders` | `string[]` | `['authorization', 'cookie', 'set-cookie']` | 需要脱敏的 header 名称 |

Hook Network 覆盖 `fetch` 和 `XMLHttpRequest`。CDP Network 更接近 Chrome DevTools Network 面板，可以覆盖更多请求生命周期信息。

### DOM 与 Console 配置

| 配置 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `dom.maxDepth` | `number` | `8` | DOM tree 最大输出深度 |
| `dom.maxNodes` | `number` | `2000` | DOM tree 最大节点数 |
| `dom.maxTextLength` | `number` | `300` | 单个文本节点最大长度 |
| `console.maxRecords` | `number` | `1000` | Console 日志最大缓存条数 |

DOM 默认跳过 `script`、`style`、`noscript`，并隐藏 password input 的值。这样做是为了避免 MCP 上下文被大页面或敏感字段污染。

## MCP 工具清单

### 页面工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `list_pages` | 无 | `entries`、`pages`、`cdpError?` | 返回 Vite HTML 入口、runtime 页面和 CDP target |
| `get_page_state` | `pageId?` | 页面状态 | 预留页面状态工具名 |

`list_pages` 的 `pages` 中可能出现两类页面：

- `runtime-*`：由页面注入 runtime bridge 后连接
- `cdp:*`：由 CDP `/json/list` 发现

### DOM 工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `get_dom_tree` | `pageId?`、`maxDepth?`、`maxNodes?` | `source`、`snapshot` | 获取裁剪后的 DOM tree |
| `query_dom` | `pageId?`、`selector`、`limit?` | `source`、`nodes` | 按 selector 查询元素摘要 |

CDP 可用时输出 `source: 'cdp'`，否则使用 Runtime Hook 输出 `source: 'hook'`。

### Console 工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `get_console_logs` | `pageId?`、`level?`、`limit?` | `logs` | 获取 Console 日志 |
| `clear_console_logs` | `pageId?` | `ok` | 清空缓存日志 |

日志结构包含：

```ts
interface ConsoleRecord {
  id: string
  pageId: string
  source: 'cdp' | 'hook'
  level: 'log' | 'info' | 'warn' | 'error' | 'debug'
  message: string
  args?: unknown[]
  stack?: string
  timestamp: number
}
```

### Evaluate 工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `evaluate_script` | `pageId?`、`expression`、`awaitPromise?` | `source`、`value/result` | 执行控制台表达式 |

该工具默认关闭，必须配置 `runtime.evaluate.enabled: true`。CDP 可用时使用 `Runtime.evaluate`，否则使用 Runtime Hook fallback。

### Network 工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `get_network_requests` | `pageId?`、`urlContains?`、`method?`、`status?`、`limit?` | `requests` | 获取请求列表 |
| `get_network_request_detail` | `id` | `request` | 获取单条请求详情 |
| `clear_network_requests` | `pageId?` | `ok` | 清空请求缓存 |

Network 记录结构覆盖调试接口时最常见的三个问题：

```ts
interface NetworkRecord {
  id: string
  pageId: string
  source: 'cdp' | 'hook'
  url: string
  method: string
  requestHeaders?: Record<string, string>
  requestQuery?: Record<string, string | string[]>
  requestBody?: unknown
  status?: number
  responseHeaders?: Record<string, string>
  responseBody?: unknown
  error?: string
  startedAt: number
  endedAt?: number
  durationMs?: number
}
```

- 请求了哪些接口：`url`、`method`
- 接口请求参数是什么：`requestQuery`、`requestBody`、`requestHeaders`
- 接口响应值是什么：`status`、`responseHeaders`、`responseBody`、`error`

### Vue 专属工具

| 工具 | 输入 | 输出 | 说明 |
|---|---|---|---|
| `get_component_tree` | `pageId?` | `data` | 获取 Vue component tree |
| `get_component_state` | `pageId?`、`componentName` | `data` | 获取组件状态 |
| `edit_component_state` | `pageId?`、`componentName`、`path`、`value`、`valueType` | `ok` | 修改组件状态 |
| `highlight_component` | `pageId?`、`componentName` | `ok` | 高亮组件 |
| `get_router_info` | `pageId?` | `data` | 获取 Vue Router 信息 |
| `get_pinia_tree` | `pageId?` | `data` | 获取 Pinia inspector tree |
| `get_pinia_state` | `pageId?`、`storeName` | `data` | 获取 Pinia store state |

Vue 组件、Router、Pinia 是应用层语义，固定走 Vue Runtime Bridge，不用 CDP 替代。

## 本地验证

### 自动化检查

```bash
pnpm run check
```

该命令会串行执行：

- `pnpm run typecheck`
- `pnpm run lint`
- `pnpm run test`
- `pnpm run build`

### Playground 验证

```bash
pnpm run play
```

启动后会输出：

```text
Local: http://localhost:3456/
MCP: SSE server is running at http://localhost:3456/__mcp/sse
MCP: Streamable HTTP server is running at http://localhost:3456/__mcp/mcp
```

当前 playground 页面入口为：

```text
http://localhost:3456/playground/index.html
```

### MCP Inspector 验证

```bash
pnpm run inspect:mcp
```

在 Inspector 中连接：

```text
http://localhost:3456/__mcp/sse
```

推荐按以下顺序测试：

1. 调用 `list_pages`，确认能看到 `runtime-*` 或 `cdp:*` 页面
2. 调用 `query_dom`，例如 selector 使用 `[data-testid="count"]`
3. 调用 `evaluate_script`，例如表达式使用 `document.title`
4. 在页面点击 Console Log，再调用 `get_console_logs`
5. 在页面点击 Network Request，再调用 `get_network_requests`
6. 调用 `get_component_tree`
7. 调用 `get_router_info`
8. 调用 `get_pinia_tree` 和 `get_pinia_state`

### CDP 验证

先确认 CDP endpoint 可用：

```bash
curl -fsS http://127.0.0.1:9222/json/version
curl -fsS http://127.0.0.1:9222/json/list
```

在插件中配置：

```ts
vueMcpNext({
  cdp: {
    browserUrl: 'http://127.0.0.1:9222',
    targetUrlPattern: 'localhost:3456/playground/index.html'
  },
  runtime: {
    evaluate: {
      enabled: true
    }
  }
})
```

CDP 验证通过时，以下工具返回中应出现 `source: 'cdp'`：

- `get_dom_tree`
- `query_dom`
- `evaluate_script`
- `get_console_logs`
- `get_network_requests`

## 已验证结果

当前实现已通过以下验证：

- MCP SSE 服务可连接
- `tools/list` 可枚举 16 个 MCP 工具
- `list_pages` 可返回 Vite entry、runtime 页面和 CDP target
- Runtime Hook 可读取 DOM、Console、Network
- Runtime Hook 可执行已授权表达式
- Vue Runtime Bridge 可读取组件树、Router、Pinia tree/state
- CDP 可读取 DOM tree、selector 查询、Evaluate、Console、Network
- `pnpm run check` 通过
- `git diff --check` 通过

## 限制与边界

- 生产构建默认不启用调试采集。
- Hook Network 只覆盖 `fetch` 和 `XMLHttpRequest`，不覆盖所有静态资源、浏览器内部请求或扩展请求。
- 最接近 Chrome DevTools Network 面板的行为需要配置 CDP。
- Hook fallback 的 `evaluate_script` 只支持表达式，不支持完整语句块。
- DOM、日志和 Network 都有默认缓存或输出上限，响应体和长文本会被裁剪。
- Vue 组件、Router、Pinia 能力固定走 Vue Runtime Bridge，不用 CDP 替代。
- CDP 只连接用户提供的 `browserUrl` 或 `wsEndpoint`，插件不负责启动 Chrome。

## 脚本

| 脚本 | 说明 |
|---|---|
| `pnpm run build` | 构建 ESM、CJS 和类型声明 |
| `pnpm run dev` | 以 watch 模式构建 |
| `pnpm run typecheck` | 执行 TypeScript 静态检查 |
| `pnpm run lint` | 执行 ESLint 检查 |
| `pnpm run test` | 执行 Vitest 测试 |
| `pnpm run check` | 串行执行类型检查、Lint、测试和构建 |
| `pnpm run play` | 启动本地 playground |
| `pnpm run inspect:mcp` | 启动 MCP Inspector |

## 发布到 npm

包名已经配置为：

```text
@xiaou66/vite-plugin-vue-mcp-next
```

发布前需要确认 npm 已登录，并且账号具备 `@xiaou66` scope 的发布权限：

```bash
npm whoami
```

如果未登录：

```bash
npm login
```

发布前检查：

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run pack:dry-run
```

正式发布：

```bash
pnpm run publish:npm
```

该包是 scoped package，`package.json` 已配置：

```json
{
  "publishConfig": {
    "access": "public",
    "registry": "https://registry.npmjs.org/"
  }
}
```

因此也可以直接执行：

```bash
npm publish
```

发布脚本会在 `prepublishOnly` 阶段自动执行 `pnpm run check`。该检查会生成 `dist/`，npm 发布包只包含 `dist`、`README.md` 和 `LICENSE`。

当前发布配置包含：

- `license: MIT`
- `repository: git+https://github.com/xiaou66/vite-plugin-vue-mcp-next.git`
- `homepage: https://github.com/xiaou66/vite-plugin-vue-mcp-next#readme`
- `bugs: https://github.com/xiaou66/vite-plugin-vue-mcp-next/issues`
- `publishConfig.access: public`
- `files: dist, README.md, LICENSE`
