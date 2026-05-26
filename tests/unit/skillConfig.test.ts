import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { writeGeneratedTextFile } from '../../src/plugin/skillConfig/writers'
import { updateSkillConfigs } from '../../src/plugin/skillConfig'

let tempRoot: string

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(tmpdir(), 'vue-mcp-next-skill-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('generated skill config writer', () => {
  it('creates a generated text file when it is missing', async () => {
    const filePath = path.join(
      tempRoot,
      '.codex',
      'skills',
      'vite-mcp-next',
      'SKILL.md'
    )

    await writeGeneratedTextFile({
      filePath,
      content: 'first\n',
      targetName: 'Codex skill'
    })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('first\n')
  })

  it('updates an existing text file without requiring a generated marker', async () => {
    const filePath = path.join(
      tempRoot,
      '.codex',
      'skills',
      'vite-mcp-next',
      'SKILL.md'
    )
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'old\n')

    await writeGeneratedTextFile({
      filePath,
      content: 'new\n',
      targetName: 'Codex skill'
    })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('new\n')
  })
})

describe('skill config orchestration', () => {
  it('does not create skill configs when auto config is disabled', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, '.claude'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, '.cursor'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: false })

    await expect(
      fs.access(
        path.join(tempRoot, '.codex', 'skills', 'vite-mcp-next', 'SKILL.md')
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(
        path.join(tempRoot, '.claude', 'skills', 'vite-mcp-next', 'SKILL.md')
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.cursor', 'rules', 'vite-mcp-next.mdc'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes Codex skill only when .codex exists', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.readFile(
        path.join(tempRoot, '.codex', 'skills', 'vite-mcp-next', 'SKILL.md'),
        'utf-8'
      )
    ).resolves.toContain('name: vite-mcp-next')
    await expect(
      fs.access(
        path.join(tempRoot, '.claude', 'skills', 'vite-mcp-next', 'SKILL.md')
      )
    ).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(
      fs.access(path.join(tempRoot, '.cursor', 'rules', 'vite-mcp-next.mdc'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes Claude Code skill only when .claude exists', async () => {
    await fs.mkdir(path.join(tempRoot, '.claude'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.readFile(
        path.join(tempRoot, '.claude', 'skills', 'vite-mcp-next', 'SKILL.md'),
        'utf-8'
      )
    ).resolves.toContain('Vue Runtime Bridge')
  })

  it('writes Cursor rule only when .cursor exists', async () => {
    await fs.mkdir(path.join(tempRoot, '.cursor'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.readFile(
        path.join(tempRoot, '.cursor', 'rules', 'vite-mcp-next.mdc'),
        'utf-8'
      )
    ).resolves.toContain('name: vite-mcp-next')
  })

  it('does not create Trae rule in the first version', async () => {
    await fs.mkdir(path.join(tempRoot, '.trae'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.access(path.join(tempRoot, '.trae', 'rules', 'vite-mcp-next.md'))
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('writes all supported detected client guidance files', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, '.claude'), { recursive: true })
    await fs.mkdir(path.join(tempRoot, '.cursor'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.readFile(
        path.join(tempRoot, '.codex', 'skills', 'vite-mcp-next', 'SKILL.md'),
        'utf-8'
      )
    ).resolves.toContain('list_pages')
    await expect(
      fs.readFile(
        path.join(tempRoot, '.claude', 'skills', 'vite-mcp-next', 'SKILL.md'),
        'utf-8'
      )
    ).resolves.toContain('get_router_info')
    await expect(
      fs.readFile(
        path.join(tempRoot, '.cursor', 'rules', 'vite-mcp-next.mdc'),
        'utf-8'
      )
    ).resolves.toContain('inspect_console_arg')
  })

  it('writes client guidance files without generated ownership marker text', async () => {
    await fs.mkdir(path.join(tempRoot, '.codex'), { recursive: true })

    await updateSkillConfigs(tempRoot, { autoConfig: true })

    await expect(
      fs.readFile(
        path.join(tempRoot, '.codex', 'skills', 'vite-mcp-next', 'SKILL.md'),
        'utf-8'
      )
    ).resolves.not.toContain('Generated by vite-plugin-vue-mcp-next')
  })
})
