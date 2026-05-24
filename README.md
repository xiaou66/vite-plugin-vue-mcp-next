# vite-plugin-vue-mcp-next

面向 Vite + Vue 开发态的 Runtime DevTools MCP 插件。插件会在 Vite dev server 中挂载 MCP（Model Context Protocol，本地工具调用协议）服务，并注入浏览器 runtime，让 AI 客户端读取页面 DOM、Console 日志、Network 请求、Vue 组件树、Router、Pinia 状态，并在显式授权后执行控制台表达式。

该插件只面向本地开发环境。生产构建默认不包含调试采集逻辑。

## 能力概览

| 能力                | 默认通道             | 配置 CDP 后                       | 说明                                                      |
| ------------------- | -------------------- | --------------------------------- | --------------------------------------------------------- |
| 页面列表            | Vite entry + Runtime | Vite entry + Runtime + CDP target | 用于多页面和多 tab 场景下选择调试目标                     |
| DOM tree            | Runtime Hook         | CDP 优先，Hook 兜底               | 可返回裁剪后的运行时 DOM 结构                             |
| DOM selector 查询   | Runtime Hook         | CDP 优先，Hook 兜底               | 可按 selector 返回节点文本、属性和布局信息                |
| 页面截图            | snapdom DOM 截图     | CDP 真截图优先，snapdom 降级      | 默认保存到项目目录并返回路径，也可配置为 base64 返回      |
| Console 日志        | Runtime Hook         | CDP 优先，Hook 兜底               | 采集 `log/info/warn/error/debug` 和运行时日志             |
| Evaluate 控制台执行 | Runtime Hook         | CDP 优先，Hook 兜底               | 默认关闭，必须显式开启                                    |
| Network 请求        | Runtime Hook         | CDP 优先，Hook 兜底               | 返回请求 URL、query、body、status、headers、response body |
| 浏览器存储          | Runtime Hook         | CDP 优先，Hook 兜底               | 访问同源 Web Storage、IndexedDB；Cookie 在无 CDP 时回退到 `document.cookie` |
| Vue 组件树          | Vue Runtime Bridge   | Vue Runtime Bridge                | Vue 专属语义不走 CDP                                      |
| Vue 组件状态        | Vue Runtime Bridge   | Vue Runtime Bridge                | 读取和编辑组件状态                                        |
| Router 信息         | Vue Runtime Bridge   | Vue Runtime Bridge                | 返回当前路由和路由表                                      |
| Pinia 状态          | Vue Runtime Bridge   | Vue Runtime Bridge                | 返回 Pinia inspector tree 和 store state                  |
| 性能诊断            | Runtime Hook         | CDP 优先，Hook 兜底               | 可分析主线程卡顿、内存趋势和堆栈，CDP 时可导出 profile    |

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

启动 Vite dev server 后，插件会按项目中已经存在的客户端入口自动写入项目级 MCP 配置，服务名默认是 `vite-mcp-next`。自动配置只会在缺少同名 server 条目时新增配置；如果用户已经配置了历史默认名 `vue-mcp-next`，插件会把它迁移为 `vite-mcp-next` 并保留原配置内容。

默认自动探测规则如下：

| 客户端      | 自动探测入口 | 自动配置文件         | 默认端点        |
| ----------- | ------------ | -------------------- | --------------- |
| Cursor      | `.cursor/`   | `.cursor/mcp.json`   | SSE             |
| Codex       | `.codex/`    | `.codex/config.toml` | Streamable HTTP |
| Claude Code | `.mcp.json`  | `.mcp.json`          | SSE             |
| Trae        | `.trae/`     | `.trae/mcp.json`     | SSE             |

如果项目中没有对应入口，默认不会创建该客户端配置。需要强制创建时，可以在 `mcpClients` 中显式设置对应客户端为 `true`；需要禁用时显式设置为 `false`。

实际端口以启动日志中的 `MCP: SSE server is running at ...` 和 `MCP: Streamable HTTP server is running at ...` 为准。

### 手动配置 MCP 客户端

如果你不想使用自动配置，或需要把地址复制到其他支持 HTTP MCP 的客户端，可以手动配置当前 Vite dev server 的 MCP 地址。

Cursor、Claude Code、Trae 等 JSON 配置客户端可以使用：

```json
{
  "mcpServers": {
    "vite-mcp-next": {
      "type": "sse",
      "url": "http://localhost:5173/__mcp/sse"
    }
  }
}
```

Codex 使用 TOML 配置：

