import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GENERATED_SKILL_CONFIG_MARKER,
  writeGeneratedTextFile
} from '../../src/plugin/skillConfig/writers'
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
      content: `${GENERATED_SKILL_CONFIG_MARKER}\nfirst\n`,
      targetName: 'Codex skill'
    })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe(
      `${GENERATED_SKILL_CONFIG_MARKER}\nfirst\n`
    )
  })

  it('updates a generated text file when the marker is present', async () => {
    const filePath = path.join(
      tempRoot,
      '.codex',
      'skills',
      'vite-mcp-next',
      'SKILL.md'
    )
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, `${GENERATED_SKILL_CONFIG_MARKER}\nold\n`)

    await writeGeneratedTextFile({
      filePath,
      content: `${GENERATED_SKILL_CONFIG_MARKER}\nnew\n`,
      targetName: 'Codex skill'
    })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe(
      `${GENERATED_SKILL_CONFIG_MARKER}\nnew\n`
    )
  })

  it('keeps a user-authored text file unchanged when marker is absent', async () => {
    const filePath = path.join(
      tempRoot,
      '.cursor',
      'rules',
      'vite-mcp-next.mdc'
    )
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, 'user content\n')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await writeGeneratedTextFile({
      filePath,
      content: `${GENERATED_SKILL_CONFIG_MARKER}\ngenerated\n`,
      targetName: 'Cursor rule'
    })

    await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('user content\n')
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Skipped Cursor rule')
    )
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
    ).resolves.toContain('get_console_logs')
  })
})
