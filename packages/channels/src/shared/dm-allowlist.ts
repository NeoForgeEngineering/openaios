/**
 * DM sender allowlist enforcement.
 * When configured, only allowed user IDs can send DMs.
 */
export class DmAllowlist {
  private allowed: Set<string>

  constructor(userIds: string[]) {
    this.allowed = new Set(userIds)
  }

  /** Check if a user is allowed. Empty allowlist means all users allowed. */
  isAllowed(userId: string): boolean {
    if (this.allowed.size === 0) return true
    return this.allowed.has(userId)
  }

  add(userId: string): void {
    this.allowed.add(userId)
  }

  remove(userId: string): void {
    this.allowed.delete(userId)
  }
}
