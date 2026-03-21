import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createSttProvider } from '../stt/provider.js'
import { createTtsProvider } from '../tts/provider.js'

describe('TTS providers', () => {
  it('creates elevenlabs provider', () => {
    const tts = createTtsProvider('elevenlabs', { apiKey: 'test' })
    assert.equal(tts.name, 'elevenlabs')
    assert.equal(tts.format, 'mp3')
  })

  it('creates openai-tts provider', () => {
    const tts = createTtsProvider('openai-tts', { apiKey: 'test' })
    assert.equal(tts.name, 'openai-tts')
    assert.equal(tts.format, 'mp3')
  })

  it('creates edge-tts provider', () => {
    const tts = createTtsProvider('edge-tts')
    assert.equal(tts.name, 'edge-tts')
    assert.equal(tts.format, 'mp3')
  })

  it('creates system provider', () => {
    const tts = createTtsProvider('system')
    assert.equal(tts.name, 'system')
    assert.equal(tts.format, 'wav')
  })

  it('elevenlabs requires API key for synthesis', async () => {
    const tts = createTtsProvider('elevenlabs')
    await assert.rejects(() => tts.synthesize('hello'), /API key required/)
  })

  it('openai-tts requires API key for synthesis', async () => {
    const tts = createTtsProvider('openai-tts')
    await assert.rejects(() => tts.synthesize('hello'), /API key required/)
  })
})

describe('STT providers', () => {
  it('creates deepgram provider', () => {
    const stt = createSttProvider('deepgram', { apiKey: 'test' })
    assert.equal(stt.name, 'deepgram')
  })

  it('creates whisper provider', () => {
    const stt = createSttProvider('whisper', { apiKey: 'test' })
    assert.equal(stt.name, 'whisper')
  })

  it('deepgram requires API key', async () => {
    const stt = createSttProvider('deepgram')
    await assert.rejects(
      () => stt.transcribe(Buffer.from('test')),
      /API key required/,
    )
  })

  it('whisper requires API key', async () => {
    const stt = createSttProvider('whisper')
    await assert.rejects(
      () => stt.transcribe(Buffer.from('test')),
      /API key required/,
    )
  })
})
