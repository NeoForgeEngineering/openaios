import type { ToolDefinition } from '@openaios/core'

const VALID_NAME = /^[a-z0-9_-]+$/

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>()

  add(tool: ToolDefinition): void {
    if (!tool.name || !VALID_NAME.test(tool.name)) {
      throw new Error(
        `Invalid tool name: "${tool.name}" — must be lowercase alphanumeric with underscores or hyphens`,
      )
    }
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`)
    }
    this.tools.set(tool.name, tool)
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  has(name: string): boolean {
    return this.tools.has(name)
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()]
  }

  remove(name: string): boolean {
    return this.tools.delete(name)
  }
}
