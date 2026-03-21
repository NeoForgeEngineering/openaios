import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { after, describe, it } from 'node:test'
import { WebSocket } from 'ws'
import { CanvasServer } from '../canvas-server.js'

describe('CanvasServer', () => {
  const servers: Server[] = []
  const canvases: CanvasServer[] = []
  const wsClients: WebSocket[] = []

  after(() => {
    for (const ws of wsClients) ws.close()
    for (const c of canvases) c.close()
    for (const s of servers) s.close()
    // WS internals keep the event loop alive even after close
    setTimeout(() => process.exit(0), 200).unref()
  })

  function setup(opts?: { authToken?: string }) {
    const server = createServer()
    const canvas = new CanvasServer({
      server,
      ...(opts?.authToken !== undefined && { authToken: opts.authToken }),
    })
    servers.push(server)
    canvases.push(canvas)
    return { server, canvas }
  }

  function connectCanvas(
    port: number,
    sessionId: string,
    token?: string,
  ): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const params = token
        ? `session=${sessionId}&token=${token}`
        : `session=${sessionId}`
      const ws = new WebSocket(`ws://localhost:${port}/canvas?${params}`)
      wsClients.push(ws)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  it('sends state on connect', async () => {
    const { server, canvas } = setup()

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    canvas.push('sess-1', [
      { id: 'c1', type: 'markdown', props: { content: 'hello' } },
    ])

    const ws = await connectCanvas(addr.port, 'sess-1')
    const msg = await new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>)
      })
    })

    assert.equal(msg.type, 'canvas:state')
    assert.equal((msg.components as unknown[]).length, 1)
  })

  it('broadcasts push to connected clients', async () => {
    const { server, canvas } = setup()

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    const ws = await connectCanvas(addr.port, 'sess-1')

    const msgPromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.once('message', (data) => {
        resolve(JSON.parse(data.toString()) as Record<string, unknown>)
      })
    })

    canvas.push('sess-1', [
      { id: 'c1', type: 'button', props: { label: 'click' } },
    ])

    const msg = await msgPromise
    assert.equal(msg.type, 'canvas:push')
  })

  it('handles action messages from client', async () => {
    const { server, canvas } = setup()

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    const actions: Array<{
      sessionId: string
      componentId: string
      actionType: string
    }> = []
    canvas.onAction(async (sessionId, componentId, actionType) => {
      actions.push({ sessionId, componentId, actionType })
    })

    const ws = await connectCanvas(addr.port, 'sess-1')

    ws.send(
      JSON.stringify({
        type: 'canvas:action',
        sessionId: 'sess-1',
        action: {
          componentId: 'btn-1',
          actionType: 'click',
        },
        timestampMs: Date.now(),
      }),
    )

    await new Promise((r) => setTimeout(r, 50))

    assert.equal(actions.length, 1)
    assert.equal(actions[0]?.componentId, 'btn-1')
  })

  it('rejects missing session parameter', async () => {
    const { server } = setup()

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    const ws = new WebSocket(`ws://localhost:${addr.port}/canvas`)
    wsClients.push(ws)
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c))
    })
    assert.equal(code, 4002)
  })

  it('rejects invalid auth token', async () => {
    const { server } = setup({ authToken: 'secret' })

    await new Promise<void>((r) => server.listen(0, r))
    const addr = server.address() as { port: number }

    const ws = new WebSocket(
      `ws://localhost:${addr.port}/canvas?session=s1&token=wrong`,
    )
    wsClients.push(ws)
    const code = await new Promise<number>((resolve) => {
      ws.on('close', (c) => resolve(c))
    })
    assert.equal(code, 4001)
  })

  it('getState and reset work', () => {
    const { canvas } = setup()

    canvas.push('sess-1', [{ id: 'c1', type: 'markdown', props: {} }])
    assert.equal(canvas.getState('sess-1').length, 1)

    canvas.reset('sess-1')
    assert.equal(canvas.getState('sess-1').length, 0)
  })
})