```toml
[mcp_servers.vite-mcp-next]
url = "http://localhost:5173/__mcp/mcp"
```

`5173` 是示例端口。若 Vite 使用了其他端口，请替换为启动日志中打印的 MCP 地址。

### 自动复制 AI 使用指南

插件随 npm 包发布一份通用 Skill 文件：`skills/vite-mcp-next/SKILL.md`。Vite dev server 启动时，插件会在检测到项目中已经存在对应 AI 工具入口后，把这份静态文件复制到对应工具目录。插件不会在运行时拼接或生成 Skill 正文，包内 `skills/vite-mcp-next/SKILL.md` 是唯一内容来源。

| 客户端      | 探测入口   | 自动复制目标                                   | 说明                                  |
| ----------- | ---------- | ---------------------------------------------- | ------------------------------------- |
| Codex       | `.codex/`  | `.codex/skills/vite-mcp-next/SKILL.md`         | 从包内 `skills/vite-mcp-next/SKILL.md` 复制 |
| Claude Code | `.claude/` | `.claude/skills/vite-mcp-next/SKILL.md`        | 从包内 `skills/vite-mcp-next/SKILL.md` 复制 |
| Cursor      | `.cursor/` | `.cursor/rules/vite-mcp-next.mdc`              | 从同一份 Skill 文件复制，作为项目规则参考 |
| Trae        | `.trae/`   | 不自动复制                                     | 当前只自动写 MCP 配置，Rule 路径未作为首版稳定能力 |

使用指南覆盖以下工具顺序：

1. `list_pages`：先确认页面、runtime 和 CDP target
2. `get_dom_tree` / `query_dom`：检查 DOM 结构
3. `take_screenshot`：做视觉验证
4. `get_console_logs`：排查 Console 报错
5. `get_network_requests` / `get_network_request_detail`：排查接口请求
6. `get_component_tree` / `get_component_state` / `get_router_info` / `get_pinia_tree` / `get_pinia_state`：检查 Vue 语义状态

如果不希望插件复制任何 AI 使用指南，可以关闭：

```ts
vueMcpNext({
  skill: {
    autoConfig: false
  }
})
```

自动复制只会更新带有插件生成标记的文件；如果目标文件已经存在但不是插件生成的内容，插件会跳过并保留用户文件。没有使用某个 AI 工具时，对应入口目录不存在，插件不会创建该工具目录。

## 完整配置

