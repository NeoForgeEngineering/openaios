import { resolve } from 'node:path'
import { loadConfig } from '@openaios/core'
import { BudgetManager } from '@openaios/budget'
import { SQLiteSessionStore } from '@openaios/router'
import { SecurityAuditor } from '../audit/auditor.js'

export async function auditCommand(options: { config?: string }): Promise<void> {
  const config = loadConfig(options.config)
  const dataDir = resolve(config.data.dir)

  let sessionStore: SQLiteSessionStore | undefined
  let budget: BudgetManager | undefined

  try {
    sessionStore = new SQLiteSessionStore(dataDir)
  } catch {
    // Session store may not be initialized yet — run static checks only
  }

  budget = new BudgetManager({
    dataDir,
    agentConfigs: config.budget?.agents ?? {},
    ...(config.budget?.period !== undefined && { period: config.budget.period }),
  })

  const auditor = new SecurityAuditor({
    config,
    sessionStore: sessionStore ?? makeFallbackStore(),
    budgetManager: budget,
  })

  const result = await auditor.run()
  budget.close()

  console.log('\n=== openAIOS Security Audit ===\n')
  console.log(`Timestamp: ${result.ts}`)
  console.log(`Checks:    ✓ ${result.passed} passed  ⚠ ${result.warned} warned  ✗ ${result.errors} errors\n`)

  if (result.findings.length === 0) {
    console.log('✓ All checks passed\n')
  } else {
    // Table header
    const col = (s: string, w: number) => s.padEnd(w).slice(0, w)
    console.log(col('SEV', 6) + col('AGENT', 16) + col('CODE', 32) + 'MESSAGE')
    console.log('-'.repeat(90))
    for (const f of result.findings) {
      console.log(col(f.severity, 6) + col(f.agentName, 16) + col(f.code, 32) + f.message)
    }
    console.log('')
  }

  process.exit(result.errors > 0 ? 1 : 0)
}

/** Fallback session store that returns empty results (used when DB doesn't exist yet). */
function makeFallbackStore() {
  return {
    async get() { return undefined },
    async set() {},
    async delete() {},
    async listByAgent() { return [] },
    async listAll() { return [] },
  }
}
