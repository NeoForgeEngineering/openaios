#!/usr/bin/env node
import { Command } from 'commander'
import { startCommand } from '../commands/start.js'
import { statusCommand } from '../commands/status.js'
import { initCommand } from '../commands/init.js'

const program = new Command()

program
  .name('openaios')
  .description('openAIOS — model-agnostic AI OS for running agents across channels')
  .version('0.1.0')

program
  .command('init')
  .description('Initialise a new openAIOS.yml config in the current directory')
  .action(async () => {
    await initCommand().catch(fatal)
  })

program
  .command('start')
  .description('Start the openAIOS runtime')
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

program.parse()

function fatal(err: unknown): never {
  console.error('[openaios] Fatal error:', (err as Error).message ?? err)
  process.exit(1)
}
