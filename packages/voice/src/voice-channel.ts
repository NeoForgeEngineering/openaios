import type {
  ChannelAdapter,
  ChannelTarget,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'
import type { SttProvider } from './stt/provider.js'
import type { TtsProvider } from './tts/provider.js'

export interface VoiceChannelOptions {
  /** Underlying channel adapter to wrap */
  channel: ChannelAdapter
  /** TTS provider for outbound voice */
  tts: TtsProvider
  /** STT provider for inbound voice (optional — text messages pass through) */
  stt?: SttProvider
  /** Callback to send audio back through the channel */
  sendAudio?: (
    target: ChannelTarget,
    audio: Buffer,
    format: string,
  ) => Promise<void>
}

/**
 * Voice channel decorator — wraps any ChannelAdapter with TTS/STT.
 *
 * - Inbound: if STT configured and message has audio attachment, transcribes first
 * - Outbound: synthesizes text to audio via TTS, sends both text and audio
 */
export class VoiceChannel implements ChannelAdapter {
  readonly channelType: string
  private inner: ChannelAdapter
  private tts: TtsProvider
  private stt?: SttProvider
  private sendAudioFn?: (
    target: ChannelTarget,
    audio: Buffer,
    format: string,
  ) => Promise<void>
  private handler?: MessageHandler

  constructor(opts: VoiceChannelOptions) {
    this.inner = opts.channel
    this.tts = opts.tts
    if (opts.stt !== undefined) this.stt = opts.stt
    if (opts.sendAudio !== undefined) this.sendAudioFn = opts.sendAudio
    this.channelType = `voice:${opts.channel.channelType}`
  }

  async start(): Promise<void> {
    this.inner.onMessage(async (msg) => {
      if (!this.handler) return

      // If STT is configured and message has audio, transcribe
      let processedMsg = msg
      if (this.stt && msg.attachments?.some((a) => a.type === 'audio')) {
        const audioAtt = msg.attachments.find((a) => a.type === 'audio')
        if (audioAtt?.url) {
          try {
            const res = await fetch(audioAtt.url, {
              signal: AbortSignal.timeout(30_000),
            })
            const audio = Buffer.from(await res.arrayBuffer())
            const transcript = await this.stt.transcribe(audio)
            processedMsg = {
              ...msg,
              text: transcript || msg.text,
            }
          } catch (err) {
            logger.warn(
              '[voice]',
              `STT failed, using text: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      }

      await this.handler(processedMsg)
    })

    await this.inner.start()
    logger.info('[voice]', `Voice channel started (${this.channelType})`)
  }

  async stop(): Promise<void> {
    await this.inner.stop()
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    // Send text through inner channel
    await this.inner.send(target, msg)

    // Also synthesize and send audio if sendAudio callback is configured
    if (this.sendAudioFn && msg.text) {
      try {
        const audio = await this.tts.synthesize(msg.text)
        await this.sendAudioFn(target, audio, this.tts.format)
      } catch (err) {
        logger.warn(
          '[voice]',
          `TTS failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }
}
