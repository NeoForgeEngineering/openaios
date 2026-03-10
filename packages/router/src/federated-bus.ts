import type {
  AgentBus as AgentBusInterface,
  AgentBusRequest,
  AgentBusResponse,
} from '@openaios/core'
import type { AgentBus, AgentBusEntry } from './agent-bus.js'

export interface FederationPeerConfig {
  nodeId: string
  busUrl: string
  token: string
  agents: string[]
}

/**
 * Wraps a local AgentBus and adds peer routing for cross-node agent calls.
 * Implements the AgentBus interface so it can be used anywhere AgentBus is expected.
 * The `register()` method is a concrete delegation (not part of the core interface).
 */
export class FederatedAgentBus implements AgentBusInterface {
  private readonly local: AgentBus
  private readonly agentToPeer: Map<string, FederationPeerConfig>
  private readonly nodeId: string

  constructor(local: AgentBus, nodeId: string, peers: FederationPeerConfig[]) {
    this.local = local
    this.nodeId = nodeId
    this.agentToPeer = new Map()
    for (const peer of peers) {
      for (const agent of peer.agents) {
        this.agentToPeer.set(agent, peer)
      }
    }
  }

  /** Delegates to the local bus — registers an agent on this node. */
  register(agentName: string, entry: AgentBusEntry): void {
    this.local.register(agentName, entry)
  }

  async request(req: AgentBusRequest): Promise<AgentBusResponse> {
    const peer = this.agentToPeer.get(req.toAgent)
    if (!peer) {
      return this.local.request(req)
    }

    // Qualify callerSessionKey with this node's ID to avoid session collisions
    const qualifiedSessionKey = `${this.nodeId}:${req.callerSessionKey}`
    const res = await fetch(`${peer.busUrl}/internal/bus/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${peer.token}`,
      },
      body: JSON.stringify({ ...req, callerSessionKey: qualifiedSessionKey }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Peer "${peer.nodeId}" returned ${res.status}: ${text}`)
    }

    return res.json() as Promise<AgentBusResponse>
  }
}
