/**
 * Token-bucket rate limiter — per agent.
 */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; lastRefill: number }>()
  private configs: Map<string, { capacity: number; refillPerSecond: number }>

  constructor(
    agentLimits: Record<
      string,
      { capacity: number; refill_per_second: number }
    >,
  ) {
    this.configs = new Map(
      Object.entries(agentLimits).map(([agent, cfg]) => [
        agent,
        { capacity: cfg.capacity, refillPerSecond: cfg.refill_per_second },
      ]),
    )
  }

  /**
   * Try to consume one token for the given agent.
   * Returns true if allowed, false if rate-limited.
   */
  consume(agentName: string, now?: number): boolean {
    const config = this.configs.get(agentName)
    if (!config) return true // No rate limit configured

    const currentTime = now ?? Date.now()
    let bucket = this.buckets.get(agentName)

    if (!bucket) {
      bucket = { tokens: config.capacity, lastRefill: currentTime }
      this.buckets.set(agentName, bucket)
    }

    // Refill tokens
    const elapsedMs = currentTime - bucket.lastRefill
    const refill = (elapsedMs / 1000) * config.refillPerSecond
    bucket.tokens = Math.min(config.capacity, bucket.tokens + refill)
    bucket.lastRefill = currentTime

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1
      return true
    }

    return false
  }

  /** Check remaining tokens without consuming. */
  remaining(agentName: string): number {
    const config = this.configs.get(agentName)
    if (!config) return Infinity

    const bucket = this.buckets.get(agentName)
    if (!bucket) return config.capacity

    const elapsedMs = Date.now() - bucket.lastRefill
    const refill = (elapsedMs / 1000) * config.refillPerSecond
    return Math.min(config.capacity, bucket.tokens + refill)
  }
}
