# 让 AI 真正看懂你的 Vue 页面：vite-plugin-vue-mcp-next 上手指南

很多前端开发者已经开始用 Cursor、Codex、Claude Code、Trae 这类 AI 编程工具写代码。

但在调试 Vue 页面时，AI 经常只看得到源码，看不到真实运行中的页面。它不知道当前 DOM 长什么样，不知道 Console 里有没有报错，不知道接口请求参数和响应值，也不知道 Vue 组件树、Router、Pinia 里的实际状态。

于是调试过程经常变成这样：

- 你复制一段报错给 AI
- AI 根据源码猜一个原因
- 你再复制一段接口响应
- AI 再猜一次
- 最后你还要不断补充页面状态、组件状态和路由信息

`vite-plugin-vue-mcp-next` 想解决的就是这个问题：让 AI 可以通过 MCP 直接读取本地 Vue 开发页面的运行时信息，把“靠人搬运上下文”的调试方式，变成“AI 自己查看现场”。

## 这个插件做什么

`vite-plugin-vue-mcp-next` 是一个面向 Vite + Vue 开发态的 Runtime DevTools MCP 插件。

MCP（Model Context Protocol，本地工具调用协议）可以理解为 AI 客户端调用本地工具的一套协议。这个插件会在 Vite dev server 中挂载 MCP 服务，并向浏览器页面注入 runtime bridge，让 AI 客户端能够读取前端页面的真实运行状态。

接入后，AI 可以通过 MCP 工具查看这些信息：

| 能力 | 能解决什么问题 |
| --- | --- |
| 页面列表 | 多页面、多 tab 场景下定位要调试的页面 |
| 页面刷新 | 测试前刷新页面，CDP 可用时支持无缓存刷新 |
| DOM tree | 查看页面实际渲染结构，判断元素是否存在、文案是否正确 |
| DOM selector 查询 | 按选择器定位按钮、表单、列表、弹窗等具体元素 |
| 页面截图 | 获取当前页面视觉结果，用于页面巡检和问题复现 |
| Console 日志 | 查看 `log`、`warn`、`error` 等运行时日志 |
| Network 请求 | 查看接口 URL、请求参数、请求体、响应状态、响应值 |
| Vue 组件树 | 读取 Vue component tree，定位组件层级 |
| Vue 组件状态 | 查看和编辑组件运行时状态 |
| Router 信息 | 查看当前路由、路由表和页面跳转状态 |
| Pinia 状态 | 查看 Pinia store tree 和 store state |
| Evaluate 执行 | 显式开启后执行页面表达式，辅助调试验证 |

它不是生产监控插件，也不是埋点 SDK。它只面向本地开发环境，生产构建默认不包含调试采集逻辑。

## 核心设计边界

插件内部有三条能力通道：

| 通道 | 适合能力 | 说明 |
| --- | --- | --- |
| CDP | DOM、Console、Evaluate、Network、Screenshot | 配置 Chrome DevTools Protocol 后优先使用，结果更接近浏览器 DevTools |
| Runtime Hook | DOM、Console、Evaluate、Network | 没有 CDP 时的零配置兜底，运行在页面 runtime 中 |
| Vue Runtime Bridge | Vue component、Router、Pinia | Vue 应用语义必须走 Vue DevTools runtime API，不用 CDP DOM 替代 |

这几个边界很重要：

- DOM、Console、Evaluate、Network、Screenshot 在 CDP 可用时优先走 CDP
- CDP 不可用时，DOM、Console、Network 回退到 Runtime Hook，截图回退到 `snapdom`
- Vue component、Router、Pinia 固定走 Vue Runtime Bridge
- `evaluate_script` 默认关闭，必须通过 `runtime.evaluate.enabled: true` 显式开启
- 截图默认保存为项目内文件路径，避免大段 base64 挤占 AI 上下文

## 快速上手

在 Vue + Vite 项目中安装：

```bash
pnpm add -D @xiaou66/vite-plugin-vue-mcp-next
```

在 Vite 配置中加入插件：

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueMcpNext from '@xiaou66/vite-plugin-vue-mcp-next'

