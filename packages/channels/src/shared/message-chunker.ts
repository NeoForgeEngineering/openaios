/**
 * Split a long message into chunks at paragraph boundaries,
 * respecting a per-channel max length.
 */
export function chunkMessage(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text]

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    // Try to split at paragraph boundary
    let splitIdx = remaining.lastIndexOf('\n\n', maxLength)

    // Fall back to single newline
    if (splitIdx <= 0) {
      splitIdx = remaining.lastIndexOf('\n', maxLength)
    }

    // Fall back to space
    if (splitIdx <= 0) {
      splitIdx = remaining.lastIndexOf(' ', maxLength)
    }

    // Hard split as last resort
    if (splitIdx <= 0) {
      splitIdx = maxLength
    }

    chunks.push(remaining.slice(0, splitIdx))
    remaining = remaining.slice(splitIdx).trimStart()
  }

  return chunks
}
