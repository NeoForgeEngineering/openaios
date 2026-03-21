import type { InboundMessage } from '@openaios/core'

/**
 * Group routing middleware.
 * In group chats, only process messages that mention the bot.
 * In DMs, all messages pass through.
 */
export function shouldProcessGroupMessage(
  message: InboundMessage,
  opts?: { requireMention?: boolean },
): boolean {
  // DMs always pass through
  if (!message.isGroup) return true

  // In groups, require mention by default
  const requireMention = opts?.requireMention ?? true
  if (requireMention) {
    return message.mentionsBot === true
  }

  return true
}
