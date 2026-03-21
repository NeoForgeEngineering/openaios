export type PluginState =
  | 'discovered'
  | 'installed'
  | 'enabled'
  | 'disabled'
  | 'error'

export interface PluginInstance {
  name: string
  state: PluginState
  error?: string
}

/**
 * Plugin lifecycle state machine.
 *
 * discovered → installed → enabled ↔ disabled
 *                  ↓          ↓
 *                error      error
 */
export class PluginLifecycle {
  private plugins = new Map<string, PluginInstance>()

  register(name: string): void {
    this.plugins.set(name, { name, state: 'discovered' })
  }

  install(name: string): void {
    const plugin = this.get(name)
    if (plugin.state !== 'discovered') {
      throw new Error(
        `Cannot install plugin "${name}" in state "${plugin.state}"`,
      )
    }
    plugin.state = 'installed'
  }

  enable(name: string): void {
    const plugin = this.get(name)
    if (plugin.state !== 'installed' && plugin.state !== 'disabled') {
      throw new Error(
        `Cannot enable plugin "${name}" in state "${plugin.state}"`,
      )
    }
    plugin.state = 'enabled'
  }

  disable(name: string): void {
    const plugin = this.get(name)
    if (plugin.state !== 'enabled') {
      throw new Error(
        `Cannot disable plugin "${name}" in state "${plugin.state}"`,
      )
    }
    plugin.state = 'disabled'
  }

  markError(name: string, error: string): void {
    const plugin = this.get(name)
    plugin.state = 'error'
    plugin.error = error
  }

  getState(name: string): PluginState {
    return this.get(name).state
  }

  listByState(state: PluginState): PluginInstance[] {
    return [...this.plugins.values()].filter((p) => p.state === state)
  }

  listAll(): PluginInstance[] {
    return [...this.plugins.values()]
  }

  private get(name: string): PluginInstance {
    const plugin = this.plugins.get(name)
    if (!plugin) {
      throw new Error(`Plugin "${name}" not found`)
    }
    return plugin
  }
}
