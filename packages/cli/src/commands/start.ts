import { resolve, join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AgentBusRequest, AgentBusResponse } from '@openaios/core'
import { loadConfig, logger } from '@openaios/core'
import { createRunner, ContainerOrchestrator, CapabilityProvisioner } from '@openaios/runner'
import { BudgetManager } from '@openaios/budget'
import { createGovernance } from '@openaios/governance'
import { RouterCore, SQLiteSessionStore, AgentBus } from '@openaios/router'
import { TelegramAdapter, WebhookAdapter } from '@openaios/channels'
import type { AgentRoute } from '@openaios/router'
import { DashboardServer } from '../dashboard/server.js'
import { SecurityAuditor } from '../audit/auditor.js'
import { patchAgentInConfig } from '../dashboard/config-writer.js'
import type { AgentPatch } from '../dashboard/config-writer.js'

export async function startCommand(options: { config?: string; dataDir?: string }): Promise<void> {
  const configPath = resolve(options.config ?? process.env['OPENAIOS_CONFIG'] ?? 'openAIOS.yml')
  const config = loadConfig(configPath)

  const dataDir = resolve(options.dataDir ?? config.data.dir)
  const workspacesDir = join(dataDir, '..', 'workspaces')
  const memoryDir = resolve(config.memory.dir)

  logger.info('[openaios]', `Starting with config: ${configPath}`)
  logger.info('[openaios]', `Data dir: ${dataDir}`)

  // Ensure memory directory exists
  mkdirSync(memoryDir, { recursive: true })
  logger.info('[openaios]', `Shared memory dir: ${memoryDir}`)

  // Session store
  const sessionStore = new SQLiteSessionStore(dataDir)

  // Budget manager
  const budget = new BudgetManager({
    dataDir,
    agentConfigs: config.budget?.agents ?? {},
    ...(config.budget?.period !== undefined && { period: config.budget.period }),
  })

  // Governance
  const agentPermissions = Object.fromEntries(
    config.agents.map((a) => [a.name, a.permissions])
  )
  const governance = createGovernance({
    agentPermissions,
    ...(config.governance?.br !== undefined && {
      br: {
        url: config.governance.br.url,
        token: config.governance.br.token,
        failSecure: config.governance.br.fail_secure,
      },
    }),
  })

  // Detect if any agent needs docker mode
  const hasDockerAgents = config.agents.some((a) => a.runner.mode === 'docker')

  // --- Shared HTTP server (dashboard + webhook channels) ---
  const httpServer = createServer()

  await new Promise<void>((resolve, reject) => {
    httpServer.listen(config.network.port, () => {
      logger.info('[openaios]', `HTTP server listening on port ${config.network.port}`)
      resolve()
    })
    httpServer.on('error', reject)
  })

  // --- Bus HTTP server ---
  const busToken = randomUUID()
  let busPort = 0
  const bus = new AgentBus({ governance, sessionStore, budget })

  const busServer = createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/internal/bus/message') {
      res.writeHead(404).end('Not found')
      return
    }

    const auth = req.headers['authorization']
    if (auth !== `Bearer ${busToken}`) {
      res.writeHead(401).end('Unauthorized')
      return
    }

    let body = ''
    req.setEncoding('utf-8')
    req.on('data', (chunk: string) => { body += chunk })
    req.on('end', () => {
      let parsed: AgentBusRequest
      try {
        parsed = JSON.parse(body) as AgentBusRequest
      } catch {
        res.writeHead(400).end('Invalid JSON')
        return
      }

      bus.request(parsed).then((result: AgentBusResponse) => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(result))
      }).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: message }))
      })
    })
  })

  await new Promise<void>((resolve) => {
    const desiredPort = config.network.bus_port ?? 0
    busServer.listen(desiredPort, '127.0.0.1', () => {
      const addr = busServer.address()
      busPort = typeof addr === 'object' && addr !== null ? addr.port : desiredPort
      resolve()
    })
  })

  const busUrl = `http://127.0.0.1:${busPort}`
  logger.info('[openaios]', `Agent bus listening on ${busUrl}`)

  // --- Container orchestration ---
  let orchestrator: ContainerOrchestrator | undefined
  let provisioner: CapabilityProvisioner | undefined

  if (hasDockerAgents) {
    orchestrator = new ContainerOrchestrator({ busUrl, busToken })
    provisioner = new CapabilityProvisioner(orchestrator)

    // Start containers for all docker-mode agents up front
    for (const agent of config.agents) {
      if (agent.runner.mode === 'docker') {
        await orchestrator.ensureRunning(agent.name, agent.runner.docker)
      }
    }
  }

  // Provision capabilities for all agents
  if (provisioner) {
    for (const agent of config.agents) {
      if (agent.runner.mode === 'docker') {
        await provisioner.provision(agent.name, agent.capabilities)
      }
    }
  }

  // Memory system prompt suffix
  const memoryPromptSuffix = [
    '',
    `Your shared memory directory is at ${memoryDir} (or /workspace/memory in docker mode).`,
    'Use Read/Write/Grep tools on .md files there to store and recall information across sessions.',
  ].join('\n')

  // Skills dir (resolve ~ to home directory)
  const skillsDir = config.skills.dir.replace(/^~/, homedir())

  // Build routes
  const providers = config.models?.providers ?? {}
  const routes: AgentRoute[] = []
  const agentModels = new Map<string, string>()
  const runnersByAgent = new Map<string, import('@openaios/core').RunnerAdapter>()

  for (const agent of config.agents) {
    const basePersona = resolvePersona(agent.persona)

    // Load skill content into system prompt
    const skillsSuffix = agent.skills
      .map((skillName) => {
        const skillPath = join(skillsDir, skillName, 'SKILL.md')
        try {
          return '\n\n' + readFileSync(skillPath, 'utf-8')
        } catch {
          logger.warn('[openaios]', `Skill "${skillName}" not found at ${skillPath}`)
          return ''
        }
      })
      .join('')

    const systemPrompt = basePersona + memoryPromptSuffix + skillsSuffix
    const runner = createRunner(agent.model.default, providers, agent.runner, {
      ...(orchestrator !== undefined && { orchestrator }),
      agentName: agent.name,
    })

    agentModels.set(agent.name, agent.model.default)
    runnersByAgent.set(agent.name, runner)

    // Auto-add call_agent to allowedTools when agent-calls is configured
    const agentCallsTools =
      agent.capabilities['agent-calls'].length > 0 ? ['call_agent'] : []

    // Auto-add Bash(agent-browser:*) for native agents with browser capability
    const browserTools =
      agent.capabilities.browser && agent.runner.mode === 'native'
        ? ['Bash(agent-browser:*)']
        : []

    const allowedTools = [...agent.permissions.allow, ...agentCallsTools, ...browserTools]

    // Register on the bus regardless of runner mode
    bus.register(agent.name, {
      runner,
      systemPrompt,
      defaultModel: agent.model.default,
      allowedTools,
      deniedTools: agent.permissions.deny,
      workspacesDir,
      allowedCallees: agent.capabilities['agent-calls'],
    })

    // Wire channels
    if (agent.channels.telegram) {
      const adapter = new TelegramAdapter(agent.channels.telegram.token)
      routes.push({
        agentName: agent.name,
        systemPrompt,
        defaultModel: agent.model.default,
        ...(agent.model.premium !== undefined && { premiumModel: agent.model.premium }),
        allowedTools,
        deniedTools: agent.permissions.deny,
        runner,
        channel: adapter,
      })
      logger.info('[openaios]', `Agent "${agent.name}" → Telegram`)
    }

    if (agent.channels.webhook) {
      const adapter = new WebhookAdapter({
        server: httpServer,
        path: agent.channels.webhook.path,
        ...(agent.channels.webhook.secret !== undefined && { secret: agent.channels.webhook.secret }),
      })
      routes.push({
        agentName: agent.name,
        systemPrompt,
        defaultModel: agent.model.default,
        ...(agent.model.premium !== undefined && { premiumModel: agent.model.premium }),
        allowedTools,
        deniedTools: agent.permissions.deny,
        runner,
        channel: adapter,
      })
      logger.info('[openaios]', `Agent "${agent.name}" → Webhook (${agent.channels.webhook.path})`)
    }

    if (!agent.channels.telegram && !agent.channels.discord && !agent.channels.webhook) {
      logger.warn('[openaios]', `Agent "${agent.name}" has no channels configured — skipping`)
    }
  }

  if (routes.length === 0) {
    throw new Error('No agents with configured channels found. Check your openAIOS.yml.')
  }

  const router = new RouterCore({
    routes,
    sessionStore,
    governance,
    budget,
    workspacesDir,
    bus,
  })

  const onAgentUpdate = (agentName: string, patch: AgentPatch): void => {
    patchAgentInConfig(configPath, agentName, patch)

    const freshConfig = loadConfig(configPath)
    const agentCfg = freshConfig.agents.find((a) => a.name === agentName)
    if (!agentCfg) return

    const basePersona = resolvePersona(agentCfg.persona)
    const skillsSuffix = agentCfg.skills
      .map((skillName) => {
        const skillPath = join(skillsDir, skillName, 'SKILL.md')
        try { return '\n\n' + readFileSync(skillPath, 'utf-8') } catch { return '' }
      })
      .join('')
    const systemPrompt = basePersona + memoryPromptSuffix + skillsSuffix
    const agentCallsTools = agentCfg.capabilities['agent-calls'].length > 0 ? ['call_agent'] : []
    const browserTools =
      agentCfg.capabilities.browser && agentCfg.runner.mode === 'native'
        ? ['Bash(agent-browser:*)'] : []
    const allowedTools = [...agentCfg.permissions.allow, ...agentCallsTools, ...browserTools]

    router.updateRoute(agentName, { systemPrompt, allowedTools, deniedTools: agentCfg.permissions.deny })

    const existingRunner = runnersByAgent.get(agentName)
    if (existingRunner) {
      bus.register(agentName, {
        runner: existingRunner,
        systemPrompt,
        defaultModel: agentCfg.model.default,
        allowedTools,
        deniedTools: agentCfg.permissions.deny,
        workspacesDir,
        allowedCallees: agentCfg.capabilities['agent-calls'],
      })
    }
    logger.info('[openaios]', `Hot-reloaded agent "${agentName}"`)
  }

  // --- Dashboard ---
  const dashboardServer = new DashboardServer({
    server: httpServer,
    sessionStore,
    budgetManager: budget,
    config,
    agentModels,
    configPath,
    skillsDir,
    onAgentUpdate,
  })
  dashboardServer.register()

  // --- Security auditor ---
  const auditor = new SecurityAuditor({ config, sessionStore, budgetManager: budget })
  const runAudit = async () => {
    const result = await auditor.run()
    dashboardServer.setAuditResult(result)
    for (const finding of result.findings) {
      if (finding.severity === 'ERROR') {
        logger.error('[audit]', `${finding.agentName} ${finding.code}: ${finding.message}`)
      } else if (finding.severity === 'WARN') {
        logger.warn('[audit]', `${finding.agentName} ${finding.code}: ${finding.message}`)
      } else {
        logger.info('[audit]', `${finding.agentName} ${finding.code}: ${finding.message}`)
      }
    }
  }
  await runAudit()
  const auditInterval = setInterval(() => { void runAudit() }, 30 * 60 * 1000)

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info('[openaios]', `Received ${signal}, shutting down...`)
    clearInterval(auditInterval)
    await router.stop()
    busServer.close()
    httpServer.close()
    if (provisioner) await provisioner.deprovisionAll()
    if (orchestrator) await orchestrator.stopAll()
    budget.close()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  await router.start()
  logger.info('[openaios]', `Dashboard available at http://localhost:${config.network.port}`)
  logger.info('[openaios]', 'Running. Press Ctrl+C to stop.')
}

function resolvePersona(persona: string): string {
  // If it looks like a file path, try to read it
  if (persona.endsWith('.md') || persona.endsWith('.txt')) {
    const path = resolve(persona)
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8')
    }
    logger.warn('[openaios]', `Persona file not found: ${path} — using as inline string`)
  }
  return persona
}
