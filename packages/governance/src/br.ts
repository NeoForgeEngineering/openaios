import type {
  GovernanceAdapter,
  PolicyDecision,
  PolicyRequest,
  ToolUseEvent,
  TurnCostEvent,
} from '@openaios/core'

interface BRGovernanceOptions {
  url: string
  token: string
  /** If true, deny when BR is unreachable. Default: false (fail-open). */
  failSecure?: boolean
  /** Timeout for policy checks in ms. Default: 200. */
  timeoutMs?: number
}

/**
 * BRGovernance — delegates policy decisions to the Bot Resources control plane.
 *
 * - checkPolicy: HTTP call to BR with 200ms timeout; fail-open by default.
 * - reportToolUse / reportTurnCost: fire-and-forget to BR audit endpoint.
 */
export class BRGovernance implements GovernanceAdapter {
  private readonly url: string
  private readonly token: string
  private readonly failSecure: boolean
  private readonly timeoutMs: number

  constructor(options: BRGovernanceOptions) {
    this.url = options.url.replace(/\/$/, '')
    this.token = options.token
    this.failSecure = options.failSecure ?? false
    this.timeoutMs = options.timeoutMs ?? 200
  }

  async checkPolicy(req: PolicyRequest): Promise<PolicyDecision> {
    const failDecision: PolicyDecision = this.failSecure
      ? {
          allowed: false,
          reason: 'BR governance unreachable (fail-secure mode)',
        }
      : { allowed: true, reason: 'BR governance unreachable (fail-open)' }

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)

      const res = await fetch(`${this.url}/v1/policy/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
        },
        body: JSON.stringify(req),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) return failDecision

      const data = (await res.json()) as { allowed: boolean; reason?: string }
      return data.allowed
        ? {
            allowed: true as const,
            ...(data.reason !== undefined && { reason: data.reason }),
          }
        : {
            allowed: false as const,
            reason: data.reason ?? 'Denied by BR governance',
          }
    } catch {
      return failDecision
    }
  }

  reportToolUse(event: ToolUseEvent): void {
    this.fireAndForget('/v1/audit/tool-use', event)
  }

  reportTurnCost(event: TurnCostEvent): void {
    this.fireAndForget('/v1/audit/turn-cost', event)
  }

  private fireAndForget(path: string, body: unknown): void {
    fetch(`${this.url}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify(body),
    }).catch(() => {
      // Silently discard — fire-and-forget
    })
  }
}
