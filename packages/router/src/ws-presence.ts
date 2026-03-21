/**
 * Presence tracking for WebSocket clients.
 * Tracks connected clients and typing indicators.
 */
export class WsPresence {
  private connected = new Map<string, { connectedAt: number }>()
  private typing = new Map<string, number>() // userId → timestamp
  private typingTimeoutMs = 10_000

  connect(clientId: string): void {
    this.connected.set(clientId, { connectedAt: Date.now() })
  }

  disconnect(clientId: string): void {
    this.connected.delete(clientId)
    this.typing.delete(clientId)
  }

  setTyping(userId: string): void {
    this.typing.set(userId, Date.now())
  }

  clearTyping(userId: string): void {
    this.typing.delete(userId)
  }

  getConnected(): string[] {
    return [...this.connected.keys()]
  }

  getTyping(): string[] {
    const now = Date.now()
    const active: string[] = []
    for (const [userId, ts] of this.typing) {
      if (now - ts < this.typingTimeoutMs) {
        active.push(userId)
      } else {
        this.typing.delete(userId)
      }
    }
    return active
  }

  get connectedCount(): number {
    return this.connected.size
  }
}
