import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { DispatchRequest } from '../cron-scheduler.js'
import { CronScheduler, matchCron } from '../cron-scheduler.js'

describe('matchCron', () => {
  it('matches wildcard (* * * * *)', () => {
    assert.equal(matchCron('* * * * *', new Date()), true)
  })

  it('matches specific minute/hour', () => {
    const d = new Date('2026-03-17T09:30:00')
    assert.equal(matchCron('30 9 * * *', d), true)
    assert.equal(matchCron('31 9 * * *', d), false)
    assert.equal(matchCron('30 10 * * *', d), false)
  })

  it('matches day-of-week names', () => {
    // 2026-03-17 is a Tuesday
    const d = new Date('2026-03-17T09:00:00')
    assert.equal(matchCron('0 9 * * TUE', d), true)
    assert.equal(matchCron('0 9 * * MON', d), false)
  })

  it('matches day-of-week range', () => {
    const mon = new Date('2026-03-16T09:00:00') // Monday
    const sat = new Date('2026-03-21T09:00:00') // Saturday
    assert.equal(matchCron('0 9 * * MON-FRI', mon), true)
    assert.equal(matchCron('0 9 * * MON-FRI', sat), false)
  })

  it('matches step expressions', () => {
    const d0 = new Date('2026-03-17T09:00:00')
    const d15 = new Date('2026-03-17T09:15:00')
    const d7 = new Date('2026-03-17T09:07:00')
    assert.equal(matchCron('*/15 * * * *', d0), true)
    assert.equal(matchCron('*/15 * * * *', d15), true)
    assert.equal(matchCron('*/15 * * * *', d7), false)
  })

  it('matches list expressions', () => {
    const d = new Date('2026-03-17T09:30:00')
    assert.equal(matchCron('0,15,30,45 * * * *', d), true)
    assert.equal(matchCron('0,15,45 * * * *', d), false)
  })

  it('rejects invalid expression', () => {
    assert.equal(matchCron('invalid', new Date()), false)
    assert.equal(matchCron('* * *', new Date()), false)
  })
})

describe('CronScheduler', () => {
  it('fires matching jobs on tick', async () => {
    const dispatched: DispatchRequest[] = []
    const scheduler = new CronScheduler(
      [
        {
          name: 'daily',
          agent: 'assistant',
          schedule: '0 9 * * MON-FRI',
          message: 'Generate report',
        },
      ],
      async (req) => {
        dispatched.push(req)
      },
    )

    // Monday 09:00
    const fired = await scheduler.tick(new Date('2026-03-16T09:00:00'))
    assert.deepEqual(fired, ['daily'])
    assert.equal(dispatched.length, 1)
    assert.equal(dispatched[0]?.agentName, 'assistant')
    assert.equal(dispatched[0]?.sessionKey, 'cron:daily')
    assert.equal(dispatched[0]?.message, 'Generate report')
  })

  it('does not fire non-matching jobs', async () => {
    const dispatched: DispatchRequest[] = []
    const scheduler = new CronScheduler(
      [
        {
          name: 'weekday',
          agent: 'assistant',
          schedule: '0 9 * * MON-FRI',
          message: 'report',
        },
      ],
      async (req) => {
        dispatched.push(req)
      },
    )

    // Saturday 09:00
    const fired = await scheduler.tick(new Date('2026-03-21T09:00:00'))
    assert.deepEqual(fired, [])
    assert.equal(dispatched.length, 0)
  })

  it('does not fire same job twice in same minute', async () => {
    const dispatched: DispatchRequest[] = []
    const scheduler = new CronScheduler(
      [
        {
          name: 'every',
          agent: 'assistant',
          schedule: '* * * * *',
          message: 'ping',
        },
      ],
      async (req) => {
        dispatched.push(req)
      },
    )

    const now = new Date('2026-03-17T10:00:00')
    await scheduler.tick(now)
    await scheduler.tick(now) // same minute
    assert.equal(dispatched.length, 1)
  })

  it('handles dispatch errors gracefully', async () => {
    const scheduler = new CronScheduler(
      [
        {
          name: 'failing',
          agent: 'assistant',
          schedule: '* * * * *',
          message: 'fail',
        },
      ],
      async () => {
        throw new Error('dispatch error')
      },
    )

    // Should not throw
    const fired = await scheduler.tick(new Date('2026-03-17T10:00:00'))
    assert.deepEqual(fired, ['failing'])
  })

  it('start and stop lifecycle', () => {
    const scheduler = new CronScheduler([], async () => {})
    scheduler.start()
    scheduler.stop()
    // Should not throw or leak
  })
})
