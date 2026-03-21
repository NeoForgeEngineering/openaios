import { logger } from '@openaios/core'

export interface BrowserSessionOptions {
  sessionTimeoutMs?: number
}

interface SessionEntry {
  agentName: string
  createdAt: number
  lastUsedAt: number
}

/**
 * Per-agent browser session manager.
 * Tracks active sessions and enforces timeouts.
 */
export class BrowserSessionManager {
  private sessions = new Map<string, SessionEntry>()
  private timeoutMs: number

  constructor(opts?: BrowserSessionOptions) {
    this.timeoutMs = opts?.sessionTimeoutMs ?? 300_000 // 5 min default
  }

  /** Get or create a session for an agent. Returns the session key. */
  acquire(agentName: string): string {
    const key = `browser:${agentName}`
    const existing = this.sessions.get(key)

    if (existing) {
      const age = Date.now() - existing.lastUsedAt
      if (age > this.timeoutMs) {
        logger.info(
          '[browser]',
          `Session expired for ${agentName}, creating new`,
        )
        this.sessions.delete(key)
      } else {
        existing.lastUsedAt = Date.now()
        return key
      }
    }

    this.sessions.set(key, {
      agentName,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    })

    return key
  }

  /** Release a session. */
  release(agentName: string): void {
    this.sessions.delete(`browser:${agentName}`)
  }

  /** Check if an agent has an active session. */
  hasSession(agentName: string): boolean {
    const entry = this.sessions.get(`browser:${agentName}`)
    if (!entry) return false
    if (Date.now() - entry.lastUsedAt > this.timeoutMs) {
      this.sessions.delete(`browser:${agentName}`)
      return false
    }
    return true
  }

  /** Clean up all expired sessions. */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.sessions) {
      if (now - entry.lastUsedAt > this.timeoutMs) {
        this.sessions.delete(key)
      }
    }
  }
}