export default defineConfig({
  plugins: [vue(), vueMcpNext()]
})
```

启动 Vite dev server 后，插件默认暴露两个 MCP 入口：

```text
SSE: http://localhost:<vite-port>/__mcp/sse
Streamable HTTP: http://localhost:<vite-port>/__mcp/mcp
```

实际端口以启动日志中的 MCP 地址为准。

## 自动配置 MCP 客户端

插件会按项目中已经存在的客户端入口自动写入项目级 MCP 配置，服务名默认是 `vite-mcp-next`。

| 客户端 | 自动探测入口 | 自动配置文件 | 默认端点 |
| --- | --- | --- | --- |
| Cursor | `.cursor/` | `.cursor/mcp.json` | SSE |
| Codex | `.codex/` | `.codex/config.toml` | Streamable HTTP |
| Claude Code | `.mcp.json` | `.mcp.json` | SSE |
| Trae | `.trae/` | `.trae/mcp.json` | SSE |

默认行为是“项目里已经有哪个客户端入口，就只配置哪个客户端”。如果项目中没有对应入口，插件不会主动创建目录或配置文件。需要强制创建时，可以在 `mcpClients` 中显式设置对应客户端为 `true`；需要禁用时设置为 `false`。

如果你已经配置了历史默认名 `vue-mcp-next`，插件会把它迁移为 `vite-mcp-next`，并保留原有配置内容。这样可以避免一个项目里同时出现新旧两份 MCP server 配置。

手动配置 JSON 客户端时，可以使用：

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

`5173` 只是示例端口。实际使用时请替换成 Vite 启动日志里打印的 MCP 地址。

## 自动安装 AI 使用指南

只把 MCP 地址配置进 AI 客户端还不够。AI 还需要知道什么时候应该使用这些工具、先调用哪个工具、哪些工具有副作用。

因此插件随 npm 包发布了一份通用 Skill 文件：

```text
skills/vite-mcp-next/SKILL.md
```

Vite dev server 启动时，插件会在检测到项目中存在对应 AI 工具入口后，把这份指南复制到项目级目录：

| 客户端 | 探测入口 | 自动复制目标 |
| --- | --- | --- |
| Codex | `.codex/` | `.codex/skills/vite-mcp-next/SKILL.md` |
| Claude Code | `.claude/` | `.claude/skills/vite-mcp-next/SKILL.md` |
| Cursor | `.cursor/` | `.cursor/rules/vite-mcp-next.mdc` |
| Trae | `.trae/` | 当前只自动写 MCP 配置，不自动写 rule |

这份指南会告诉 AI：

1. 先调用 `list_pages` 确认页面、runtime 和 CDP target
2. 页面结构问题用 `get_dom_tree` 或 `query_dom`
3. 视觉验证用 `take_screenshot`
4. 报错排查用 `get_console_logs`
5. 接口排查用 `get_network_requests` 和 `get_network_request_detail`
6. Vue 语义问题用组件、Router、Pinia 工具
7. `evaluate_script` 和 `edit_component_state` 有副作用，需要谨慎使用

如果不希望插件自动复制这些指南，可以关闭：

```ts
vueMcpNext({
  skill: {
    autoConfig: false
  }
})
```

自动复制只会更新带插件生成标记的文件；如果目标文件已经存在但不是插件生成的内容，插件会跳过，避免覆盖用户手写规则。

## 推荐调试流程

### 1. 先确认页面目标

调用：

```text
list_pages
```

你会看到 Vite HTML entry、已连接的 `runtime-*` 页面，以及可选的 `cdp:*` target。多页面或多 tab 场景下，后续工具最好显式传入 `pageId`。

如果需要刷新页面，可以调用：

```text
reload_page
```

配置 CDP 时，`reload_page` 默认使用 `ignoreCache: true` 并等待页面 load；没有 CDP 时，会退回 Runtime Hook 普通刷新，并等待新的 runtime 页面接入。

### 2. 查询页面元素

调用：

```text
query_dom
```

例如 selector 使用：

```text
#app
```

或者使用业务选择器：

```text
[data-testid="submit-button"]
```

需要看页面整体结构时，可以调用：

```text
get_dom_tree
```

这些工具能让 AI 基于真实 DOM 判断元素是否存在、文本是否正确、弹窗是否挂载，而不是只根据源码猜测。

### 3. 查看 Console 日志

在页面触发操作后调用：

```text
get_console_logs
```

如果旧日志干扰判断，可以先清空：

```text
clear_console_logs
```

Console 工具适合排查前端报错、组件生命周期日志、接口异常日志等问题。

### 4. 查看接口请求和响应

触发一次接口请求后调用：

```text
get_network_requests
```

需要查看某条请求的请求体、响应体和 header 时，继续调用：

```text
get_network_request_detail
```

插件默认会对 `authorization`、`cookie`、`set-cookie` 等敏感 header 做脱敏处理。调试完成后，可以用：

```text
clear_network_requests
```

清理旧请求记录。

### 5. 查看 Vue 应用状态

如果要排查组件层级或组件状态，可以调用：

```text
get_component_tree
get_component_state
```

如果需要临时修改运行时组件状态，可以调用：

```text
edit_component_state
```

这个工具会改变页面运行时状态，只适合用户明确要求“调整状态看看效果”的场景。

如果你的项目使用 Vue Router 或 Pinia，可以调用：

```text
get_router_info
get_pinia_tree
get_pinia_state
```

这些能力走 Vue Runtime Bridge，能看到比 DOM 更接近 Vue 应用语义的状态。

### 6. 获取页面截图

插件提供：

```text
take_screenshot
```

默认情况下，截图会保存到项目根目录下：

```text
.vite-mcp/screenshot
```

MCP 返回结果包含 `path`、`relativePath`、`source`、尺寸、格式和字节数。

截图来源有两种：

- `source: "cdp"`：浏览器真实截图，推荐配置 CDP 后使用
- `source: "snapdom"`：DOM 渲染截图，是 CDP 不可用时的降级方案

`snapdom` 截图不等同于浏览器真实像素截图。跨域图片、跨域 iframe、video、WebGL/canvas、复杂 CSS 和字体加载时序都可能影响结果。

如果没有 CDP，但你希望使用 runtime DOM 截图降级，需要安装可选依赖：

```bash
pnpm add -D @zumer/snapdom
```

如果希望保持旧的 base64 返回方式，可以配置：

```ts
vueMcpNext({
  screenshot: {
    type: 'base64'
  }
})
```

## 配置 CDP

如果你希望获得更接近 Chrome DevTools 的 DOM、Console、Network、Evaluate 和截图能力，可以启动 Chrome remote debugging：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/vite-plugin-vue-mcp-next-chrome
```

