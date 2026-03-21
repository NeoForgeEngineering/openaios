import { logger } from '@openaios/core'

export interface AuthProfile {
  key: string
  provider?: string
}

/**
 * Round-robin API key rotation with cooldown on 429s.
 * Each key tracks its cooldown expiry; rate-limited keys are skipped.
 */
export class AuthRotation {
  private profiles: AuthProfile[]
  private index = 0
  private cooldowns = new Map<string, number>() // key → cooldown expiry timestamp
  private cooldownMs: number

  constructor(profiles: AuthProfile[], opts?: { cooldownMs?: number }) {
    if (profiles.length === 0) {
      throw new Error('AuthRotation requires at least one profile')
    }
    this.profiles = profiles
    this.cooldownMs = opts?.cooldownMs ?? 60_000
  }

  /** Get the next available API key, skipping cooled-down ones. */
  next(): AuthProfile {
    const now = Date.now()
    const startIdx = this.index

    // Try each key in round-robin order
    for (let i = 0; i < this.profiles.length; i++) {
      const idx = (startIdx + i) % this.profiles.length
      const profile = this.profiles[idx]!
      const cooldownExpiry = this.cooldowns.get(profile.key)

      if (cooldownExpiry === undefined || now >= cooldownExpiry) {
        this.index = (idx + 1) % this.profiles.length
        return profile
      }
    }

    // All keys are on cooldown — return the one with earliest expiry
    let bestIdx = 0
    let bestExpiry = Infinity
    for (let i = 0; i < this.profiles.length; i++) {
      const expiry = this.cooldowns.get(this.profiles[i]?.key) ?? 0
      if (expiry < bestExpiry) {
        bestExpiry = expiry
        bestIdx = i
      }
    }

    logger.warn(
      '[auth-rotation]',
      'All API keys on cooldown — using least-recently rate-limited',
    )
    this.index = (bestIdx + 1) % this.profiles.length
    return this.profiles[bestIdx]!
  }

  /** Mark a key as rate-limited (429). */
  markRateLimited(key: string): void {
    this.cooldowns.set(key, Date.now() + this.cooldownMs)
    logger.warn(
      '[auth-rotation]',
      `Key ${key.slice(0, 8)}... rate-limited, cooldown ${this.cooldownMs}ms`,
    )
  }

  /** Check how many keys are currently available (not on cooldown). */
  availableCount(): number {
    const now = Date.now()
    return this.profiles.filter((p) => {
      const expiry = this.cooldowns.get(p.key)
      return expiry === undefined || now >= expiry
    }).length
  }

  get totalCount(): number {
    return this.profiles.length
  }
}
