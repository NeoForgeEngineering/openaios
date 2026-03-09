import { loadConfig } from '@openaios/core'

export async function tuiCommand(options: { config?: string }): Promise<void> {
  const config = loadConfig(options.config)
  const baseUrl = `http://localhost:${config.network.port}`

  // Dynamic imports to avoid loading React in non-TUI commands
  const { render } = await import('ink')
  const { createElement } = await import('react')
  const { TuiApp } = await import('../tui/app.js')

  render(createElement(TuiApp, { baseUrl }))
}
