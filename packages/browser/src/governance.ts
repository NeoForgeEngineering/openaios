/**
 * URL governance for browser navigation.
 * Deny takes precedence over allow.
 */
export class BrowserGovernance {
  private urlAllowlist: string[]
  private urlDenylist: string[]

  constructor(opts?: { urlAllowlist?: string[]; urlDenylist?: string[] }) {
    this.urlAllowlist = opts?.urlAllowlist ?? []
    this.urlDenylist = opts?.urlDenylist ?? []
  }

  check(url: string): { allowed: boolean; reason?: string } {
    for (const pattern of this.urlDenylist) {
      if (matchUrlGlob(url, pattern)) {
        return { allowed: false, reason: `URL denied by pattern: ${pattern}` }
      }
    }

    if (this.urlAllowlist.length > 0) {
      const allowed = this.urlAllowlist.some((p) => matchUrlGlob(url, p))
      if (!allowed) {
        return { allowed: false, reason: 'URL not in browser allowlist' }
      }
    }

    return { allowed: true }
  }
}

function matchUrlGlob(url: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/<<GLOBSTAR>>/g, '.*')
  return new RegExp(`^${escaped}$`).test(url)
}
