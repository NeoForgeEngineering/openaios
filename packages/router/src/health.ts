import type { IncomingMessage, ServerResponse } from 'node:http'

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error'
  uptime: number
  agents: number
  version: string
}

/**
 * HTTP health endpoints (/health, /ready).
 * Designed to be registered on a shared HTTP server.
 */
export class HealthEndpoints {
  private startTime = Date.now()
  private agentCount: number

  constructor(opts: { agentCount: number }) {
    this.agentCount = opts.agentCount
  }

  handle(req: IncomingMessage, res: ServerResponse): boolean {
    if (req.method !== 'GET') return false

    if (req.url === '/health') {
      const status = this.getStatus()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(status))
      return true
    }

    if (req.url === '/ready') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ready: true }))
      return true
    }

    return false
  }

  getStatus(): HealthStatus {
    return {
      status: 'ok',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      agents: this.agentCount,
      version: '0.1.0',
    }
  }
}
