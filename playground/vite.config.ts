import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueMcpNext from '../src'

export default defineConfig({
  resolve: {
    alias: {
      '@xiaou66/vite-plugin-vue-mcp-next/runtime/client':
        '/src/runtime/client.ts',
      '@xiaou66/vite-plugin-vue-mcp-next': '/src/index.ts'
    }
  },
  server: {
    port: 3456
  },
  plugins: [
    {
      name: 'playground-api',
      configureServer(server) {
        server.middlewares.use('/api/demo', (req, res) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true, url: req.url }))
        })
      }
    },
    vue(),
    vueMcpNext({
      appendTo: 'src/main.ts',
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
  ]
})
