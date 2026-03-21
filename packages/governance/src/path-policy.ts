/**
 * Per-agent file path allow/deny enforcement.
 * Deny takes precedence over allow. Supports glob patterns with *.
 */
export class PathPolicy {
  private rules: Map<string, { allow: string[]; deny: string[] }>

  constructor(
    agentPaths: Record<string, { allow?: string[]; deny?: string[] }>,
  ) {
    this.rules = new Map(
      Object.entries(agentPaths).map(([agent, paths]) => [
        agent,
        { allow: paths.allow ?? [], deny: paths.deny ?? [] },
      ]),
    )
  }

  /** Check whether an agent is allowed to access the given path. */
  check(
    agentName: string,
    path: string,
  ): { allowed: boolean; reason?: string } {
    const rules = this.rules.get(agentName)
    if (!rules) {
      // No path rules configured → allow
      return { allowed: true }
    }

    // Deny takes precedence
    for (const pattern of rules.deny) {
      if (matchGlob(path, pattern)) {
        return {
          allowed: false,
          reason: `Path "${path}" denied by pattern "${pattern}"`,
        }
      }
    }

    // If allow list is non-empty, path must match
    if (rules.allow.length > 0) {
      const allowed = rules.allow.some((pattern) => matchGlob(path, pattern))
      if (!allowed) {
        return {
          allowed: false,
          reason: `Path "${path}" not in allowed paths`,
        }
      }
    }

    return { allowed: true }
  }
}

function matchGlob(path: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
  return new RegExp(`^${escaped}$`).test(path)
}
