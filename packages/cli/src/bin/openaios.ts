#!/usr/bin/env node
import { Command } from 'commander'
import { startCommand } from '../commands/start.js'
import { statusCommand } from '../commands/status.js'
import { initCommand } from '../commands/init.js'
import { upgradeCommand } from '../commands/upgrade.js'
import { auditCommand } from '../commands/audit.js'
import {
  serviceInstallCommand,
  serviceUninstallCommand,
  serviceStartCommand,
  serviceStopCommand,
  serviceRestartCommand,
  serviceStatusCommand,
  serviceLogsCommand,
} from '../commands/service.js'

const program = new Command()

program
  .name('openaios')
  .description('openAIOS — model-agnostic AI OS for running agents across channels')
  .version('0.1.0')

program
  .command('init')
  .description('Scaffold an openAIOS.yml config in the current directory')
  .action(async () => {
    await initCommand().catch(fatal)
  })

program
  .command('start')
  .description('Start the openAIOS runtime (foreground)')
  .option('-c, --config <path>', 'Path to openAIOS.yml', 'openAIOS.yml')
  .option('-d, --data-dir <path>', 'Override data directory')
  .action(async (opts: { config: string; dataDir?: string }) => {
    await startCommand(opts).catch(fatal)
  })

program
  .command('status')
  .description('Show runtime status (runners, sessions, budget)')
  .option('-c, --config <path>', 'Path to openAIOS.yml', 'openAIOS.yml')
  .action(async (opts: { config: string }) => {
    await statusCommand(opts).catch(fatal)
  })

program
  .command('upgrade')
  .description('Pull latest changes, rebuild, and restart the service')
  .action(async () => {
    await upgradeCommand().catch(fatal)
  })

program
  .command('audit')
  .description('Run security audit and print findings (exits 1 if any ERROR findings)')
  .option('-c, --config <path>', 'Path to openAIOS.yml', 'openAIOS.yml')
  .action(async (opts: { config: string }) => {
    await auditCommand(opts).catch(fatal)
  })

// ── service subcommands ───────────────────────────────────────────────────────
const service = program
  .command('service')
  .description('Manage the openAIOS background service')

service
  .command('install')
  .description('Register openAIOS as a system daemon (systemd / launchd)')
  .option('-d, --config-dir <path>', 'Directory containing openAIOS.yml (defaults to CWD)')
  .option('--system', 'Install as system-level service (requires sudo, Linux only)')
  .action(async (opts: { configDir?: string; system?: boolean }) => {
    await serviceInstallCommand({
      ...(opts.configDir !== undefined && { configDir: opts.configDir }),
      userLevel: !opts.system,
    }).catch(fatal)
  })

service
  .command('uninstall')
  .description('Remove the openAIOS daemon registration')
  .action(async () => {
    await serviceUninstallCommand().catch(fatal)
  })

service
  .command('start')
  .description('Start the background service')
  .action(async () => {
    await serviceStartCommand().catch(fatal)
  })

service
  .command('stop')
  .description('Stop the background service')
  .action(async () => {
    await serviceStopCommand().catch(fatal)
  })

service
  .command('restart')
  .description('Restart the background service')
  .action(async () => {
    await serviceRestartCommand().catch(fatal)
  })

service
  .command('status')
  .description('Show service status')
  .action(async () => {
    await serviceStatusCommand().catch(fatal)
  })

service
  .command('logs')
  .description('Tail service logs')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(async (opts: { lines: string }) => {
    await serviceLogsCommand({ lines: parseInt(opts.lines, 10) }).catch(fatal)
  })

program.parse()

function fatal(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err)
  process.stderr.write(`[openaios] Fatal error: ${msg}\n`)
  process.exit(1)
}
