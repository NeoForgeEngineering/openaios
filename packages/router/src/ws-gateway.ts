import type { Server as HttpServer } from 'node:http'
import { logger } from '@openaios/core'
import { WebSocket, WebSocketServer } from 'ws'
import type { RouterCore, RouterEvent } from './router-core.js'

export interface WsGatewayOptions {
  server: HttpServer
  authToken?: string
  router: RouterCore
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: unknown
  error?: { code: number; message: string }
}

interface JsonRpcNotification {
  jsonrpc: '2.0'
  method: string
  params: unknown
}

type MethodHandler = (
  params: Record<string, unknown> | undefined,
) => Promise<unknown>

/**
 * JSON-RPC 2.0 WebSocket gateway for RouterCore.
 * Provides config, sessions, agents, tools, budget methods + event subscriptions.
 */
export class WsGateway {
  private wss: WebSocketServer
  private methods = new Map<string, MethodHandler>()
  private subscribers = new Set<WebSocket>()
  private router: RouterCore
  private authToken?: string

  constructor(opts: WsGatewayOptions) {
    this.router = opts.router
    if (opts.authToken !== undefined) this.authToken = opts.authToken

    this.wss = new WebSocketServer({
      server: opts.server,
      path: '/ws',
    })

    this.wss.on('connection', (ws, req) => {
      // Auth check
      if (this.authToken !== undefined) {
        const url = new URL(req.url ?? '', 'http://localhost')
        const token = url.searchParams.get('token')
        if (token !== this.authToken) {
          ws.close(4001, 'Unauthorized')
          return
        }
      }

      ws.on('message', (data) => {
        void this.handleMessage(ws, data.toString())
      })

      ws.on('close', () => {
        this.subscribers.delete(ws)
      })
    })

    // Forward router events to subscribers
    this.router.events.on('turn', (event: RouterEvent) => {
      this.broadcast({
        jsonrpc: '2.0',
        method: 'event',
        params: event,
      })
    })

    this.registerBuiltinMethods()
    logger.info('[ws-gateway]', 'WebSocket gateway registered on /ws')
  }

  /** Register a JSON-RPC method handler. */
  registerMethod(name: string, handler: MethodHandler): void {
    this.methods.set(name, handler)
  }

  /** Broadcast a notification to all subscribers. */
  broadcast(notification: JsonRpcNotification): void {
    const payload = JSON.stringify(notification)
    for (const ws of this.subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      }
    }
  }

  close(): void {
    this.wss.close()
  }

  private async handleMessage(ws: WebSocket, raw: string): Promise<void> {
    let request: JsonRpcRequest
    try {
      request = JSON.parse(raw) as JsonRpcRequest
    } catch {
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        }),
      )
      return
    }

    if (request.method === 'subscribe') {
      this.subscribers.add(ws)
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { subscribed: true },
        }),
      )
      return
    }

    if (request.method === 'unsubscribe') {
      this.subscribers.delete(ws)
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result: { subscribed: false },
        }),
      )
      return
    }

    const handler = this.methods.get(request.method)
    if (!handler) {
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`,
          },
        } satisfies JsonRpcResponse),
      )
      return
    }

    try {
      const result = await handler(request.params)
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          result,
        } satisfies JsonRpcResponse),
      )
    } catch (err) {
      ws.send(
        JSON.stringify({
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32000,
            message: err instanceof Error ? err.message : String(err),
          },
        } satisfies JsonRpcResponse),
      )
    }
  }

  private registerBuiltinMethods(): void {
    this.registerMethod('ping', async () => ({ pong: true }))

    // agents.list is a placeholder — callers register domain-specific methods
    this.registerMethod('agents.list', async () => ({ agents: [] }))
  }
}
