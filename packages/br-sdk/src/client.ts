export interface BRClientOptions {
  url: string
  token: string
  /** Request timeout in ms. Default: 5000. */
  timeoutMs?: number
}

export interface BRAgentInfo {
  id: string
  name: string
  plan: string
  features: string[]
}

export interface BRUsageReport {
  agentId: string
  period: string
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export interface BRPolicyRule {
  tool: string
  allowed: boolean
  reason?: string
}

/**
 * BRClient — typed HTTP client for the Bot Resources control plane API.
 *
 * All methods throw on non-2xx responses.
 */
export class BRClient {
  private readonly url: string
  private readonly token: string
  private readonly timeoutMs: number

  constructor(options: BRClientOptions) {
    this.url = options.url.replace(/\/$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 5000
  }

  async getAgent(agentName: string): Promise<BRAgentInfo> {
    return this.get<BRAgentInfo>(`/v1/agents/${encodeURIComponent(agentName)}`)
  }

  async reportUsage(report: BRUsageReport): Promise<void> {
    await this.post('/v1/usage', report)
  }

  async getPolicyRules(agentName: string): Promise<BRPolicyRule[]> {
    return this.get<BRPolicyRule[]>(`/v1/agents/${encodeURIComponent(agentName)}/policy`)
  }

  async heartbeat(agentName: string): Promise<{ ok: boolean }> {
    return this.post<{ ok: boolean }>(`/v1/agents/${encodeURIComponent(agentName)}/heartbeat`, {
      timestampMs: Date.now(),
    })
  }

  private async get<T>(path: string): Promise<T> {
    const res = await this.fetch('GET', path)
    return res.json() as Promise<T>
  }

  private async post<T = void>(path: string, body: unknown): Promise<T> {
    const res = await this.fetch('POST', path, body)
    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  private async fetch(method: string, path: string, body?: unknown): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const res = await fetch(`${this.url}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token}`,
          'User-Agent': 'openaios-br-sdk/0.1.0',
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`BR API ${method} ${path} → ${res.status}: ${text}`)
      }

      return res
    } catch (err) {
      clearTimeout(timer)
      throw err
    }
  }
}
