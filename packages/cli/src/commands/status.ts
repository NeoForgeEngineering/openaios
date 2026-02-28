import { resolve } from 'node:path'
import { loadConfig } from '@openaios/core'
import { BudgetManager } from '@openaios/budget'
import { SQLiteSessionStore } from '@openaios/router'
import { createRunner } from '@openaios/runner'

export async function statusCommand(options: { config?: string }): Promise<void> {
  const config = loadConfig(options.config)
  const dataDir = resolve(config.data.dir)
  const providers = config.models?.providers ?? {}

  console.log('\n=== openAIOS Status ===\n')

  // Runner health checks
  console.log('Runners:')
  for (const agent of config.agents) {
    try {
      const runner = createRunner(agent.model.default, providers, agent.runner)
      const healthy = await runner.healthCheck()
      const icon = healthy ? '✓' : '✗'
      console.log(`  ${icon} ${agent.name} (${agent.model.default}) — ${healthy ? 'healthy' : 'UNREACHABLE'}`)
    } catch (err) {
      console.log(`  ✗ ${agent.name} — error: ${(err as Error).message}`)
    }
  }

  // Session counts
  console.log('\nSessions:')
  try {
    const sessionStore = new SQLiteSessionStore(dataDir)
    for (const agent of config.agents) {
      const sessions = await sessionStore.listByAgent(agent.name)
      console.log(`  ${agent.name}: ${sessions.length} active session(s)`)
    }
  } catch {
    console.log('  (session store not initialised — start the runtime first)')
  }

  // Budget status
  if (config.budget) {
    console.log('\nBudget:')
    const budget = new BudgetManager({
      dataDir,
      agentConfigs: config.budget.agents,
      period: config.budget.period,
    })

    const agentModels = Object.fromEntries(
      config.agents.map((a) => [a.name, a.model.default])
    )

    const statuses = budget.allStatuses(agentModels)
    for (const s of statuses) {
      const pct = (s.fraction * 100).toFixed(1)
      const warn = s.isExceeded ? ' [EXCEEDED]' : s.isWarning ? ' [WARNING]' : ''
      console.log(
        `  ${s.agentName}: $${s.spentUsd.toFixed(4)} / $${s.limitUsd.toFixed(2)} (${pct}%)${warn}`
      )
    }
    budget.close()
  }

  console.log('')
}