`mcpClients` 中的布尔值保留为开关语义：默认解析后为 `true`，但写入阶段会先做项目入口自动探测；用户在配置中显式写出 `true` 时表示强制创建对应客户端配置。

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
    serverName: 'vite-mcp-next'
  },
  skill: {
    autoConfig: true
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
  },
  screenshot: {
    type: 'path',
    saveDir: '.vite-mcp/screenshot',
    prefer: 'auto',
    maxBytes: 5 * 1024 * 1024,
    snapdom: {
      options: {
        scale: 1,
        useProxy: undefined
      },
      plugins: []
    }
  },
  performance: {
    mode: 'auto',
    maxDurationMs: 30000,
    sampleIntervalMs: 250,
    longTaskThresholdMs: 50,
    saveDir: '.vite-mcp/performance',
    memory: {
      enabled: true
    },
    stacks: {
      enabled: true
    }
  }
})
```

### 顶层配置

| 配置                  | 类型                                                                                               | 默认值                   | 说明                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------- |
| `mcpPath`             | `string`                                                                                           | `'/__mcp'`               | MCP 服务挂载路径，实际 SSE 地址是 `${mcpPath}/sse`，Streamable HTTP 地址是 `${mcpPath}/mcp` |
| `host`                | `string`                                                                                           | `'localhost'`            | 打印 MCP 地址和写入 MCP 客户端配置时使用的 host                                             |
| `printUrl`            | `boolean`                                                                                          | `true`                   | 是否在 Vite 启动日志中打印 MCP SSE 地址                                                     |
| `mcpClients`          | `{ cursor?: boolean; codex?: boolean; claudeCode?: boolean; trae?: boolean; serverName?: string }` | 自动探测                 | 是否写入 Cursor、Codex、Claude Code、Trae 的项目级 MCP 配置；默认只处理项目中已有入口，显式 `true` 强制创建 |
| `updateCursorMcpJson` | `boolean \| { enabled: boolean; serverName?: string }`                                             | 自动探测                 | 兼容旧配置；默认只在 `.cursor` 已存在时写入，建议新项目使用 `mcpClients`                           |
| `skill`               | `{ autoConfig?: boolean }`                                                                         | `{ autoConfig: true }`   | 是否在检测到 Codex、Claude Code、Cursor 项目入口时自动复制包内 AI 使用指南                    |
| `appendTo`            | `string \| RegExp`                                                                                 | `undefined`              | 非 HTML 入口注入点。配置后会在匹配入口模块前追加 runtime import                             |
| `screenshot`          | `ScreenshotOptions`                                                                                | CDP 优先，snapdom 降级   | 页面截图配置，控制真截图、DOM 降级截图、体积上限和 snapdom 扩展                             |
| `screenshot.type`     | `'path' \| 'base64'`                                                                               | `'path'`                 | 项目级控制截图返回文件路径还是 base64 数据                                                  |
| `screenshot.saveDir`  | `string`                                                                                           | `'.vite-mcp/screenshot'` | 截图保存目录；相对路径按 Vite 项目根目录解析                                                |
| `performance`         | `PerformanceOptions`                                                                               | `auto + hook 兜底`      | 性能诊断配置，控制采样时长、保存目录和 runtime / CDP 采集边界                              |

`appendTo` 适合 playground、框架包装入口、或不希望通过 `transformIndexHtml` 注入的场景：

```ts
vueMcpNext({
  appendTo: 'src/main.ts'
})
```

### Runtime 配置

| 配置                         | 类型                        | 默认值   | 说明                                                  |
| ---------------------------- | --------------------------- | -------- | ----------------------------------------------------- |
| `runtime.mode`               | `'auto' \| 'cdp' \| 'hook'` | `'auto'` | DOM、Console、Evaluate 等通用 DevTools 能力的通道策略 |
| `runtime.evaluate.enabled`   | `boolean`                   | `false`  | 是否允许 MCP 客户端执行页面表达式                     |
| `runtime.evaluate.timeoutMs` | `number`                    | `3000`   | Hook fallback 执行表达式的超时时间                    |

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
;(console.warn('mcp log', { ok: true }), 'logged')

// 不可以
console.warn('mcp log', { ok: true })
;('logged')
```

如果需要完整 DevTools Console 行为，建议配置 CDP。

### 性能诊断

`performance.mode` 默认是 `auto`。插件会优先使用 CDP，拿到更完整的 CPU profile 和 heap snapshot；当没有调试权限时，会回退到页面 Hook，只采集浏览器公开可见的信号，例如长任务、事件循环延迟、内存趋势和运行时错误堆栈。

`performance.mode` 的含义如下：

- `auto`：能连上 CDP 就用 CDP，否则走 Hook
- `cdp`：强制使用 CDP，连不上就返回明确错误
- `hook`：只走 Hook，不尝试 CDP
- `off`：关闭性能诊断

可用工具如下：

- `record_performance`：一次性采样，适合快速判断页面是否卡顿
- `start_performance_recording` / `stop_performance_recording`：开始和结束一段录制，适合先观察现场再收口
- `get_performance_report`：读取最近缓存的报告和活动会话
- `take_heap_snapshot`：只支持 CDP，直接返回服务端保存的 heap snapshot 路径

示例：

```text
record_performance
```

```text
start_performance_recording
stop_performance_recording
```

原始 CPU profile 和 heap snapshot 不会直接塞进 MCP 响应，而是由服务端写入 `performance.saveDir`，默认是 `.vite-mcp/performance`。工具返回的是摘要和文件路径，方便后续离线分析。

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

| 配置                   | 类型               | 默认值      | 说明                                                            |
| ---------------------- | ------------------ | ----------- | --------------------------------------------------------------- |
| `cdp.browserUrl`       | `string`           | `undefined` | Chrome remote debugging HTTP 地址，例如 `http://127.0.0.1:9222` |
| `cdp.wsEndpoint`       | `string`           | `undefined` | 已知页面 WebSocket endpoint。配置后会直接连接该 endpoint        |
| `cdp.targetUrlPattern` | `string \| RegExp` | `undefined` | 多 tab 或多页面时用于匹配目标页面 URL                           |

启动 Chrome remote debugging 的示例：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/vite-plugin-vue-mcp-next-chrome
```

也可以连接 Electron、ZTools 等已经暴露 CDP 的应用。例如调试中已验证 `http://127.0.0.1:9222/json/list` 能返回 ZTools 页面 target，MCP 工具可直接对这些 `cdp:*` 页面执行 DOM、Evaluate、Console、Network 调试。

