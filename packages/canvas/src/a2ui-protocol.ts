/**
 * A2UI (Agent-to-UI) protocol message types.
 * Defines the contract between agent canvas server and UI clients.
 */

export type A2UIMessageType =
  | 'canvas:push'
  | 'canvas:reset'
  | 'canvas:update'
  | 'canvas:remove'
  | 'canvas:action'
  | 'canvas:state'

export interface CanvasComponent {
  id: string
  type: 'form' | 'table' | 'chart' | 'button' | 'markdown' | 'image'
  props: Record<string, unknown>
  order?: number
}

export interface A2UIMessage {
  type: A2UIMessageType
  sessionId: string
  /** Component(s) affected */
  components?: CanvasComponent[]
  /** Single component ID for targeted operations */
  componentId?: string
  /** Action payload from UI → agent */
  action?: {
    componentId: string
    actionType: string
    data?: Record<string, unknown>
  }
  timestampMs: number
}

export function createPushMessage(
  sessionId: string,
  components: CanvasComponent[],
): A2UIMessage {
  return {
    type: 'canvas:push',
    sessionId,
    components,
    timestampMs: Date.now(),
  }
}

export function createResetMessage(sessionId: string): A2UIMessage {
  return {
    type: 'canvas:reset',
    sessionId,
    timestampMs: Date.now(),
  }
}

export function createUpdateMessage(
  sessionId: string,
  component: CanvasComponent,
): A2UIMessage {
  return {
    type: 'canvas:update',
    sessionId,
    components: [component],
    componentId: component.id,
    timestampMs: Date.now(),
  }
}

export function createRemoveMessage(
  sessionId: string,
  componentId: string,
): A2UIMessage {
  return {
    type: 'canvas:remove',
    sessionId,
    componentId,
    timestampMs: Date.now(),
  }
}
