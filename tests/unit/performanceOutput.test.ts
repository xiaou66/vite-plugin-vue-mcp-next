import { readFile } from 'node:fs/promises'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writePerformanceArtifact } from '../../src/performance/output'

describe('writePerformanceArtifact', () => {
  it('writes artifacts under the configured save directory', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'vue-mcp-output-'))
    const artifact = await writePerformanceArtifact({
      root,
      saveDir: '.vite-mcp/performance',
      fileName: 'cpu-profile.json',
      kind: 'cpu-profile',
      data: Buffer.from('{"ok":true}')
    })

    expect(artifact.path).toContain(
      path.join(root, '.vite-mcp/performance')
    )
    expect(artifact.relativePath).toContain('.vite-mcp/performance')
    await expect(readFile(artifact.path, 'utf8')).resolves.toContain('"ok"')
  })
})