安全注意：CDP remote debugging 具备强页面控制能力，只应在本机开发环境使用，不要暴露到公网或共享网络。

### Network 配置

| 配置                          | 类型                                 | 默认值                                      | 说明                       |
| ----------------------------- | ------------------------------------ | ------------------------------------------- | -------------------------- |
| `network.mode`                | `'auto' \| 'cdp' \| 'hook' \| 'off'` | `'auto'`                                    | Network 采集通道策略       |
| `network.maxRecords`          | `number`                             | `500`                                       | 最大缓存请求数             |
| `network.captureRequestBody`  | `boolean`                            | `true`                                      | 是否采集请求体             |
| `network.captureResponseBody` | `boolean`                            | `true`                                      | 是否采集响应体             |
| `network.maxBodySize`         | `number`                             | `100_000`                                   | 请求体和响应体最大采集长度 |
| `network.maskHeaders`         | `string[]`                           | `['authorization', 'cookie', 'set-cookie']` | 需要脱敏的 header 名称     |

Hook Network 覆盖 `fetch` 和 `XMLHttpRequest`。CDP Network 更接近 Chrome DevTools Network 面板，可以覆盖更多请求生命周期信息。

### DOM 与 Console 配置

| 配置                 | 类型     | 默认值 | 说明                     |
| -------------------- | -------- | ------ | ------------------------ |
| `dom.maxDepth`       | `number` | `8`    | DOM tree 最大输出深度    |
| `dom.maxNodes`       | `number` | `2000` | DOM tree 最大节点数      |
| `dom.maxTextLength`  | `number` | `300`  | 单个文本节点最大长度     |
| `console.maxRecords` | `number` | `1000` | Console 日志最大缓存条数 |

DOM 默认跳过 `script`、`style`、`noscript`，并隐藏 password input 的值。这样做是为了避免 MCP 上下文被大页面或敏感字段污染。

### Screenshot 配置

`take_screenshot` 默认优先使用 CDP 真截图；没有 CDP 时，`prefer: 'auto'` 会降级到 `snapdom` DOM 截图。`source: 'snapdom'` 表示 DOM 渲染截图，不等同于浏览器真实像素截图。

`@zumer/snapdom` 是可选 peer dependency。只有在没有 CDP、并且需要使用 runtime DOM 截图降级时才需要安装：

```bash
pnpm add -D @zumer/snapdom
```

如果未安装该依赖，`take_screenshot` 会返回结构化错误，提示安装命令；插件不会自动修改项目依赖。

```ts
vueMcpNext({
  screenshot: {
    type: 'path',
    saveDir: '.vite-mcp/screenshot',
    prefer: 'auto',
    maxBytes: 5 * 1024 * 1024,
    snapdom: {
      options: {
        scale: 2,
        useProxy: 'http://localhost:3000/proxy?url=',
        exclude: ['[data-no-screenshot]']
      },
      plugins: [
        '/src/screenshot/snapdom-watermark.ts',
        {
          path: '@/screenshot/snapdom-mask-sensitive',
          exportName: 'createMaskPlugin',
          options: {
            selectors: ['.token', '.password']
          }
        }
      ],
      filter: '/src/screenshot/snapdom-filter.ts',
      fallbackURL: '/src/screenshot/snapdom-fallback-url.ts'
    }
  }
})
```

默认情况下，截图会保存到项目根目录下 `.vite-mcp/screenshot`，MCP 返回文件路径：

```json
{
  "source": "cdp",
  "target": "viewport",
  "format": "png",
  "mimeType": "image/png",
  "width": 1280,
  "height": 720,
  "byteLength": 120394,
  "path": "/Users/me/app/.vite-mcp/screenshot/2026-05-17T10-30-22-123Z-cdp-viewport-a1b2c3d4.png",
  "relativePath": ".vite-mcp/screenshot/2026-05-17T10-30-22-123Z-cdp-viewport-a1b2c3d4.png"
}
```

如需保持旧的 base64 返回方式，可以在项目配置中设置：

```ts
vueMcpNext({
  screenshot: {
    type: 'base64'
  }
})
```

CDP 的 `Page.captureScreenshot` 只返回 base64 图片数据，不能直接指定保存目录；本插件会在 Vite dev server 侧按 `screenshot.saveDir` 自行写入文件。

`screenshot.snapdom.options` 继承 `snapdom` 的可序列化 options，常用字段包括 `scale`、`quality`、`cache`、`embedFonts`、`localFonts`、`useProxy`、`exclude`。`useProxy` 适合处理跨域图片或字体资源。

