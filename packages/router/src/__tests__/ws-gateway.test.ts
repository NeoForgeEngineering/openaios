import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { afterEach, describe, it } from 'node:test'
import {
  MockChannel,
  MockGovernance,
  MockRunner,
  MockSessionStore,
} from '@openaios/core/testing'
import { WebSocket } from 'ws'
import { RouterCore } from '../router-core.js'
import { WsGateway } from '../ws-gateway.js'

// Minimal budget mock
const mockBudget = {
  check: () => ({ allowed: true }),
  record: () => {},
  status: () => ({}),
  close: () => {},
}

function setup() {
  const server = createServer()
  const runner = new MockRunner()
  const channel = new MockChannel()

  const router = new RouterCore({
    routes: [
      {
        agentName: 'test-agent',
        defaultModel: 'test-model',
        runner,
        channel,
      },
    ],
    sessionStore: new MockSessionStore(),
    governance: new MockGovernance(),
    budget: mockBudget as never,
  })

  const gateway = new WsGateway({ server, router })

  return { server, router, gateway }
}

function connectWs(port: number, token?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const url = token
      ? `ws://localhost:${port}/ws?token=${token}`
      : `ws://localhost:${port}/ws`
    const ws = new WebSocket(url)
    ws.on('open', () => resolve(ws))
    ws.on('error', reject)
  })
}

function sendRpc(
  ws: WebSocket,
  method: string,
  id: number,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(JSON.parse(data.toString()) as Record<string, unknown>)
    })
    ws.send(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        ...(params !== undefined && { params }),
      }),
    )
  })
}

let serverToClose: ReturnType<typeof createServer> | undefined
let gatewayToClose: WsGateway | undefined

afterEach(() => {
  gatewayToClose?.close()
  serverToClose?.close()
})

describe('WsGateway', () => {
  it('responds to ping', async () => {
    const { server, gateway } = setup()
    serverToClose = server
    gatewayToClose = gateway

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }
    const ws = await connectWs(addr.port)

    const res = await sendRpc(ws, 'ping', 1)
    assert.deepEqual(res.result, { pong: true })

    ws.close()
  })

  it('returns error for unknown method', async () => {
    const { server, gateway } = setup()
    serverToClose = server
    gatewayToClose = gateway

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }
    const ws = await connectWs(addr.port)

    const res = await sendRpc(ws, 'nonexistent', 2)
    assert.ok(res.error)
    assert.equal((res.error as Record<string, unknown>).code, -32601)

    ws.close()
  })

  it('subscribe receives events', async () => {
    const { server, gateway, router } = setup()
    serverToClose = server
    gatewayToClose = gateway

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }
    const ws = await connectWs(addr.port)

    // Subscribe
    const subRes = await sendRpc(ws, 'subscribe', 3)
    assert.deepEqual(subRes.result, { subscribed: true })

    // Emit an event from router
    const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>)
      })
    })

    router.events.emit('turn', {
      type: 'turn:start',
      agentName: 'test-agent',
      userId: 'user-1',
      timestampMs: Date.now(),
    })

    const event = await eventPromise
    assert.equal(event.method, 'event')
    assert.equal((event.params as Record<string, unknown>).type, 'turn:start')

    ws.close()
  })

  it('handles parse errors', async () => {
    const { server, gateway } = setup()
    serverToClose = server
    gatewayToClose = gateway

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }
    const ws = await connectWs(addr.port)

    const res = await new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>)
      })
      ws.send('not json')
    })

    assert.equal((res.error as Record<string, unknown>).code, -32700)

    ws.close()
  })

  it('auth token rejects invalid token', async () => {
    const server = createServer()
    const runner = new MockRunner()
    const channel = new MockChannel()

    const router = new RouterCore({
      routes: [{ agentName: 'a', defaultModel: 'm', runner, channel }],
      sessionStore: new MockSessionStore(),
      governance: new MockGovernance(),
      budget: mockBudget as never,
    })

    const gateway = new WsGateway({
      server,
      router,
      authToken: 'secret-token',
    })
    serverToClose = server
    gatewayToClose = gateway

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    // Connect with wrong token
    const ws = new WebSocket(`ws://localhost:${addr.port}/ws?token=wrong`)
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code))
    })
    assert.equal(closeCode, 4001)
  })

  it('registers custom methods', async () => {
    const { server, gateway } = setup()
    serverToClose = server
    gatewayToClose = gateway

    gateway.registerMethod('custom.hello', async (params) => ({
      greeting: `Hello, ${(params as Record<string, string>)?.name ?? 'world'}`,
    }))

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }
    const ws = await connectWs(addr.port)

    const res = await sendRpc(ws, 'custom.hello', 5, { name: 'test' })
    assert.deepEqual(res.result, { greeting: 'Hello, test' })

    ws.close()
  })
})
