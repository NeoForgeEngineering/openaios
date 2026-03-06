import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import type { Config } from '@openaios/core'
import { logger } from '@openaios/core'
import type { SessionStore } from '@openaios/core'
import type { BudgetManager } from '@openaios/budget'
import type { AuditResult } from '../audit/auditor.js'
import { DASHBOARD_HTML } from './html.js'

export interface DashboardServerOptions {
  server: Server
  sessionStore: SessionStore
  budgetManager: BudgetManager
  config: Config
  /** Map of agentName → defaultModel */
  agentModels: Map<string, string>
}

const startTime = Date.now()

export class DashboardServer {
  private readonly opts: DashboardServerOptions
  private lastAuditResult: AuditResult | null = null
  private readonly sseClients = new Set<ServerResponse>()

  constructor(opts: DashboardServerOptions) {
    this.opts = opts
  }

  setAuditResult(result: AuditResult): void {
    this.lastAuditResult = result
  }

  register(): void {
    this.opts.server.on('request', (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/'
      if (url === '/' || url.startsWith('/api/')) {
        void this.handleRequest(req, res)
      }
    })
    logger.info('[dashboard]', `Routes registered`)
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/'

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(DASHBOARD_HTML)
      return
    }

    if (url === '/api/status') {
      await this.handleStatus(res)
      return
    }

    if (url === '/api/sessions') {
      await this.handleSessions(res)
      return
    }

    if (url === '/api/budget') {
      this.handleBudget(res)
      return
    }

    if (url === '/api/logs') {
      this.handleLogs(res)
      return
    }

    if (url === '/api/events') {
      this.handleEvents(req, res)
      return
    }

    if (url === '/api/audit') {
      this.handleAudit(res)
      return
    }

    res.writeHead(404).end('Not found')
  }

  private async handleStatus(res: ServerResponse): Promise<void> {
    const { config, sessionStore, budgetManager, agentModels } = this.opts
    const uptime = Math.floor((Date.now() - startTime) / 1000)

    const agentModelsRecord = Object.fromEntries(agentModels)
    const budgetStatuses = budgetManager.allStatuses(agentModelsRecord)
    const budgetByAgent = new Map(budgetStatuses.map((s) => [s.agentName, s]))

    const agents = await Promise.all(
      config.agents.map(async (a) => {
        const sessions = await sessionStore.listByAgent(a.name)
        const bs = budgetByAgent.get(a.name)
        return {
          name: a.name,
          model: a.model.default,
          runnerMode: a.runner.mode,
          sessionCount: sessions.length,
          ...(bs && {
            budget: {
              spentUsd: bs.spentUsd,
              limitUsd: bs.limitUsd,
              fraction: bs.fraction,
              isWarning: bs.isWarning,
            },
          }),
        }
      })
    )

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ agents, uptime }))
  }

  private async handleSessions(res: ServerResponse): Promise<void> {
    const sessions = await this.opts.sessionStore.listAll()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ sessions }))
  }

  private handleBudget(res: ServerResponse): void {
    const agentModelsRecord = Object.fromEntries(this.opts.agentModels)
    const statuses = this.opts.budgetManager.allStatuses(agentModelsRecord)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ statuses }))
  }

  private handleLogs(res: ServerResponse): void {
    const entries = logger.getRecent()
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ entries }))
  }

  private handleEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(':\n\n') // initial comment to establish connection

    this.sseClients.add(res)

    const unsubscribe = logger.subscribe((entry) => {
      try {
        res.write(`data: ${JSON.stringify(entry)}\n\n`)
      } catch {
        // client disconnected
      }
    })

    req.on('close', () => {
      this.sseClients.delete(res)
      unsubscribe()
    })
  }

  private handleAudit(res: ServerResponse): void {
    if (!this.lastAuditResult) {
      res.writeHead(204).end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(this.lastAuditResult))
  }
}
