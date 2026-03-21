import type { IncomingMessage, ServerResponse } from 'node:http'
import { logger } from '@openaios/core'
import type { DispatchFn } from './cron-scheduler.js'

export interface WebhookRoute {
  path: string
  agent: string
  token?: string
}

/**
 * Inbound webhook receiver with idempotency key dedup.
 * Registers routes on an existing HTTP server.
 */
export class WebhookReceiver {
  private routes: Map<string, WebhookRoute>
  private dispatch: DispatchFn
  private seen = new Map<string, number>()
  private seenTtlMs = 3600_000 // 1 hour dedup window

  constructor(routes: WebhookRoute[], dispatch: DispatchFn) {
    this.routes = new Map(routes.map((r) => [r.path, r]))
    this.dispatch = dispatch
  }

  /**
   * Handle an HTTP request. Returns true if the request was handled.
   */
  async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const route = this.routes.get(req.url ?? '')
    if (!route || req.method !== 'POST') return false

    // Auth check
    if (route.token !== undefined) {
      const auth = req.headers.authorization
      if (auth !== `Bearer ${route.token}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Unauthorized' }))
        return true
      }
    }

    // Read body
    let body = ''
    req.setEncoding('utf-8')
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: string) => {
        body += chunk
      })
      req.on('end', resolve)
    })

    // Idempotency check
    const idempotencyKey =
      (req.headers['idempotency-key'] as string | undefined) ??
      (req.headers['x-idempotency-key'] as string | undefined)

    if (idempotencyKey) {
      if (this.seen.has(idempotencyKey)) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ status: 'duplicate', idempotencyKey }))
        return true
      }
      this.seen.set(idempotencyKey, Date.now())
      this.cleanupSeen()
    }

    // Parse and dispatch
    let parsed: Record<string, unknown>
    try {
      parsed = body ? (JSON.parse(body) as Record<string, unknown>) : {}
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid JSON' }))
      return true
    }

    const message =
      typeof parsed.message === 'string'
        ? parsed.message
        : `Webhook received: ${JSON.stringify(parsed)}`

    try {
      await this.dispatch({
        agentName: route.agent,
        sessionKey: `webhook:${route.path}:${idempotencyKey ?? Date.now()}`,
        message,
      })

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'dispatched' }))
    } catch (err) {
      logger.error(
        '[automation]',
        `Webhook dispatch failed: ${err instanceof Error ? err.message : String(err)}`,
      )
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Dispatch failed' }))
    }

    return true
  }

  private cleanupSeen(): void {
    const cutoff = Date.now() - this.seenTtlMs
    for (const [key, ts] of this.seen) {
      if (ts < cutoff) this.seen.delete(key)
    }
  }
}
