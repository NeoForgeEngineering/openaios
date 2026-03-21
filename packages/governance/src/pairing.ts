import { randomInt } from 'node:crypto'

interface PairingEntry {
  code: string
  agentName: string
  createdAt: number
}

/**
 * DM pairing codes — 6-digit numeric, time-limited.
 * Used to bind a channel DM to an agent before allowing messages.
 */
export class PairingManager {
  private entries = new Map<string, PairingEntry>()
  private ttlMs: number

  constructor(opts?: { ttlSeconds?: number }) {
    this.ttlMs = (opts?.ttlSeconds ?? 300) * 1000
  }

  /** Generate a new 6-digit pairing code for an agent. */
  createCode(agentName: string): string {
    const code = String(randomInt(100_000, 999_999))
    const key = `${agentName}:${code}`
    this.entries.set(key, {
      code,
      agentName,
      createdAt: Date.now(),
    })
    return code
  }

  /** Verify a pairing code. Returns true if valid and not expired. */
  verify(agentName: string, code: string): boolean {
    const key = `${agentName}:${code}`
    const entry = this.entries.get(key)
    if (!entry) return false

    if (Date.now() - entry.createdAt > this.ttlMs) {
      this.entries.delete(key)
      return false
    }

    return true
  }

  /** Revoke a pairing code. */
  revoke(agentName: string, code: string): void {
    this.entries.delete(`${agentName}:${code}`)
  }

  /** Remove all expired entries. */
  cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (now - entry.createdAt > this.ttlMs) {
        this.entries.delete(key)
      }
    }
  }
}
