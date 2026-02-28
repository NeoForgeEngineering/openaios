import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { ConfigSchema } from './schema/config.js'
import type { Config } from './schema/config.js'

export function loadConfig(configPath?: string): Config {
  const path = resolve(configPath ?? process.env['OPENAIOS_CONFIG'] ?? 'openAIOS.yml')

  let raw: string
  try {
    raw = readFileSync(path, 'utf-8')
  } catch (err) {
    throw new Error(`Cannot read config file at ${path}: ${(err as Error).message}`)
  }

  let parsed: unknown
  try {
    parsed = parseYaml(raw)
  } catch (err) {
    throw new Error(`Invalid YAML in ${path}: ${(err as Error).message}`)
  }

  const result = ConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Config validation failed:\n${issues}`)
  }

  return result.data
}
