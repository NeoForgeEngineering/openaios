import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { ToolContext, ToolDefinition, ToolResult } from '@openaios/core'
import { z } from 'zod'

const InputSchema = z.object({
  pattern: z.string().min(1),
  path: z.string().optional(),
  glob: z.string().optional(),
  case_insensitive: z.boolean().optional(),
})

export function createFilesystemGrepTool(): ToolDefinition {
  return {
    name: 'filesystem_grep',
    description:
      'Search file contents for a regex pattern. Searches recursively from the given path. ' +
      'Use glob to filter files (e.g. "*.ts"). Returns matching lines with file paths and line numbers.',
    inputSchema: InputSchema,
    async execute(input: unknown, ctx: ToolContext): Promise<ToolResult> {
      const parsed = InputSchema.safeParse(input)
      if (!parsed.success) {
        return {
          type: 'error',
          content: `Invalid input: ${parsed.error.message}`,
        }
      }

      const { pattern, case_insensitive: caseInsensitive } = parsed.data
      const searchPath = parsed.data.path ?? ctx.workspaceDir
      const fileGlob = parsed.data.glob ? globToRegex(parsed.data.glob) : null

      try {
        const regex = new RegExp(pattern, caseInsensitive ? 'i' : '')
        const results: string[] = []
        searchDir(searchPath, searchPath, regex, fileGlob, results, 0, 200)

        if (results.length === 0) {
          return { type: 'text', content: 'No matches found' }
        }

        return { type: 'text', content: results.join('\n') }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { type: 'error', content: `Grep failed: ${message}` }
      }
    },
  }
}

function searchDir(
  base: string,
  dir: string,
  regex: RegExp,
  fileGlob: RegExp | null,
  results: string[],
  depth: number,
  maxResults: number,
): void {
  if (depth > 20 || results.length >= maxResults) return

  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= maxResults) return
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue

    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      searchDir(base, fullPath, regex, fileGlob, results, depth + 1, maxResults)
    } else {
      const relPath = relative(base, fullPath)
      if (fileGlob && !fileGlob.test(relPath)) continue

      try {
        const content = readFileSync(fullPath, 'utf-8')
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (regex.test(lines[i]!)) {
            results.push(`${fullPath}:${i + 1}:${lines[i]}`)
            if (results.length >= maxResults) return
          }
        }
      } catch {
        // Skip binary / unreadable files
      }
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
