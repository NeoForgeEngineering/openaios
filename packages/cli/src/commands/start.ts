import { resolve, join } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { loadConfig } from '@openaios/core'
import { createRunner } from '@openaios/runner'
import { BudgetManager } from '@openaios/budget'
import { createGovernance } from '@openaios/governance'
import { RouterCore, SQLiteSessionStore, FileSessionStore } from '@openaios/router'
import { TelegramAdapter } from '@openaios/channels'
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
    period: config.budget?.period,
  })

  // Governance
  const agentPermissions = Object.fromEntries(
    config.agents.map((a) => [a.name, a.permissions])
  )
  const governance = createGovernance({
    agentPermissions,
    br: config.governance?.br,
  })

  // Build routes
  const providers = config.models?.providers ?? {}
  const routes: AgentRoute[] = []

  for (const agent of config.agents) {
    const systemPrompt = resolvePersona(agent.persona)
    const runner = createRunner(agent.model.default, providers, agent.runner)

    // Wire channels
    if (agent.channels.telegram) {
      const adapter = new TelegramAdapter(agent.channels.telegram.token)
      routes.push({
        agentName: agent.name,
        systemPrompt,
        defaultModel: agent.model.default,
        premiumModel: agent.model.premium,
        allowedTools: agent.permissions.allow,
        deniedTools: agent.permissions.deny,
        runner,
        channel: adapter,
      })
      console.log(`[openaios] Agent "${agent.name}" → Telegram`)
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
  })

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[openaios] Received ${signal}, shutting down...`)
    await router.stop()
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
