import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@openaios/core'
import { parse as parseYaml } from 'yaml'
import { BUILT_IN_ROLES } from './built-in.js'
import { type RoleDefinition, RoleDefinitionSchema } from './types.js'

/**
 * Role registry — loads built-in roles + custom role definitions.
 *
 * Supports two file formats:
 * - **Markdown (.md)** — YAML frontmatter for config, body for persona (preferred)
 * - **YAML (.yml/.yaml)** — pure YAML with persona as a field
 *
 * Discovery order (later overrides earlier):
 * 1. Built-in roles (shipped with openAIOS)
 * 2. Custom roles from configured directories
 */
export class RoleRegistry {
  private roles = new Map<string, RoleDefinition>()

  constructor() {
    for (const role of BUILT_IN_ROLES) {
      this.roles.set(role.id, role)
    }
  }

  /** Load custom role definitions from a directory. */
  loadFromDirectory(dir: string): void {
    if (!existsSync(dir)) return

    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.md') || f.endsWith('.yml') || f.endsWith('.yaml'),
    )

    for (const file of files) {
      try {
        const content = readFileSync(join(dir, file), 'utf-8')
        const role = file.endsWith('.md')
          ? parseMarkdownRole(content)
          : parseYamlRole(content)

        this.roles.set(role.id, role)
        logger.info('[roles]', `Loaded role "${role.id}" from ${file}`)
      } catch (err) {
        logger.warn(
          '[roles]',
          `Failed to load role from ${file}: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  get(id: string): RoleDefinition | undefined {
    return this.roles.get(id)
  }

  list(): RoleDefinition[] {
    return [...this.roles.values()]
  }

  register(role: RoleDefinition): void {
    this.roles.set(role.id, role)
  }
}

/**
 * Parse a markdown role file:
 * ---
 * id: software-engineer
 * name: Software Engineer
 * tools: { allow: [...], deny: [...] }
 * ---
 * You are a senior software engineer...
 */
function parseMarkdownRole(content: string): RoleDefinition {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!fmMatch) {
    throw new Error('No frontmatter found — expected ---\\n...\\n---')
  }

  const frontmatter = parseYaml(fmMatch[1]!) as Record<string, unknown>
  const persona = fmMatch[2]?.trim()

  return RoleDefinitionSchema.parse({
    ...frontmatter,
    persona,
  })
}

/** Parse a YAML role file (persona is a field). */
function parseYamlRole(content: string): RoleDefinition {
  const raw = parseYaml(content) as Record<string, unknown>
  return RoleDefinitionSchema.parse(raw)
}
