import { resolve, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AgentBusRequest, AgentBusResponse } from '@openaios/core'
import { loadConfig } from '@openaios/core'
import { createRunner, ContainerOrchestrator, CapabilityProvisioner } from '@openaios/runner'
import { BudgetManager } from '@openaios/budget'
import { createGovernance } from '@openaios/governance'
import { RouterCore, SQLiteSessionStore, AgentBus } from '@openaios/router'
import { TelegramAdapter, WebhookAdapter } from '@openaios/channels'
import type { AgentRoute } from '@openaios/router'

export async function startCommand(options: { config?: string; dataDir?: string }): Promise<void> {
  const config = loadConfig(options.config)

  const dataDir = resolve(options.dataDir ?? config.data.dir)
  const workspacesDir = join(dataDir, '..', 'workspaces')

  console.log(`[openaios] Starting with config: ${options.config ?? 'openAIOS.yml'}`)
  console.log(`[openaios] Data dir: ${dataDir}`)

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

  // --- Shared HTTP server (webhook channels) ---
  const httpServer = createServer()
  const hasWebhookAgents = config.agents.some((a) => a.channels.webhook)

  if (hasWebhookAgents) {
    await new Promise<void>((resolve, reject) => {
      httpServer.listen(config.network.port, () => {
        console.log(`[openaios] HTTP server listening on port ${config.network.port}`)
        resolve()
      })
      httpServer.on('error', reject)
    })
  }

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
  console.log(`[openaios] Agent bus listening on ${busUrl}`)

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

  // Build routes
  const providers = config.models?.providers ?? {}
  const routes: AgentRoute[] = []

  for (const agent of config.agents) {
    const systemPrompt = resolvePersona(agent.persona)
    const runner = createRunner(agent.model.default, providers, agent.runner, {
      ...(orchestrator !== undefined && { orchestrator }),
      agentName: agent.name,
    })

    // Auto-add call_agent to allowedTools when agent-calls is configured
    const agentCallsTools =
      agent.capabilities['agent-calls'].length > 0 ? ['call_agent'] : []

    const allowedTools = [...agent.permissions.allow, ...agentCallsTools]

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
      console.log(`[openaios] Agent "${agent.name}" → Telegram`)
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
      console.log(`[openaios] Agent "${agent.name}" → Webhook (${agent.channels.webhook.path})`)
    }

    if (!agent.channels.telegram && !agent.channels.discord && !agent.channels.webhook) {
      console.warn(`[openaios] Agent "${agent.name}" has no channels configured — skipping`)
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

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[openaios] Received ${signal}, shutting down...`)
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
  console.log('[openaios] Running. Press Ctrl+C to stop.')
}

function resolvePersona(persona: string): string {
  // If it looks like a file path, try to read it
  if (persona.endsWith('.md') || persona.endsWith('.txt')) {
    const path = resolve(persona)
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8')
    }
    console.warn(`[openaios] Persona file not found: ${path} — using as inline string`)
  }
  return persona
}
