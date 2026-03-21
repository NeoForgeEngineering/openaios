import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, it } from 'node:test'
import type { DispatchRequest } from '../cron-scheduler.js'
import { WebhookReceiver } from '../webhook-receiver.js'

function mockRequest(opts: {
  url: string
  method: string
  headers?: Record<string, string>
  body?: string
}): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage
  req.url = opts.url
  req.method = opts.method
  req.headers = opts.headers ?? {}
  req.setEncoding = () => req

  // Simulate body delivery
  process.nextTick(() => {
    if (opts.body) req.emit('data', opts.body)
    req.emit('end')
  })

  return req
}

function mockResponse(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 200,
    body: '',
    writeHead(code: number, _headers?: Record<string, string>) {
      res.statusCode = code
      return res
    },
    end(data?: string) {
      res.body = data ?? ''
    },
  } as unknown as ServerResponse & { statusCode: number; body: string }
  return res
}

describe('WebhookReceiver', () => {
  it('dispatches valid webhook', async () => {
    const dispatched: DispatchRequest[] = []
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/test', agent: 'assistant' }],
      async (req) => {
        dispatched.push(req)
      },
    )

    const req = mockRequest({
      url: '/hooks/test',
      method: 'POST',
      body: JSON.stringify({ message: 'hello' }),
    })
    const res = mockResponse()

    const handled = await receiver.handle(req, res)
    assert.equal(handled, true)
    assert.equal(res.statusCode, 200)
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0]?.message, 'hello')
  })

  it('rejects wrong token', async () => {
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/secure', agent: 'assistant', token: 'secret123' }],
      async () => {},
    )

    const req = mockRequest({
      url: '/hooks/secure',
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
      body: '{}',
    })
    const res = mockResponse()

    await receiver.handle(req, res)
    assert.equal(res.statusCode, 401)
  })

  it('accepts correct token', async () => {
    const dispatched: DispatchRequest[] = []
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/secure', agent: 'assistant', token: 'secret123' }],
      async (req) => {
        dispatched.push(req)
      },
    )

    const req = mockRequest({
      url: '/hooks/secure',
      method: 'POST',
      headers: { authorization: 'Bearer secret123' },
      body: '{}',
    })
    const res = mockResponse()

    await receiver.handle(req, res)
    assert.equal(res.statusCode, 200)
    assert.equal(dispatched.length, 1)
  })

  it('deduplicates by idempotency key', async () => {
    const dispatched: DispatchRequest[] = []
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/test', agent: 'assistant' }],
      async (req) => {
        dispatched.push(req)
      },
    )

    // First request
    const req1 = mockRequest({
      url: '/hooks/test',
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      body: '{}',
    })
    await receiver.handle(req1, mockResponse())

    // Second request with same key
    const req2 = mockRequest({
      url: '/hooks/test',
      method: 'POST',
      headers: { 'idempotency-key': 'key-1' },
      body: '{}',
    })
    const res2 = mockResponse()
    await receiver.handle(req2, res2)

    assert.equal(res2.statusCode, 200)
    assert.ok(res2.body.includes('duplicate'))
    assert.equal(dispatched.length, 1) // Only dispatched once
  })

  it('returns false for unmatched path', async () => {
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/test', agent: 'assistant' }],
      async () => {},
    )

    const req = mockRequest({ url: '/other', method: 'POST', body: '{}' })
    const res = mockResponse()
    const handled = await receiver.handle(req, res)
    assert.equal(handled, false)
  })

  it('rejects invalid JSON', async () => {
    const receiver = new WebhookReceiver(
      [{ path: '/hooks/test', agent: 'assistant' }],
      async () => {},
    )

    const req = mockRequest({
      url: '/hooks/test',
      method: 'POST',
      body: 'not json{',
    })
    const res = mockResponse()
    await receiver.handle(req, res)
    assert.equal(res.statusCode, 400)
  })
})
