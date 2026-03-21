import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { HealthEndpoints } from '../health.js'

describe('HealthEndpoints', () => {
  it('getStatus returns ok', () => {
    const health = new HealthEndpoints({ agentCount: 3 })
    const status = health.getStatus()
    assert.equal(status.status, 'ok')
    assert.equal(status.agents, 3)
    assert.ok(status.uptime >= 0)
  })

  it('handle returns true for /health', () => {
    const health = new HealthEndpoints({ agentCount: 2 })
    let statusCode = 0
    let body = ''

    const req = { method: 'GET', url: '/health' } as never
    const res = {
      writeHead(code: number, _headers?: Record<string, string>) {
        statusCode = code
        return res
      },
      end(data?: string) {
        body = data ?? ''
      },
    } as never

    const handled = health.handle(req, res)
    assert.equal(handled, true)
    assert.equal(statusCode, 200)
    const parsed = JSON.parse(body) as Record<string, unknown>
    assert.equal(parsed.status, 'ok')
  })

  it('handle returns true for /ready', () => {
    const health = new HealthEndpoints({ agentCount: 1 })
    let statusCode = 0

    const req = { method: 'GET', url: '/ready' } as never
    const res = {
      writeHead(code: number) {
        statusCode = code
        return res
      },
      end() {},
    } as never

    const handled = health.handle(req, res)
    assert.equal(handled, true)
    assert.equal(statusCode, 200)
  })

  it('handle returns false for unknown path', () => {
    const health = new HealthEndpoints({ agentCount: 1 })
    const req = { method: 'GET', url: '/other' } as never
    const res = {} as never
    assert.equal(health.handle(req, res), false)
  })

  it('handle returns false for non-GET', () => {
    const health = new HealthEndpoints({ agentCount: 1 })
    const req = { method: 'POST', url: '/health' } as never
    const res = {} as never
    assert.equal(health.handle(req, res), false)
  })
})
