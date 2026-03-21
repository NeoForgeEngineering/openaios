import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { Attachment, InboundMessage } from '@openaios/core'
import { DmAllowlist } from '../shared/dm-allowlist.js'
import { shouldProcessGroupMessage } from '../shared/group-router.js'
import { filterAttachments } from '../shared/media-limits.js'
import { chunkMessage } from '../shared/message-chunker.js'
import { ReplyThreader } from '../shared/reply-threader.js'

// ---------------------------------------------------------------------------
// message-chunker
// ---------------------------------------------------------------------------

describe('chunkMessage', () => {
  it('returns single chunk for short message', () => {
    const chunks = chunkMessage('hello', 100)
    assert.deepEqual(chunks, ['hello'])
  })

  it('splits at paragraph boundary', () => {
    const text = 'paragraph one\n\nparagraph two\n\nparagraph three'
    const chunks = chunkMessage(text, 30)
    assert.ok(chunks.length >= 2)
    assert.ok(chunks[0]?.includes('paragraph one'))
  })

  it('splits at newline when no paragraph boundary', () => {
    const text = 'line one\nline two\nline three'
    const chunks = chunkMessage(text, 15)
    assert.ok(chunks.length >= 2)
  })

  it('splits at space as fallback', () => {
    const text = 'word1 word2 word3 word4 word5'
    const chunks = chunkMessage(text, 12)
    assert.ok(chunks.length >= 2)
  })

  it('hard splits when no boundaries', () => {
    const text = 'a'.repeat(20)
    const chunks = chunkMessage(text, 10)
    assert.equal(chunks.length, 2)
    assert.equal(chunks[0]?.length, 10)
  })
})

// ---------------------------------------------------------------------------
// group-router
// ---------------------------------------------------------------------------

describe('shouldProcessGroupMessage', () => {
  const baseMsg: InboundMessage = {
    messageId: '1',
    source: { id: 'chat-1' },
    userId: 'user-1',
    text: 'hello',
    timestamp: Date.now() / 1000,
  }

  it('allows DM messages', () => {
    assert.equal(shouldProcessGroupMessage(baseMsg), true)
  })

  it('allows group messages with mention', () => {
    const msg = { ...baseMsg, isGroup: true, mentionsBot: true }
    assert.equal(shouldProcessGroupMessage(msg), true)
  })

  it('blocks group messages without mention', () => {
    const msg = { ...baseMsg, isGroup: true, mentionsBot: false }
    assert.equal(shouldProcessGroupMessage(msg), false)
  })

  it('allows group messages when requireMention is false', () => {
    const msg = { ...baseMsg, isGroup: true, mentionsBot: false }
    assert.equal(
      shouldProcessGroupMessage(msg, { requireMention: false }),
      true,
    )
  })
})

// ---------------------------------------------------------------------------
// dm-allowlist
// ---------------------------------------------------------------------------

describe('DmAllowlist', () => {
  it('allows all when empty', () => {
    const al = new DmAllowlist([])
    assert.equal(al.isAllowed('anyone'), true)
  })

  it('allows listed users', () => {
    const al = new DmAllowlist(['user-1', 'user-2'])
    assert.equal(al.isAllowed('user-1'), true)
    assert.equal(al.isAllowed('user-3'), false)
  })

  it('add and remove', () => {
    const al = new DmAllowlist([])
    al.add('user-1')
    assert.equal(al.isAllowed('user-1'), true)
    al.remove('user-1')
    // After removing the only user, the set is empty → all allowed
    assert.equal(al.isAllowed('user-1'), true)
  })
})

// ---------------------------------------------------------------------------
// reply-threader
// ---------------------------------------------------------------------------

describe('ReplyThreader', () => {
  it('tracks and retrieves message IDs', () => {
    const rt = new ReplyThreader()
    rt.track('session-1', 'msg-42')
    assert.equal(rt.getReplyTo('session-1'), 'msg-42')
  })

  it('returns undefined for unknown session', () => {
    const rt = new ReplyThreader()
    assert.equal(rt.getReplyTo('unknown'), undefined)
  })

  it('clears tracking', () => {
    const rt = new ReplyThreader()
    rt.track('session-1', 'msg-42')
    rt.clear('session-1')
    assert.equal(rt.getReplyTo('session-1'), undefined)
  })

  it('overwrites with latest message', () => {
    const rt = new ReplyThreader()
    rt.track('session-1', 'msg-1')
    rt.track('session-1', 'msg-2')
    assert.equal(rt.getReplyTo('session-1'), 'msg-2')
  })
})

// ---------------------------------------------------------------------------
// media-limits
// ---------------------------------------------------------------------------

describe('filterAttachments', () => {
  const img: Attachment = { type: 'image', size: 1000 }
  const video: Attachment = { type: 'video', size: 50_000_000 }
  const audio: Attachment = { type: 'audio', size: 5000 }

  it('allows all when no limits', () => {
    const { allowed, rejected } = filterAttachments([img, video])
    assert.equal(allowed.length, 2)
    assert.equal(rejected.length, 0)
  })

  it('filters by type', () => {
    const { allowed, rejected } = filterAttachments([img, video, audio], {
      allowedTypes: ['image', 'audio'],
    })
    assert.equal(allowed.length, 2)
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0]?.type, 'video')
  })

  it('filters by size', () => {
    const { allowed, rejected } = filterAttachments([img, video], {
      maxSizeBytes: 10_000,
    })
    assert.equal(allowed.length, 1)
    assert.equal(rejected.length, 1)
    assert.equal(rejected[0]?.type, 'video')
  })

  it('combines type and size filters', () => {
    const { allowed } = filterAttachments([img, video, audio], {
      allowedTypes: ['image', 'audio'],
      maxSizeBytes: 2000,
    })
    assert.equal(allowed.length, 1) // Only img (1000 bytes, image type)
  })
})
