import { randomUUID } from 'node:crypto'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import type {
  ChannelAdapter,
  ChannelTarget,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'

export interface WebhookAdapterOptions {
  /**
   * Shared HTTP server instance (created by start.ts).
   * The adapter registers its path on this server.
   */
  server: Server
  /** URL path to listen on. Defaults to '/webhook'. */
  path?: string
  /** Shared secret for authenticating inbound requests (X-Webhook-Secret header). */
  secret?: string
}

/**
 * WebhookAdapter — synchronous request/response HTTP channel.
 *
 * POST body:  { "text": "...", "userId": "optional", "messageId": "optional" }
 * Response:   { "output": "...", "messageId": "..." }
 *
 * The HTTP request is held open until the agent responds or a timeout occurs.
 * This makes `curl` a valid client for local testing without any third-party channel.
 */
export class WebhookAdapter implements ChannelAdapter {
  readonly channelType = 'webhook'

  private readonly server: Server
  private readonly path: string
  private readonly secret: string | undefined
  private handler?: MessageHandler
  private readonly pending = new Map<string, (msg: OutboundMessage) => void>()
  private started = false

  constructor(opts: WebhookAdapterOptions) {
    this.server = opts.server
    this.path = opts.path ?? '/webhook'
    this.secret = opts.secret
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true

    this.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      if (req.url === this.path) {
        void this.handleRequest(req, res)
      }
    })

    logger.info('[webhook]', `Registered on path ${this.path}`)
  }

  async stop(): Promise<void> {
    this.started = false
    // Server lifecycle managed by start.ts
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    const resolve = this.pending.get(target.id)
    if (resolve) {
      this.pending.delete(target.id)
      resolve(msg)
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method Not Allowed')
      return
    }

    if (this.secret) {
      const provided = req.headers['x-webhook-secret']
      if (provided !== this.secret) {
        res.writeHead(401).end('Unauthorized')
        return
      }
    }

    const body = await new Promise<string>((resolve) => {
      let data = ''
      req.setEncoding('utf-8')
      req.on('data', (chunk: string) => {
        data += chunk
      })
      req.on('end', () => {
        resolve(data)
      })
    })

    let parsed: { text?: string; userId?: string; messageId?: string }
    try {
      parsed = JSON.parse(body) as {
        text?: string
        userId?: string
        messageId?: string
      }
    } catch {
      res.writeHead(400).end('Invalid JSON')
      return
    }

    const text = parsed.text
    if (!text) {
      res.writeHead(400).end('Missing "text" field')
      return
    }

    const requestId = parsed.messageId ?? randomUUID()
    const userId = parsed.userId ?? 'webhook-user'

    // Park the response resolver
    let responseResolve!: (msg: OutboundMessage) => void
    const responsePromise = new Promise<OutboundMessage>((r) => {
      responseResolve = r
    })
    this.pending.set(requestId, responseResolve)

    const inbound: InboundMessage = {
      messageId: requestId,
      source: { id: requestId },
      userId,
      text,
      timestamp: Math.floor(Date.now() / 1000),
    }

    // RouterCore handles errors internally and always calls send() before returning
    await this.handler?.(inbound)

    // RouterCore awaits send() before resolving, so responsePromise is already resolved.
    // The timeout is a safety net for unexpected async patterns.
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), 120_000))
    const result = await Promise.race([responsePromise, timeout])
    this.pending.delete(requestId)

    if (!result) {
      res.writeHead(504).end('Response timed out')
      return
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ output: result.text, messageId: requestId }))
  }
}
