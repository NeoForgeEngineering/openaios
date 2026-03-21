import type { Server as HttpServer } from 'node:http'
import { logger } from '@openaios/core'
import { WebSocket, WebSocketServer } from 'ws'
import type { A2UIMessage, CanvasComponent } from './a2ui-protocol.js'
import { CanvasStateManager } from './state-manager.js'

export interface CanvasServerOptions {
  server: HttpServer
  path?: string
  authToken?: string
}

export type ActionHandler = (
  sessionId: string,
  componentId: string,
  actionType: string,
  data?: Record<string, unknown>,
) => Promise<void>

/**
 * WebSocket-based canvas server.
 * Manages per-session canvas state and broadcasts to connected UI clients.
 */
export class CanvasServer {
  private wss: WebSocketServer
  private state = new CanvasStateManager()
  private clients = new Map<string, Set<WebSocket>>() // sessionId → clients
  private actionHandler?: ActionHandler
  private authToken?: string

  constructor(opts: CanvasServerOptions) {
    if (opts.authToken !== undefined) this.authToken = opts.authToken

    this.wss = new WebSocketServer({
      server: opts.server,
      path: opts.path ?? '/canvas',
    })

    this.wss.on('connection', (ws, req) => {
      const url = new URL(req.url ?? '', 'http://localhost')

      // Auth check
      if (this.authToken !== undefined) {
        const token = url.searchParams.get('token')
        if (token !== this.authToken) {
          ws.close(4001, 'Unauthorized')
          return
        }
      }

      const sessionId = url.searchParams.get('session')
      if (!sessionId) {
        ws.close(4002, 'Missing session parameter')
        return
      }

      // Register client for this session
      let clients = this.clients.get(sessionId)
      if (!clients) {
        clients = new Set()
        this.clients.set(sessionId, clients)
      }
      clients.add(ws)

      // Send current state on connect
      const components = this.state.getState(sessionId)
      if (components.length > 0) {
        ws.send(
          JSON.stringify({
            type: 'canvas:state',
            sessionId,
            components,
            timestampMs: Date.now(),
          } satisfies A2UIMessage),
        )
      }

      ws.on('message', (data) => {
        void this.handleClientMessage(sessionId, data.toString())
      })

      ws.on('close', () => {
        clients?.delete(ws)
        if (clients?.size === 0) {
          this.clients.delete(sessionId)
        }
      })
    })

    logger.info(
      '[canvas]',
      `Canvas server registered on ${opts.path ?? '/canvas'}`,
    )
  }

  /** Register a handler for UI actions (button clicks, form submits). */
  onAction(handler: ActionHandler): void {
    this.actionHandler = handler
  }

  /** Push components to a session (agent → UI). */
  push(sessionId: string, components: CanvasComponent[]): void {
    const msg = this.state.push(sessionId, components)
    this.broadcast(sessionId, msg)
  }

  /** Update a single component. */
  update(sessionId: string, component: CanvasComponent): void {
    const msg = this.state.update(sessionId, component)
    this.broadcast(sessionId, msg)
  }

  /** Remove a component. */
  remove(sessionId: string, componentId: string): void {
    const msg = this.state.remove(sessionId, componentId)
    this.broadcast(sessionId, msg)
  }

  /** Reset session canvas. */
  reset(sessionId: string): void {
    const msg = this.state.reset(sessionId)
    this.broadcast(sessionId, msg)
  }

  /** Get current state for a session. */
  getState(sessionId: string): CanvasComponent[] {
    return this.state.getState(sessionId)
  }

  /** Get the underlying state manager. */
  getStateManager(): CanvasStateManager {
    return this.state
  }

  close(): void {
    this.wss.close()
  }

  private broadcast(sessionId: string, msg: A2UIMessage): void {
    const clients = this.clients.get(sessionId)
    if (!clients) return

    const payload = JSON.stringify(msg)
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload)
      }
    }
  }

  private async handleClientMessage(
    sessionId: string,
    raw: string,
  ): Promise<void> {
    try {
      const msg = JSON.parse(raw) as A2UIMessage
      if (msg.type === 'canvas:action' && msg.action && this.actionHandler) {
        await this.actionHandler(
          sessionId,
          msg.action.componentId,
          msg.action.actionType,
          msg.action.data,
        )
      }
    } catch (err) {
      logger.warn(
        '[canvas]',
        `Invalid message: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
