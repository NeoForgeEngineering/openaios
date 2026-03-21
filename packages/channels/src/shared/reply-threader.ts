/**
 * Track thread context for conversations.
 * Maps sessionKey → most recent message ID for reply threading.
 */
export class ReplyThreader {
  private threads = new Map<string, string>()

  /** Record the latest message ID for a session. */
  track(sessionKey: string, messageId: string): void {
    this.threads.set(sessionKey, messageId)
  }

  /** Get the message ID to reply to for a session. */
  getReplyTo(sessionKey: string): string | undefined {
    return this.threads.get(sessionKey)
  }

  /** Clear thread tracking for a session. */
  clear(sessionKey: string): void {
    this.threads.delete(sessionKey)
  }
}
