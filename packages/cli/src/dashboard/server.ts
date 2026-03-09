import type { Server, IncomingMessage, ServerResponse } from 'node:http'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '@openaios/core'
import { logger } from '@openaios/core'
import type { SessionStore } from '@openaios/core'
import type { BudgetManager } from '@openaios/budget'
import type { AuditResult } from '../audit/auditor.js'
import { DASHBOARD_HTML } from './html.js'
import { patchAgentInConfig } from './config-writer.js'
import type { AgentPatch } from './config-writer.js'

export interface DashboardServerOptions {
  server: Server
  sessionStore: SessionStore
  budgetManager: BudgetManager
  config: Config
  /** Map of agentName → defaultModel */
  agentModels: Map<string, string>
  /** Absolute path to config file (for hot-reload) */
  configPath: string
  /** Directory containing skill subdirectories */
  skillsDir: string
  /** Called after config file is patched — updates live routes */
  onAgentUpdate: (agentName: string, patch: AgentPatch) => void
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

    if (url === '/api/config') {
      this.handleConfig(res)
      return
    }

    if (url === '/api/skills') {
      this.handleSkills(res)
      return
    }

    const patchMatch = url.match(/^\/api\/config\/agents\/([^/]+)$/)
    if (patchMatch && req.method === 'PATCH') {
      await this.handleAgentPatch(req, res, patchMatch[1]!)
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

  private handleConfig(res: ServerResponse): void {
    const { config } = this.opts
    const agents = config.agents.map((a) => ({
      name: a.name,
      persona: a.persona,
      skills: a.skills,
      capabilities: a.capabilities,
      permissions: a.permissions,
    }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ agents }))
  }

  private handleSkills(res: ServerResponse): void {
    const { skillsDir } = this.opts
    const skills: { name: string; description: string }[] = []
    try {
      const entries = readdirSync(skillsDir)
      for (const name of entries) {
        const skillMd = join(skillsDir, name, 'SKILL.md')
        try {
          const stat = statSync(join(skillsDir, name))
          if (!stat.isDirectory()) continue
          const content = readFileSync(skillMd, 'utf-8')
          const firstLine = content.split('\n').find((l) => l.trim().length > 0) ?? ''
          skills.push({ name, description: firstLine.replace(/^#+\s*/, '').trim() })
        } catch {
          // skip
        }
      }
    } catch {
      // skills dir doesn't exist yet
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ skills }))
  }

  private async handleAgentPatch(
    req: IncomingMessage,
    res: ServerResponse,
    agentName: string
  ): Promise<void> {
    let body = ''
    req.setEncoding('utf-8')
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: string) => { body += chunk })
      req.on('end', resolve)
    })

    let parsed: {
      persona?: string
      skills?: string[]
      capabilities?: { browser?: boolean }
      permissions?: { allow?: string[]; deny?: string[] }
    }
    try {
      parsed = JSON.parse(body) as typeof parsed
    } catch {
      res.writeHead(400).end('Invalid JSON')
      return
    }

    const patch: AgentPatch = {
      ...(parsed.persona !== undefined && { persona: parsed.persona }),
      ...(parsed.skills !== undefined && { skills: parsed.skills }),
      ...(parsed.capabilities?.browser !== undefined && { browser: parsed.capabilities.browser }),
      ...(parsed.permissions?.allow !== undefined && { allowedTools: parsed.permissions.allow }),
      ...(parsed.permissions?.deny !== undefined && { deniedTools: parsed.permissions.deny }),
    }

    try {
      patchAgentInConfig(this.opts.configPath, agentName, patch)
      this.opts.onAgentUpdate(agentName, patch)
      // Update our local config snapshot so GET /api/config reflects latest
      const agent = this.opts.config.agents.find((a) => a.name === agentName)
      if (agent) {
        if (patch.persona !== undefined) agent.persona = patch.persona
        if (patch.skills !== undefined) agent.skills = patch.skills
        if (patch.allowedTools !== undefined) agent.permissions.allow = patch.allowedTools
        if (patch.deniedTools !== undefined) agent.permissions.deny = patch.deniedTools
        if (patch.browser !== undefined) agent.capabilities.browser = patch.browser
      }
      res.writeHead(204).end()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.error('[dashboard]', `Agent patch failed: ${msg}`)
      res.writeHead(500).end(msg)
    }
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