然后在插件中配置：

```ts
vueMcpNext({
  cdp: {
    browserUrl: 'http://127.0.0.1:9222',
    targetUrlPattern: 'localhost:5173'
  }
})
```

也可以连接 Electron、ZTools 等已经暴露 CDP 的应用。插件只连接已有 CDP endpoint，不负责启动 Chrome 或管理浏览器进程。

CDP remote debugging 具备强页面控制能力，只应该在本机开发环境使用，不要暴露到公网或共享网络。

## 开启表达式执行

`evaluate_script` 默认关闭，因为它可以读取和修改页面状态。

如果你明确需要让 AI 执行页面表达式，可以手动开启：

```ts
vueMcpNext({
  runtime: {
    evaluate: {
      enabled: true
    }
  }
})
```

CDP 可用时，`evaluate_script` 使用 Chrome DevTools 的 `Runtime.evaluate`。没有 CDP 时，它会走 Runtime Hook fallback。

需要注意：Hook fallback 当前只支持表达式，不支持完整语句块。如果需要完整 DevTools Console 行为，建议配置 CDP。

## 完整配置示例

大多数项目只需要：

```ts
vueMcpNext()
```

如果团队希望明确控制采集范围、截图路径、客户端配置和 CDP，可以使用：

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueMcpNext from '@xiaou66/vite-plugin-vue-mcp-next'

export default defineConfig({
  plugins: [
    vue(),
    vueMcpNext({
      mcpPath: '/__mcp',
      host: 'localhost',
      printUrl: true,
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
        maxBytes: 5 * 1024 * 1024
      }
    })
  ]
})
```

## 边界和注意事项

这个插件的定位很明确：服务本地开发态调试。

使用时需要注意这些边界：

- 生产构建默认不启用调试采集
- Hook Network 主要覆盖 `fetch` 和 `XMLHttpRequest`
- 最接近 Chrome DevTools Network 面板的行为需要配置 CDP
- Vue 组件、Router、Pinia 能力固定走 Vue Runtime Bridge，不用 CDP 替代
- `evaluate_script` 默认关闭，需要显式开启
- `edit_component_state` 会修改运行时组件状态，只应在明确需要时使用
- DOM、日志、Network 都有默认输出上限，避免大页面或大响应污染 AI 上下文
- 截图默认返回路径；如果返回 base64，大图可能明显占用 MCP 客户端上下文
- Electron/Tauri 场景主要面向渲染页面调试，不替代主进程、Rust 后端或原生能力调试
- Tauri 的 CDP 支持取决于平台 WebView 和应用调试配置，不能按 Chrome/Electron 场景无条件假设
- 插件只连接已有 CDP endpoint，不负责启动 Chrome

这些限制不是功能缺失，而是为了让插件保持本地开发工具的边界：可控、可验证、不默认暴露高风险能力。

## 适合哪些场景

这个插件适合这些工作流：

- 页面改动后，让 AI 用 DOM 和截图做快速巡检
- 接口联调时，让 AI 直接看请求参数和响应值
- 页面报错时，让 AI 读取 Console 日志和运行时状态
- 组件状态异常时，让 AI 检查 Vue component tree、Router 和 Pinia
- 多页面、多 tab 或桌面壳页面调试时，让 AI 先用 `list_pages` 定位目标
- 团队希望把 AI 辅助调试接入日常本地开发流程
- Electron 和 Tauri 配置

典型流程是：

1. 开发者启动 Vite dev server
2. AI 客户端连接插件暴露的 MCP 地址
3. AI 先调用 `list_pages` 定位页面
4. AI 按问题类型读取 DOM、截图、Console、Network 或 Vue 状态
5. 开发者根据真实运行态证据确认修改方向

核心价值不是“替你写一个组件”，而是让 AI 拥有前端调试时最缺的现场信息。

## 总结

`vite-plugin-vue-mcp-next` 的核心价值，是把 Vue 本地开发页面变成 AI 可检查、可理解、可辅助调试的运行现场。

它让 AI 不只是在代码层面给建议，还能基于真实 DOM、Console、Network、截图、Vue 组件树、Router 和 Pinia 状态做判断。

如果你的团队正在尝试用 AI 提升前端开发效率，尤其是希望让 AI 参与页面巡检、接口联调和 Bug 定位，这个插件可以作为 Vue 项目的 AI 调试入口。

安装插件，启动 Vite，把 MCP 地址接入你的 AI 客户端，然后让 AI 自己去看页面现场。
