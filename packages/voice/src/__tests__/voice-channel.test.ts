import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MockChannel } from '@openaios/core/testing'
import type { TtsProvider } from '../tts/provider.js'
import { VoiceChannel } from '../voice-channel.js'

class MockTts implements TtsProvider {
  readonly format = 'mp3'
  readonly name = 'mock-tts'
  calls: string[] = []

  async synthesize(text: string): Promise<Buffer> {
    this.calls.push(text)
    return Buffer.from(`audio:${text}`)
  }
}

describe('VoiceChannel', () => {
  it('wraps channel type', () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const vc = new VoiceChannel({ channel: inner, tts })
    assert.equal(vc.channelType, 'voice:mock')
  })

  it('passes messages through to handler', async () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const vc = new VoiceChannel({ channel: inner, tts })

    const received: string[] = []
    vc.onMessage(async (msg) => {
      received.push(msg.text)
    })
    await vc.start()

    await inner.simulateMessage({
      messageId: '1',
      source: { id: 'chat-1' },
      userId: 'user-1',
      text: 'hello',
      timestamp: Date.now() / 1000,
    })

    assert.deepEqual(received, ['hello'])
  })

  it('sends text through inner channel', async () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const vc = new VoiceChannel({ channel: inner, tts })

    await vc.send({ id: 'chat-1' }, { text: 'response' })
    assert.equal(inner.sent.length, 1)
    assert.equal(inner.sent[0]?.msg.text, 'response')
  })

  it('synthesizes audio when sendAudio callback provided', async () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const audioSent: Array<{ target: string; format: string }> = []

    const vc = new VoiceChannel({
      channel: inner,
      tts,
      sendAudio: async (target, _audio, format) => {
        audioSent.push({ target: target.id, format })
      },
    })

    await vc.send({ id: 'chat-1' }, { text: 'hello' })

    assert.equal(tts.calls.length, 1)
    assert.equal(tts.calls[0], 'hello')
    assert.equal(audioSent.length, 1)
    assert.equal(audioSent[0]?.format, 'mp3')
  })

  it('does not send audio without sendAudio callback', async () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const vc = new VoiceChannel({ channel: inner, tts })

    await vc.send({ id: 'chat-1' }, { text: 'hello' })
    assert.equal(tts.calls.length, 0) // No synthesis without callback
  })

  it('stop delegates to inner', async () => {
    const inner = new MockChannel()
    const tts = new MockTts()
    const vc = new VoiceChannel({ channel: inner, tts })

    await vc.start()
    await vc.stop()
    assert.equal(inner.running, false)
  })
})
