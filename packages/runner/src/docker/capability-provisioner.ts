import { spawn } from 'node:child_process'
import type { AgentCapabilities } from '@openaios/core'
import { logger } from '@openaios/core'
import type { ContainerOrchestrator } from './orchestrator.js'

const BROWSER_IMAGE = 'ghcr.io/zenika/alpine-chrome:latest'
const BROWSER_PORT = 9222

interface SpawnResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

/**
 * Provisions and deprovisions capability sidecars (e.g. browser) for agents.
 */
export class CapabilityProvisioner {
  private readonly orchestrator: ContainerOrchestrator
  /** Track which agents have sidecars so deprovisionAll() knows what to stop */
  private readonly provisionedAgents = new Set<string>()

  constructor(orchestrator: ContainerOrchestrator) {
    this.orchestrator = orchestrator
  }

  private browserContainerName(agentName: string): string {
    return `openaios-${agentName}-browser`
  }

  /**
   * Provision any declared capabilities for an agent.
   * Call this after the agent container is running.
   */
  async provision(agentName: string, capabilities: AgentCapabilities): Promise<void> {
    if (capabilities.browser) {
      await this.startBrowser(agentName)
      // Write CDP_URL into the agent container's /workspace/.env.capabilities
      const cdpUrl = `http://${this.browserContainerName(agentName)}:${BROWSER_PORT}`
      await this.orchestrator.exec(agentName, [
        'sh', '-c',
        `echo 'CDP_URL=${cdpUrl}' >> /workspace/.env.capabilities`,
      ])
      logger.info('[capability-provisioner]', `Browser sidecar ready for "${agentName}": ${cdpUrl}`)
      this.provisionedAgents.add(agentName)
    }
  }

  /** Deprovision all sidecars for an agent. */
  async deprovision(agentName: string): Promise<void> {
    const name = this.browserContainerName(agentName)
    await this.spawnCollect('docker', ['stop', name]).catch(() => {})
    await this.spawnCollect('docker', ['rm', name]).catch(() => {})
    this.provisionedAgents.delete(agentName)
    logger.info('[capability-provisioner]', `Deprovisioned sidecars for "${agentName}"`)
  }

  /** Deprovision all sidecars for all provisioned agents. */
  async deprovisionAll(): Promise<void> {
    const agents = Array.from(this.provisionedAgents)
    await Promise.all(agents.map((name) => this.deprovision(name)))
  }

  private async startBrowser(agentName: string): Promise<void> {
    const name = this.browserContainerName(agentName)

    // Check if already running — idempotent
    const running = await this.isContainerRunning(name)
    if (running) return

    const result = await this.spawnCollect('docker', [
      'run', '-d',
      '--name', name,
      '--network', 'openaios',
      '--memory', '512m',
      BROWSER_IMAGE,
      '--no-sandbox',
      '--remote-debugging-address=0.0.0.0',
      `--remote-debugging-port=${BROWSER_PORT}`,
    ])

    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to start browser sidecar for "${agentName}": ${result.stderr.slice(0, 500)}`
      )
    }
  }

  private async isContainerRunning(name: string): Promise<boolean> {
    const result = await this.spawnCollect('docker', [
      'inspect', '--format', '{{.State.Running}}', name,
    ])
    return result.exitCode === 0 && result.stdout.trim() === 'true'
  }

  private spawnCollect(cmd: string, args: string[]): Promise<SpawnResult> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { shell: false })
      let stdout = ''
      let stderr = ''
      proc.stdout.setEncoding('utf-8')
      proc.stderr.setEncoding('utf-8')
      proc.stdout.on('data', (c: string) => { stdout += c })
      proc.stderr.on('data', (c: string) => { stderr += c })
      proc.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }))
      proc.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }))
    })
  }
}
