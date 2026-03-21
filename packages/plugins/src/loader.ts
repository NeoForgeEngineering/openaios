import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { logger } from '@openaios/core'
import { type PluginManifest, validateManifest } from './manifest.js'

export interface LoadedPlugin {
  manifest: PluginManifest
  path: string
  // biome-ignore lint/suspicious/noExplicitAny: plugin modules have arbitrary shape
  module?: any
}

/**
 * Load a plugin from a directory path.
 * Expects plugin.json or package.json with openaios plugin manifest.
 */
export async function loadPlugin(pluginDir: string): Promise<LoadedPlugin> {
  // Try plugin.json first, then package.json
  let manifestData: unknown
  let manifestPath: string

  const pluginJsonPath = join(pluginDir, 'plugin.json')
  const packageJsonPath = join(pluginDir, 'package.json')

  if (existsSync(pluginJsonPath)) {
    manifestPath = pluginJsonPath
    manifestData = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'))
  } else if (existsSync(packageJsonPath)) {
    manifestPath = packageJsonPath
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as Record<
      string,
      unknown
    >
    // Look for openaios plugin metadata in package.json
    manifestData = pkg.openaios ?? pkg
  } else {
    throw new Error(`No plugin.json or package.json found in ${pluginDir}`)
  }

  const manifest = validateManifest(manifestData)
  logger.info(
    '[plugins]',
    `Loaded manifest for "${manifest.name}" from ${manifestPath}`,
  )

  // Dynamic import of plugin module
  const entryPath = join(pluginDir, manifest.main)
  let module: unknown
  if (existsSync(entryPath)) {
    try {
      module = await import(entryPath)
    } catch (err) {
      logger.warn(
        '[plugins]',
        `Failed to import plugin "${manifest.name}": ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  return {
    manifest,
    path: pluginDir,
    ...(module !== undefined && { module }),
  }
}
