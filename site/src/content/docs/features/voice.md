---
title: Voice
description: Text-to-speech and speech-to-text with ElevenLabs, OpenAI, Edge-TTS, Deepgram, and Whisper.
sidebar:
  order: 10
---

The `@openaios/voice` package adds **voice capabilities** to any channel — TTS for outbound messages and STT for inbound audio.

## TTS Providers

| Provider | Format | Key required | Notes |
|----------|--------|-------------|-------|
| `elevenlabs` | MP3 | Yes | High quality, many voices |
| `openai-tts` | MP3 | Yes | OpenAI TTS-1 model |
| `edge-tts` | MP3 | No | Free, Microsoft Edge voices (subprocess) |
| `system` | WAV | No | macOS `say` or Linux `espeak` |

## STT Providers

| Provider | Key required | Notes |
|----------|-------------|-------|
| `deepgram` | Yes | Nova-2 model, real-time capable |
| `whisper` | Yes | OpenAI Whisper API |

## Configuration

```yaml
voice:
  tts:
    provider: elevenlabs        # elevenlabs | openai-tts | edge-tts | system
    api_key: ${ELEVENLABS_KEY}
    voice: Rachel               # provider-specific voice name
  stt:
    provider: deepgram          # deepgram | whisper
    api_key: ${DEEPGRAM_KEY}
    model: nova-2               # provider-specific model
```

## Voice Channel Wrapper

The `VoiceChannel` decorator wraps any existing `ChannelAdapter` with voice capabilities:

```typescript
import { VoiceChannel, createTtsProvider, createSttProvider } from '@openaios/voice'

const voiceChannel = new VoiceChannel({
  channel: telegramAdapter,   // any ChannelAdapter
  tts: createTtsProvider('elevenlabs', { apiKey: '...' }),
  stt: createSttProvider('deepgram', { apiKey: '...' }),
  sendAudio: async (target, audio, format) => {
    // Send audio back through the channel
    await telegramBot.sendAudio(target.id, audio)
  },
})
```

### How it works

**Inbound (STT):**
1. Message arrives with audio attachment
2. Audio is fetched and sent to STT provider
3. Transcribed text replaces the message text
4. Handler receives text as normal

**Outbound (TTS):**
1. Agent produces text response
2. Text is sent through the inner channel (as text)
3. TTS synthesizes audio from the text
4. Audio is sent via the `sendAudio` callback

## Audio Pipeline

The `convertAudio` utility converts between audio formats using ffmpeg:

```typescript
import { convertAudio, isFfmpegAvailable } from '@openaios/voice'

if (await isFfmpegAvailable()) {
  const mp3 = await convertAudio(wavBuffer, {
    from: 'wav',
    to: 'mp3',
    sampleRate: 22050,
  })
}
```

:::note
ffmpeg is required for audio format conversion. Install it with `brew install ffmpeg` (macOS) or `apt install ffmpeg` (Linux).
:::
