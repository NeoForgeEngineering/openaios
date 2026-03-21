import type { A2UIMessage, CanvasComponent } from './a2ui-protocol.js'
import {
  createPushMessage,
  createRemoveMessage,
  createResetMessage,
  createUpdateMessage,
} from './a2ui-protocol.js'

/**
 * Per-session canvas state manager.
 * Maintains the current set of components and generates protocol messages.
 */
export class CanvasStateManager {
  private sessions = new Map<string, Map<string, CanvasComponent>>()

  /** Push new components to a session's canvas. */
  push(sessionId: string, components: CanvasComponent[]): A2UIMessage {
    const state = this.getOrCreate(sessionId)
    for (const c of components) {
      state.set(c.id, c)
    }
    return createPushMessage(sessionId, components)
  }

  /** Update a single component. */
  update(sessionId: string, component: CanvasComponent): A2UIMessage {
    const state = this.getOrCreate(sessionId)
    state.set(component.id, component)
    return createUpdateMessage(sessionId, component)
  }

  /** Remove a component by ID. */
  remove(sessionId: string, componentId: string): A2UIMessage {
    const state = this.sessions.get(sessionId)
    if (state) {
      state.delete(componentId)
    }
    return createRemoveMessage(sessionId, componentId)
  }

  /** Reset a session's canvas (remove all components). */
  reset(sessionId: string): A2UIMessage {
    this.sessions.delete(sessionId)
    return createResetMessage(sessionId)
  }

  /** Get all components for a session. */
  getState(sessionId: string): CanvasComponent[] {
    const state = this.sessions.get(sessionId)
    if (!state) return []
    return [...state.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  }

  /** Check if a session has any canvas state. */
  hasSession(sessionId: string): boolean {
    const state = this.sessions.get(sessionId)
    return state !== undefined && state.size > 0
  }

  /** Get a specific component. */
  getComponent(
    sessionId: string,
    componentId: string,
  ): CanvasComponent | undefined {
    return this.sessions.get(sessionId)?.get(componentId)
  }

  /** List all active session IDs. */
  listSessions(): string[] {
    return [...this.sessions.keys()]
  }

  /** Clean up a session. */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId)
  }

  private getOrCreate(sessionId: string): Map<string, CanvasComponent> {
    let state = this.sessions.get(sessionId)
    if (!state) {
      state = new Map()
      this.sessions.set(sessionId, state)
    }
    return state
  }
}