`plugins`、`filter`、`fallbackURL` 必须使用 Vite import 路径。不要在 `vite.config.ts` 中直接传函数，因为配置运行在 Node 侧，而截图执行发生在浏览器 runtime。

```ts
// /src/screenshot/snapdom-mask-sensitive.ts
export function createMaskPlugin(options: { selectors: string[] }) {
  return {
    name: 'mask-sensitive',
    afterClone(context: { clone: Document }) {
      for (const selector of options.selectors) {
        context.clone.querySelectorAll(selector).forEach((node) => {
          node.textContent = '******'
        })
      }
    }
  }
}
```

`snapdom` 降级截图可能受跨域图片、跨域 iframe、video、WebGL/canvas 污染、复杂 CSS 和字体加载时序影响。需要最高准确度时，请配置 CDP。

`vite-plugin-vue-devtools` 可以和本插件共存，但不是必需依赖。本插件直接使用 `@vue/devtools-kit` / `@vue/devtools-core` 提供 Vue Runtime Bridge。

## MCP 工具清单

### 页面工具

| 工具             | 输入                      | 输出                            | 说明                                                              |
| ---------------- | ------------------------- | ------------------------------- | ----------------------------------------------------------------- |
| `list_pages`     | `includeDisconnected?`    | `entries`、`pages`、`cdpError?` | 返回 Vite HTML 入口、runtime 页面和 CDP target                    |
| `reload_page`    | `pageId?`、`ignoreCache?` | `ok`、`source`、`ignoreCache?`  | 刷新目标页面；CDP 可用时使用无缓存刷新，Runtime Hook 只能普通刷新 |

`list_pages` 的 `pages` 中可能出现两类页面：

- `runtime-*`：由页面注入 runtime bridge 后连接
- `cdp:*`：由 CDP `/json/list` 发现

runtime 页面会为同一个浏览器标签页维护稳定 client id。刷新或 HMR 重连后，新 `pageId` 会成为可操作目标，旧 `pageId` 会被标记为 `connected: false` 并在默认 `list_pages` 结果中隐藏；需要排查页面生命周期时可传 `includeDisconnected: true` 查看断开记录。断开的 runtime 记录保留 5 分钟后会被清理，同 URL 的不同标签页仍会保留为不同目标。

`reload_page` 默认在 CDP 路径使用 `ignoreCache: true`，并等待 CDP `loadEventFired` 后返回，适合在测试前绕过浏览器 HTTP 缓存重新加载页面。未配置 CDP 时会退回 Runtime Hook，通过 `window.location.reload()` 触发普通刷新，并等待新的 runtime 页面重新接入；这条回退路径不能保证绕过 HTTP cache，也不会清理 `localStorage`、`sessionStorage`、`IndexedDB`、`CacheStorage` 或 Service Worker 缓存。

### DOM 工具

| 工具              | 输入                                                    | 输出                                                                     | 说明                                                 |
| ----------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `get_dom_tree`    | `pageId?`、`maxDepth?`、`maxNodes?`                     | `source`、`snapshot`                                                     | 获取裁剪后的 DOM tree                                |
| `query_dom`       | `pageId?`、`selector`、`limit?`                         | `source`、`nodes`                                                        | 按 selector 查询元素摘要                             |
| `take_screenshot` | `pageId?`、`target?`、`selector?`、`format?`、`prefer?` | `path`/`relativePath` 或 `data`、`source`、`mimeType`、`width`、`height` | 页面截图，CDP 优先，snapdom 降级，默认保存到项目目录 |

CDP 可用时 DOM 工具输出 `source: 'cdp'`，否则使用 Runtime Hook 输出 `source: 'hook'`。截图工具输出 `source: 'cdp' | 'snapdom'`。

### Console 工具

| 工具                 | 输入                          | 输出   | 说明              |
| -------------------- | ----------------------------- | ------ | ----------------- |
| `get_console_logs`   | `pageId?`、`level?`、`limit?` | `logs` | 获取 Console 日志 |
| `clear_console_logs` | `pageId?`                     | `ok`   | 清空缓存日志      |

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

| 工具              | 输入                                     | 输出                     | 说明             |
| ----------------- | ---------------------------------------- | ------------------------ | ---------------- |
| `evaluate_script` | `pageId?`、`expression`、`awaitPromise?` | `source`、`value/result` | 执行控制台表达式 |

