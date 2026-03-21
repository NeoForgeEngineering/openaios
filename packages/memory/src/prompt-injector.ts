import type { MemoryEntry } from '@openaios/core'

/**
 * Build a prompt context string from memory entries, truncated to fit
 * within the given token budget.
 *
 * Uses a rough estimate of 4 chars per token.
 */
export function buildPromptContext(
  memories: MemoryEntry[],
  maxTokens: number,
): string {
  if (memories.length === 0 || maxTokens <= 0) return ''

  const maxChars = maxTokens * 4
  const header = '## Relevant Memories\n\n'
  let result = header
  let remaining = maxChars - header.length

  for (const memory of memories) {
    const score =
      memory.score !== undefined
        ? ` (relevance: ${memory.score.toFixed(2)})`
        : ''
    const line = `- **${memory.key}**${score}: ${memory.content}\n`

    if (line.length > remaining) {
      // Try to fit a truncated version
      const truncated = `${line.slice(0, remaining - 4)}...\n`
      if (remaining > 20) {
        result += truncated
      }
      break
    }

    result += line
    remaining -= line.length
  }

  return result
}
