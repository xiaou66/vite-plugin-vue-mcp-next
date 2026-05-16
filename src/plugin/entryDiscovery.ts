import fs from 'node:fs'
import path from 'node:path'
import type { ViteDevServer } from 'vite'
import { normalizePath } from 'vite'

/**
 * Vite 多入口页面描述。
 *
 * MCP 需要告诉 AI 当前项目有哪些可访问页面入口，而不仅仅是已经打开的浏览器页面。
 */
export interface VitePageEntry {
  /** Vite root 下的入口文件路径，用于解释页面来源。 */
  readonly file: string
  /** 浏览器访问路径，用于 MCP `list_pages` 输出。 */
  readonly pathname: string
}

/**
 * 发现 Vite HTML 页面入口。
 *
 * 多页 Vite 项目通常有多个 HTML 文件，该函数用轻量文件扫描补充已连接页面之外的入口列表。
 */
export function discoverHtmlEntries(server: ViteDevServer): VitePageEntry[] {
  const root = server.config.root
  const entries: VitePageEntry[] = []

  walkHtmlEntries(root, root, entries)

  return entries
}

/**
 * 递归扫描 HTML 入口。
 *
 * 扫描逻辑单独拆分，是为了让入口发现保持简单，同时避免主函数承担目录遍历细节。
 */
function walkHtmlEntries(
  root: string,
  dir: string,
  entries: VitePageEntry[]
): void {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.name === 'node_modules' || item.name.startsWith('.')) {
      continue
    }

    const fullPath = path.join(dir, item.name)

    if (item.isDirectory()) {
      walkHtmlEntries(root, fullPath, entries)
      continue
    }

    if (!item.isFile() || !item.name.endsWith('.html')) {
      continue
    }

    const relative = normalizePath(path.relative(root, fullPath))
    entries.push({
      file: relative,
      pathname: relative === 'index.html' ? '/' : `/${relative}`
    })
  }
}