该工具默认关闭，必须配置 `runtime.evaluate.enabled: true`。CDP 可用时使用 `Runtime.evaluate`，否则使用 Runtime Hook fallback。

### Network 工具

| 工具                         | 输入                                                      | 输出       | 说明             |
| ---------------------------- | --------------------------------------------------------- | ---------- | ---------------- |
| `get_network_requests`       | `pageId?`、`urlContains?`、`method?`、`status?`、`limit?` | `requests` | 获取请求列表     |
| `get_network_request_detail` | `id`                                                      | `request`  | 获取单条请求详情 |
| `clear_network_requests`     | `pageId?`                                                 | `ok`       | 清空请求缓存     |

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

| 工具                   | 输入                                                     | 输出   | 说明                      |
| ---------------------- | -------------------------------------------------------- | ------ | ------------------------- |
| `get_component_tree`   | `pageId?`                                                | `data` | 获取 Vue component tree   |
| `get_component_state`  | `pageId?`、`componentName`                               | `data` | 获取组件状态              |
| `edit_component_state` | `pageId?`、`componentName`、`path`、`value`、`valueType` | `ok`   | 修改组件状态              |
| `highlight_component`  | `pageId?`、`componentName`                               | `ok`   | 高亮组件                  |
| `get_router_info`      | `pageId?`                                                | `data` | 获取 Vue Router 信息      |
| `get_pinia_tree`       | `pageId?`                                                | `data` | 获取 Pinia inspector tree |
| `get_pinia_state`      | `pageId?`、`storeName`                                   | `data` | 获取 Pinia store state    |

Vue 组件、Router、Pinia 是应用层语义，固定走 Vue Runtime Bridge，不用 CDP 替代。

### 浏览器存储

浏览器存储工具组面向调试当前页面的运行时数据。`localStorage`、`sessionStorage` 和 `IndexedDB` 只作用于当前选中页面同源，避免跨站误操作。Cookie 在无 CDP 时通过 `document.cookie` 访问当前页面可见的同源条目；配置 CDP 后可查询浏览器级 Cookie，并能读取 `HttpOnly` 条目，但删除和清空时会跳过 `HttpOnly` 并返回跳过数量。

| 资源 | Runtime Hook | CDP |
| --- | --- | --- |
| `localStorage` | 读 / 写 / 删 | 读 / 写 / 删 |
| `sessionStorage` | 读 / 写 / 删 | 读 / 写 / 删 |
| `IndexedDB` | 同源库和记录操作 | 同源库和记录操作 |
| `Cookie` | 查询 / 写入 / 删除当前页面可见条目 | 查询 / 写入 / 删除非 `HttpOnly` 条目，`HttpOnly` 仅可查询 |

相关 MCP 工具：

- `list_storage`：列出当前页面同源存储和 Cookie；有 CDP 时补充浏览器级 Cookie
- `get_storage_item`：读取指定 key、IndexedDB 记录或 Cookie
- `set_storage_item`：写入 Web Storage、IndexedDB 记录或 Cookie
- `delete_storage_item`：删除 Web Storage、IndexedDB 记录或 Cookie；`HttpOnly` Cookie 仅在 CDP 下可见且删除时会跳过
- `clear_storage`：清空指定范围，Cookie 清空会跳过 `HttpOnly`

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
- `tools/list` 可枚举 17 个 MCP 工具
- `list_pages` 可返回 Vite entry、runtime 页面和 CDP target
- Runtime Hook 可读取 DOM、Console、Network
- Runtime Hook 可执行已授权表达式
- Vue Runtime Bridge 可读取组件树、Router、Pinia tree/state
- CDP 可读取 DOM tree、selector 查询、Evaluate、Console、Network
- CDP 可执行真截图，CDP 不可用时可使用 snapdom DOM 截图降级
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

| 脚本                   | 说明                               |
| ---------------------- | ---------------------------------- |
| `pnpm run build`       | 构建 ESM、CJS 和类型声明           |
| `pnpm run dev`         | 以 watch 模式构建                  |
| `pnpm run typecheck`   | 执行 TypeScript 静态检查           |
| `pnpm run lint`        | 执行 ESLint 检查                   |
| `pnpm run test`        | 执行 Vitest 测试                   |
| `pnpm run check`       | 串行执行类型检查、Lint、测试和构建 |
| `pnpm run play`        | 启动本地 playground                |
| `pnpm run inspect:mcp` | 启动 MCP Inspector                 |

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


# 友情链接

- [LINUX DO - 新的理想型社区](https://linux.do/)
