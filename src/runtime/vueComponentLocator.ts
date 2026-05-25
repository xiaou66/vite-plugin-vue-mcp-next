/**
 * Vue DOM 到组件归属定位。
 *
 * Vue 没有公开稳定的 DOM 到组件实例 API；这里仅在开发态读取受保护的 runtime 元数据，
 * 任意字段缺失都返回空结果，避免影响 DOM 上下文查询主链路。
 */

/**
 * 定位到的 Vue 组件归属。
 *
 * 项目源码组件返回 `source`，第三方组件只返回包名和入口文件，避免引导 AI 修改 `node_modules`。
 */
export interface LocatedVueComponent {
  readonly name?: string
  readonly source?: {
    readonly file: string
  }
  readonly packageLocation?: {
    readonly packageName: string
    readonly entryFile: string
  }
}

interface VueRuntimeComponent {
  readonly type?: {
    readonly name?: string
    readonly __name?: string
    readonly displayName?: string
    readonly __file?: string
  }
}

/**
 * 从 DOM 元素向上查找 Vue 组件归属。
 *
 * 查询失败不是错误，因为普通 DOM、Teleport 或第三方渲染节点都可能没有 Vue 私有字段。
 */
export function locateVueComponentForElement(
  element: Element,
  root: string
): LocatedVueComponent | undefined {
  const component = findNearestComponent(element)

  if (!component) {
    return undefined
  }

  const file = getComponentFile(component)
  const name = getComponentName(component)

  if (!file) {
    return { name }
  }

  const packageLocation = parseNodeModulesFile(file)

  if (packageLocation) {
    return {
      name,
      source: undefined,
      packageLocation
    }
  }

  return {
    name,
    source: {
      file: createProjectRelativePath(root, file)
    },
    packageLocation: undefined
  }
}

/**
 * 沿父元素查找最近的 Vue 私有组件引用。
 *
 * Vue 组件根节点和内部子节点都有可能挂载该字段，向上查找可以提高命中率。
 */
function findNearestComponent(element: Element): VueRuntimeComponent | undefined {
  let current: Element | null = element

  while (current) {
    const component = (current as { __vueParentComponent?: unknown })
      .__vueParentComponent

    if (isVueRuntimeComponent(component)) {
      return component
    }

    current = current.parentElement
  }

  return undefined
}

/**
 * 获取组件展示名。
 *
 * 不同构建链路会写入不同字段，因此按稳定性和可读性依次尝试。
 */
function getComponentName(component: VueRuntimeComponent): string | undefined {
  return (
    component.type?.name ??
    component.type?.__name ??
    component.type?.displayName
  )
}

/**
 * 获取组件源文件。
 *
 * `__file` 仅在开发态可用，缺失时不能阻断上下文返回。
 */
function getComponentFile(component: VueRuntimeComponent): string | undefined {
  return component.type?.__file
}

/**
 * 解析 node_modules 中的组件文件。
 *
 * scope 包需要保留两段包名，剩余路径作为入口文件返回。
 */
function parseNodeModulesFile(
  file: string
): LocatedVueComponent['packageLocation'] | undefined {
  const normalized = normalizePath(file)
  const marker = '/node_modules/'
  const index = normalized.lastIndexOf(marker)

  if (index < 0) {
    return undefined
  }

  const parts = normalized.slice(index + marker.length).split('/').filter(Boolean)
  const scoped = parts[0]?.startsWith('@')
  const packageName = scoped ? parts.slice(0, 2).join('/') : parts[0]
  const entryFile = parts.slice(scoped ? 2 : 1).join('/')

  if (!packageName || !entryFile) {
    return undefined
  }

  return {
    packageName,
    entryFile
  }
}

/**
 * 统一路径分隔符。
 *
 * 返回给 AI 的路径需要跨平台稳定，避免 Windows 反斜杠影响 elementId 解析。
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * 生成项目相对路径。
 *
 * 该文件会进入浏览器 runtime bundle，不能依赖 `node:path`；
 * 这里只处理绝对路径前缀裁剪，无法归属到项目 root 时保留去掉首斜杠的可读路径。
 */
function createProjectRelativePath(root: string, file: string): string {
  const normalizedRoot = normalizePath(root).replace(/\/$/, '')
  const normalizedFile = normalizePath(file)
  const prefix = `${normalizedRoot}/`

  if (normalizedFile.startsWith(prefix)) {
    return normalizedFile.slice(prefix.length)
  }

  return normalizedFile.replace(/^\//, '')
}

/**
 * 收窄 Vue 私有组件对象。
 *
 * 只验证本模块真正读取的字段，减少对 Vue runtime 内部结构的绑定。
 */
function isVueRuntimeComponent(value: unknown): value is VueRuntimeComponent {
  return Boolean(value && typeof value === 'object' && 'type' in value)
}
