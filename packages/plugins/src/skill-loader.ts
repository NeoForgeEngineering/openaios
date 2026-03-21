import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@openaios/core'

export interface LoadedSkill {
  name: string
  content: string
  path: string
}

/**
 * Discover and load SKILL.md files from a directory.
 * Each subdirectory containing a SKILL.md is treated as a skill.
 */
export function discoverSkills(skillsDir: string): LoadedSkill[] {
  if (!existsSync(skillsDir)) return []

  const skills: LoadedSkill[] = []
  const entries = readdirSync(skillsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue

    const skillPath = join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillPath)) continue

    try {
      const content = readFileSync(skillPath, 'utf-8')
      skills.push({
        name: entry.name,
        content,
        path: skillPath,
      })
    } catch (err) {
      logger.warn(
        '[plugins]',
        `Failed to read skill ${skillPath}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return skills
}

/**
 * Build system prompt suffix from loaded skills.
 */
export function buildSkillPrompt(skills: LoadedSkill[]): string {
  if (skills.length === 0) return ''
  return skills.map((s) => `\n\n${s.content}`).join('')
}
