import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { logger } from '@openaios/core'
import { PluginLifecycle } from './lifecycle.js'
import { type LoadedPlugin, loadPlugin } from './loader.js'

export interface PluginRegistryOptions {
  /** Additional directories to scan for plugins */
  dirs?: string[]
}

const DEFAULT_DIRS = ['./plugins', join(homedir(), '.openaios', 'plugins')]

/**
 * Plugin registry — discovers, loads, and manages plugins.
 * Scans configured directories for plugin directories.
 */
export class PluginRegistry {
  private plugins = new Map<string, LoadedPlugin>()
  private lifecycle = new PluginLifecycle()
  private dirs: string[]

  constructor(opts?: PluginRegistryOptions) {
    this.dirs = [...DEFAULT_DIRS, ...(opts?.dirs ?? [])]
  }

  /** Discover and load all plugins from configured directories. */
  async discoverAll(): Promise<void> {
    for (const dir of this.dirs) {
      if (!existsSync(dir)) continue

      const entries = readdirSync(dir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const pluginDir = join(dir, entry.name)
        try {
          const plugin = await loadPlugin(pluginDir)
          this.plugins.set(plugin.manifest.name, plugin)
          this.lifecycle.register(plugin.manifest.name)
          logger.info(
            '[plugins]',
            `Discovered plugin "${plugin.manifest.name}" v${plugin.manifest.version}`,
          )
        } catch (err) {
          logger.warn(
            '[plugins]',
            `Skipping ${pluginDir}: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
    }
  }

  /** Get a loaded plugin by name. */
  get(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name)
  }

  /** List all loaded plugins. */
  list(): LoadedPlugin[] {
    return [...this.plugins.values()]
  }

  /** Get the lifecycle manager. */
  getLifecycle(): PluginLifecycle {
    return this.lifecycle
  }

  /** Enable a plugin by name. */
  enable(name: string): void {
    const plugin = this.plugins.get(name)
    if (!plugin) throw new Error(`Plugin "${name}" not found`)

    const state = this.lifecycle.getState(name)
    if (state === 'discovered') {
      this.lifecycle.install(name)
    }
    this.lifecycle.enable(name)
  }

  /** Disable a plugin by name. */
  disable(name: string): void {
    this.lifecycle.disable(name)
  }

  /** Get names of all enabled plugins. */
  enabled(): string[] {
    return this.lifecycle.listByState('enabled').map((p) => p.name)
  }
}
