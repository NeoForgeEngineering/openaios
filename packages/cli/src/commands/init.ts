import { writeFileSync, existsSync, cpSync } from 'node:fs'
import { resolve } from 'node:path'

const EXAMPLE_CONFIG_PATHS = [
  './openAIOS.yml.example',
  '../openAIOS.yml.example',
  '../../openAIOS.yml.example',
]

export async function initCommand(): Promise<void> {
  const target = resolve('openAIOS.yml')

  if (existsSync(target)) {
    console.error('openAIOS.yml already exists. Remove it first to re-initialise.')
    process.exit(1)
  }

  // Find the example config
  const examplePath = EXAMPLE_CONFIG_PATHS.find((p) => existsSync(resolve(p)))

  if (examplePath) {
    cpSync(resolve(examplePath), target)
    console.log('Created openAIOS.yml from example.')
  } else {
    // Write a minimal default config
    writeFileSync(target, MINIMAL_CONFIG, 'utf-8')
    console.log('Created openAIOS.yml with minimal default config.')
  }

  console.log('\nNext steps:')
  console.log('  1. Edit openAIOS.yml to configure your agents')
  console.log('  2. Set required environment variables (TELEGRAM_TOKEN, etc.)')
  console.log('  3. Run: openaios start')
}

const MINIMAL_CONFIG = `# openAIOS configuration
# See openAIOS.yml.example for full reference

agents:
  - name: assistant
    persona: "You are a helpful assistant."
    model:
      default: ollama/qwen2.5:7b
    channels:
      telegram:
        token: \${TELEGRAM_TOKEN}
    permissions:
      allow:
        - Read
        - Write
      deny:
        - Bash

models:
  providers:
    ollama:
      base_url: "http://localhost:11434"

network:
  bind: tailscale
`
