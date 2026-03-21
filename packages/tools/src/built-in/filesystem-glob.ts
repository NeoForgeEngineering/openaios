import { readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
})

export function createFilesystemGlobTool(): ToolDefinition {
  return {
    name: 'filesystem_glob',
    description:
      'Find files matching a glob pattern. Searches recursively from the given path ' +
      '(defaults to workspace). Supports * and ** patterns.',
    inputSchema: InputSchema,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { pattern } = parsed.data
      const searchPath = parsed.data.path ?? ctx.workspaceDir

      try {
        const regex = globToRegex(pattern)
        const matches: string[] = []
        walkDir(searchPath, searchPath, regex, matches, 0, 5000)

        if (matches.length === 0) {
          return { type: 'text', content: 'No files found' }
        }

        return { type: 'text', content: matches.join('\n') }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Glob failed: ${message}` }
      }
    },
  }
}

function walkDir(
  base: string,
  dir: string,
  regex: RegExp,
  matches: string[],
  depth: number,
  maxResults: number,
): void {
  if (depth > 20 || matches.length >= maxResults) return

  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (matches.length >= maxResults) return
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

    const fullPath = join(dir, entry.name)
    const relPath = relative(base, fullPath)

    if (entry.isDirectory()) {
      walkDir(base, fullPath, regex, matches, depth + 1, maxResults)
    } else if (regex.test(relPath)) {
      matches.push(fullPath)
    }
  }
}

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
  return new RegExp(`^${escaped}$`)
}
