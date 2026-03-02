import { spawn } from 'node:child_process'

const NETWORK_NAME = 'openaios'

export interface DockerContainerConfig {
  image?: string | undefined
  memory?: string | undefined
  cpus?: number | undefined
}

export interface ExecResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

/**
 * Manages long-lived Docker containers for agent execution.
 * One container per agent, named `openaios-{agentName}`.
 */
export class ContainerOrchestrator {
  private readonly busUrl: string
  private readonly busToken: string
  /** Track containers we've started so stopAll() knows what to clean up */
  private readonly managedAgents = new Set<string>()

  constructor(opts: { busUrl: string; busToken: string }) {
    this.busUrl = opts.busUrl
    this.busToken = opts.busToken
  }

  private containerName(agentName: string): string {
    return `openaios-${agentName}`
  }

  private volumeName(agentName: string): string {
    return `openaios-${agentName}-workspace`
  }

  /** Create the openaios bridge network idempotently. */
  async ensureNetwork(): Promise<void> {
    try {
      await this.run('docker', ['network', 'create', NETWORK_NAME, '--driver', 'bridge'])
    } catch {
      // Ignore "network already exists" error
    }
  }

  /**
   * Start the container if it is not already running.
   * Idempotent — safe to call on every turn.
   */
  async ensureRunning(agentName: string, config: DockerContainerConfig = {}): Promise<void> {
    if (await this.isRunning(agentName)) return
    await this.start(agentName, config)
  }

  /** Start a fresh container for an agent. */
  async start(agentName: string, config: DockerContainerConfig = {}): Promise<void> {
    await this.ensureNetwork()

    const name = this.containerName(agentName)
    const image = config.image ?? 'openaios/agent:latest'
    const memory = config.memory ?? '1g'
    const cpus = String(config.cpus ?? 1)

    const args = [
      'run', '-d',
      '--name', name,
      '--network', NETWORK_NAME,
      '--memory', memory,
      '--cpus', cpus,
      '--env', `OPENAIOS_AGENT_NAME=${agentName}`,
      '--env', `OPENAIOS_BUS_URL=${this.busUrl}`,
      '--env', `OPENAIOS_BUS_TOKEN=${this.busToken}`,
      '--volume', `${this.volumeName(agentName)}:/workspace`,
      image,
      'tail', '-f', '/dev/null',
    ]

    const result = await this.run('docker', args)
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to start container for agent "${agentName}": ${result.stderr.slice(0, 500)}`
      )
    }

    this.managedAgents.add(agentName)
    console.log(`[orchestrator] Started container: ${name}`)
  }

  /** Stop and remove the container for an agent. */
  async stop(agentName: string): Promise<void> {
    const name = this.containerName(agentName)
    // Best-effort stop then rm
    await this.run('docker', ['stop', name]).catch(() => {})
    await this.run('docker', ['rm', name]).catch(() => {})
    this.managedAgents.delete(agentName)
    console.log(`[orchestrator] Stopped container: ${name}`)
  }

  /** Execute a command inside a running agent container. */
  async exec(agentName: string, args: string[], env?: Record<string, string>): Promise<ExecResult> {
    const name = this.containerName(agentName)

    const dockerArgs = ['exec']

    if (env) {
      for (const [k, v] of Object.entries(env)) {
        dockerArgs.push('--env', `${k}=${v}`)
      }
    }

    dockerArgs.push(name, ...args)
    return this.run('docker', dockerArgs)
  }

  /** Check whether the agent container is currently running. */
  async isRunning(agentName: string): Promise<boolean> {
    const name = this.containerName(agentName)
    const result = await this.run('docker', [
      'inspect',
      '--format', '{{.State.Running}}',
      name,
    ])
    return result.exitCode === 0 && result.stdout.trim() === 'true'
  }

  /** Stop all containers managed by this orchestrator instance. */
  async stopAll(): Promise<void> {
    const agents = Array.from(this.managedAgents)
    await Promise.all(agents.map((name) => this.stop(name)))
  }

  /** Low-level helper: spawn a docker command and collect output. */
  private run(cmd: string, args: string[]): Promise<ExecResult> {
    return new Promise((resolve) => {
      const proc = spawn(cmd, args, { shell: false })
      let stdout = ''
      let stderr = ''

      proc.stdout.setEncoding('utf-8')
      proc.stderr.setEncoding('utf-8')
      proc.stdout.on('data', (chunk: string) => { stdout += chunk })
      proc.stderr.on('data', (chunk: string) => { stderr += chunk })

      proc.on('close', (exitCode) => {
        resolve({ stdout, stderr, exitCode })
      })

      proc.on('error', (err) => {
        resolve({ stdout, stderr: err.message, exitCode: 1 })
      })
    })
  }
}
