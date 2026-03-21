import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { join } from 'node:path'
import type { BudgetManager } from '@openaios/budget'
import type { Config, SessionStore } from '@openaios/core'
import { logger } from '@openaios/core'
import type { AuditResult } from '../audit/auditor.js'
import { CHAT_HTML } from './chat-html.js'
import { CONFIG_HTML } from './config-html.js'
import type { AgentPatch } from './config-writer.js'
import { patchAgentInConfig } from './config-writer.js'
import { DASHBOARD_HTML } from './html.js'
import { LIVE_HTML } from './live-html.js'

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
  /** Router event emitter for live flow visualization */
  routerEvents?: import('node:events').EventEmitter
  /** Role registry for role-based config */
  // biome-ignore lint/suspicious/noExplicitAny: role objects serialized to JSON
  roleRegistry?: { list(): any[] }
  /** Observability collector */
  // biome-ignore lint/suspicious/noExplicitAny: collector methods return various shapes
  collector?: {
    getAllMetrics(opts?: any): any[]
    getRecentTurns(opts?: any): any[]
    getChatHistory(agent: string, session: string, opts?: any): any[]
  }
  /** Admin token for API authentication */
  adminToken?: string
}

const startTime = Date.now()
const MAX_BODY_BYTES = 1_048_576 // 1MB

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
    this.opts.server.on(
      'request',
      (req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? '/'
        if (
          url === '/' ||
          url === '/chat' ||
          url === '/config' ||
          url === '/live' ||
          url.startsWith('/api/')
        ) {
          void this.handleRequest(req, res)
        }
      },
    )
    logger.info('[dashboard]', `Routes registered`)
  }

  private setCorsHeaders(res: ServerResponse): void {
    // Block all cross-origin requests
    res.setHeader('Access-Control-Allow-Origin', 'null')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
  }

  private checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
    const token = this.opts.adminToken
    if (!token) return true // no token configured = no auth (localhost dev)

    // Check Authorization header or ?token= query param
    const auth = req.headers.authorization
    if (auth === `Bearer ${token}`) return true

    const url = new URL(
      req.url ?? '/',
      `http://${req.headers.host ?? 'localhost'}`,
    )
    if (url.searchParams.get('token') === token) return true

    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        error: 'Unauthorized — set Authorization: Bearer <admin_token>',
      }),
    )
    return false
  }

  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    this.setCorsHeaders(res)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    const url = req.url ?? '/'

    // Auth required for API endpoints and config/live pages
    if (url.startsWith('/api/') || url === '/config' || url === '/live') {
      if (!this.checkAuth(req, res)) return
    }

    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(DASHBOARD_HTML)
      return
    }

    if (url === '/live') {
      const agents = this.opts.config.agents.map((a) => {
        // Derive the actual provider for display
        let provider: string = a.runner.llm
        if (a.runner.env === 'external' && a.runner.external?.base_url) {
          // Extract provider name from base URL (e.g. router.requesty.ai → requesty)
          try {
            const host = new URL(a.runner.external.base_url).hostname
            const parts = host.split('.')
            provider = parts.length >= 2 ? parts[parts.length - 2]! : host
          } catch {
            provider = 'external'
          }
        }
        return {
          name: a.name,
          channels: Object.keys(a.channels).filter(
            (k) =>
              k !== 'group_routing' &&
              k !== 'dm_allowlist' &&
              (a.channels as Record<string, unknown>)[k],
          ),
          model: a.model.default,
          runner: a.runner.env,
          llm: provider,
        }
      })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(LIVE_HTML(agents))
      return
    }

    if (url === '/api/metrics' && req.method === 'GET') {
      const metrics = this.opts.collector?.getAllMetrics() ?? []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ metrics }))
      return
    }

    if (url === '/api/turns' && req.method === 'GET') {
      const turns = this.opts.collector?.getRecentTurns({ limit: 50 }) ?? []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ turns }))
      return
    }

    const chatMatch = url.match(/^\/api\/chat-history\/([^/]+)\/(.+)$/)
    if (chatMatch && req.method === 'GET') {
      const history =
        this.opts.collector?.getChatHistory(chatMatch[1]!, chatMatch[2]!, {
          limit: 100,
        }) ?? []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ messages: history }))
      return
    }

    if (url === '/api/roles' && req.method === 'GET') {
      this.handleRoles(res)
      return
    }

    const modelsMatch = url.match(/^\/api\/models\/(.+)$/)
    if (modelsMatch && req.method === 'GET') {
      await this.handleModels(req, res, modelsMatch[1] ?? '')
      return
    }

    if (url === '/api/flow') {
      this.handleFlowEvents(req, res)
      return
    }

    if (url === '/chat') {
      const html = CHAT_HTML(
        this.opts.config.agents
          .filter((a) => a.channels.webhook !== undefined)
          .map((a) => ({
            name: a.name,
            webhookPath: a.channels.webhook?.path,
          })),
      )
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    if (url === '/config') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(CONFIG_HTML)
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
      // Unified config endpoint — returns the full config
      this.handleFullConfig(res)
      return
    }

    if (url === '/api/skills') {
      this.handleSkills(res)
      return
    }

    const patchMatch = url.match(/^\/api\/config\/agents\/([^/]+)$/)
    if (patchMatch && req.method === 'PATCH') {
      await this.handleAgentPatch(req, res, patchMatch[1] ?? '')
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
          runnerEnv: a.runner.env,
          runnerLlm: a.runner.llm,
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
      }),
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
      Connection: 'keep-alive',
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
          const firstLine =
            content.split('\n').find((l) => l.trim().length > 0) ?? ''
          skills.push({
            name,
            description: firstLine.replace(/^#+\s*/, '').trim(),
          })
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
    agentName: string,
  ): Promise<void> {
    let body = ''
    req.setEncoding('utf-8')
    let oversized = false
    await new Promise<void>((resolve) => {
      req.on('data', (chunk: string) => {
        body += chunk
        if (body.length > MAX_BODY_BYTES) {
          oversized = true
          req.destroy()
          resolve()
        }
      })
      req.on('end', resolve)
    })
    if (oversized) {
      res.writeHead(413).end('Body too large')
      return
    }

    let parsed: {
      persona?: string
      model?: { default: string; premium?: string }
      skills?: string[]
      capabilities?: { browser?: boolean }
      permissions?: { allow?: string[]; deny?: string[] }
      channels?: Record<string, unknown>
    }
    try {
      parsed = JSON.parse(body) as typeof parsed
    } catch {
      res.writeHead(400).end('Invalid JSON')
      return
    }

    const patch: AgentPatch = {}
    if (parsed.persona !== undefined) patch.persona = parsed.persona
    if (parsed.model !== undefined) patch.model = parsed.model
    if (parsed.skills !== undefined) patch.skills = parsed.skills
    if (parsed.capabilities?.browser !== undefined)
      patch.browser = parsed.capabilities.browser
    if (parsed.permissions?.allow !== undefined)
      patch.allowedTools = parsed.permissions.allow
    if (parsed.permissions?.deny !== undefined)
      patch.deniedTools = parsed.permissions.deny
    if (parsed.channels !== undefined) {
      const ch = parsed.channels as NonNullable<AgentPatch['channels']>
      patch.channels = ch
    }

    try {
      patchAgentInConfig(this.opts.configPath, agentName, patch)
      this.opts.onAgentUpdate(agentName, patch)
      // Update our local config snapshot so GET /api/config reflects latest
      const agent = this.opts.config.agents.find((a) => a.name === agentName)
      if (agent) {
        if (patch.persona !== undefined) agent.persona = patch.persona
        if (patch.skills !== undefined) agent.skills = patch.skills
        if (patch.allowedTools !== undefined)
          agent.permissions.allow = patch.allowedTools
        if (patch.deniedTools !== undefined)
          agent.permissions.deny = patch.deniedTools
        if (patch.browser !== undefined)
          agent.capabilities.browser = patch.browser
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

  private handleFullConfig(res: ServerResponse): void {
    const { config } = this.opts
    const agents = config.agents.map((a) => ({
      name: a.name,
      persona: a.persona,
      model: a.model,
      channels: a.channels,
      permissions: a.permissions,
      runner: { env: a.runner.env, llm: a.runner.llm },
      capabilities: a.capabilities,
      skills: a.skills,
    }))
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify({
        agents,
        network: config.network,
        memory: config.memory,
        tools: config.tools,
        voice: config.voice,
        automation: config.automation,
        gateway: config.gateway,
      }),
    )
  }

  private handleRoles(res: ServerResponse): void {
    const roles = this.opts.roleRegistry?.list() ?? []
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ roles }))
  }

  private async handleModels(
    _req: IncomingMessage,
    res: ServerResponse,
    provider: string,
  ): Promise<void> {
    // Provider → base URL + auth for model discovery
    const PROVIDER_URLS: Record<string, { url: string; keyEnv?: string }> = {
      'anthropic-api': { url: 'https://api.anthropic.com' },
      'openai-api': {
        url: 'https://api.openai.com/v1',
        keyEnv: 'OPENAI_API_KEY',
      },
      ollama: { url: 'http://localhost:11434' },
      requesty: {
        url: 'https://router.requesty.ai/v1',
        keyEnv: 'REQUESTY_API_KEY',
      },
      openrouter: {
        url: 'https://openrouter.ai/api/v1',
        keyEnv: 'OPENROUTER_API_KEY',
      },
    }

    const provConfig = PROVIDER_URLS[provider]

    // Claude Code — ask the CLI for available models
    if (provider === 'claude-code') {
      try {
        const { execFile } = await import('node:child_process')
        const { promisify } = await import('node:util')
        const execAsync = promisify(execFile)
        const { stdout } = await execAsync(
          'claude',
          [
            '-p',
            'List all currently available Claude model IDs with their display names. Output as JSON array: [{"id":"model-id","name":"Display Name"}]. Only the JSON, nothing else.',
            '--output-format',
            'text',
          ],
          { timeout: 15_000 },
        )

        // Parse the JSON from Claude's response
        const jsonMatch = stdout.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const models = JSON.parse(jsonMatch[0]) as Array<{
            id: string
            name: string
          }>
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ models }))
          return
        }
      } catch {
        // Fall through to static list
      }
    }

    // Anthropic API — try the /v1/models endpoint, fall back to static
    if (provider === 'claude-code' || provider === 'anthropic-api') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (apiKey) {
        try {
          const r = await fetch('https://api.anthropic.com/v1/models', {
            headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
            signal: AbortSignal.timeout(5000),
          })
          if (r.ok) {
            const data = (await r.json()) as {
              data?: Array<{ id: string; display_name?: string }>
            }
            if (data.data && data.data.length > 0) {
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  models: data.data.map((m) => ({
                    id: m.id,
                    name: m.display_name ?? m.id,
                  })),
                }),
              )
              return
            }
          }
        } catch {
          // Fall through to static
        }
      }

      // Static fallback
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          models: [
            { id: 'claude-opus-4-6-20250514', name: 'Claude Opus 4.6' },
            { id: 'claude-sonnet-4-6-20250514', name: 'Claude Sonnet 4.6' },
            { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
            { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
          ],
        }),
      )
      return
    }

    if (!provConfig) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: `Unknown provider: ${provider}` }))
      return
    }

    try {
      const apiKey = provConfig.keyEnv
        ? process.env[provConfig.keyEnv]
        : undefined
      const headers: Record<string, string> = {}
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`

      // Ollama uses /api/tags, everything else uses /models (OpenAI-compat)
      let models: Array<{ id: string; name: string }> = []

      if (provider === 'ollama') {
        const r = await fetch(`${provConfig.url}/api/tags`, {
          headers,
          signal: AbortSignal.timeout(5000),
        })
        if (r.ok) {
          const data = (await r.json()) as { models?: Array<{ name: string }> }
          models = (data.models ?? []).map((m) => ({
            id: m.name,
            name: m.name,
          }))
        }
      } else {
        const r = await fetch(`${provConfig.url}/models`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        })
        if (r.ok) {
          const data = (await r.json()) as {
            data?: Array<{ id: string; name?: string }>
          }
          models = (data.data ?? []).map((m) => ({
            id: m.id,
            name: m.name ?? m.id,
          }))
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models }))
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models: [], error: String(err) }))
    }
  }

  private handleFlowEvents(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(':\n\n')

    const emitter = this.opts.routerEvents
    if (!emitter) {
      res.write(
        'data: {"type":"error","message":"No router events available"}\n\n',
      )
      return
    }

    const handler = (event: unknown) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
      } catch {
        // client disconnected
      }
    }

    emitter.on('turn', handler)

    req.on('close', () => {
      emitter.off('turn', handler)
    })
  }
}
