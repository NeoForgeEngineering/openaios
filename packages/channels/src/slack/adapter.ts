import type {
  ChannelAdapter,
  ChannelTarget,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'
import { chunkMessage } from '../shared/message-chunker.js'

const MAX_MESSAGE_LENGTH = 4000

export interface SlackAdapterOptions {
  token: string
  appToken: string
  signingSecret?: string
}

/**
 * Slack adapter using @slack/bolt (Socket Mode).
 * Requires @slack/bolt as a peer dependency.
 */
export class SlackAdapter implements ChannelAdapter {
  readonly channelType = 'slack'
  private handler?: MessageHandler
  private options: SlackAdapterOptions
  // biome-ignore lint/suspicious/noExplicitAny: dynamic SDK
  private app: any

  constructor(options: SlackAdapterOptions) {
    this.options = options
  }

  async start(): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic import
    let BoltMod: any
    try {
      BoltMod = await (Function(
        'return import("@slack/bolt")',
      )() as Promise<unknown>)
    } catch {
      throw new Error(
        'Slack adapter requires @slack/bolt. Run: pnpm add @slack/bolt',
      )
    }

    const App = BoltMod.App ?? BoltMod.default?.App
    const app = new App({
      token: this.options.token,
      appToken: this.options.appToken,
      socketMode: true,
      ...(this.options.signingSecret !== undefined && {
        signingSecret: this.options.signingSecret,
      }),
    })

    app.message(
      async ({ message: msg }: { message: Record<string, unknown> }) => {
        if (!this.handler) return
        if (msg.subtype) return

        const inbound: InboundMessage = {
          messageId: String(msg.ts ?? ''),
          source: { id: String(msg.channel ?? '') },
          userId: String(msg.user ?? ''),
          text: String(msg.text ?? ''),
          timestamp: Number(msg.ts ?? Date.now() / 1000),
          isGroup:
            msg.channel_type === 'channel' || msg.channel_type === 'group',
          mentionsBot: String(msg.text ?? '').includes('<@'),
        }

        try {
          await this.handler(inbound)
        } catch (err) {
          logger.error(
            '[slack]',
            `Handler error: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      },
    )

    await app.start()
    this.app = app
    logger.info('[slack]', 'Slack adapter started (Socket Mode)')
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.stop()
    }
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    if (!this.app) return

    const chunks = chunkMessage(msg.text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await this.app.client.chat.postMessage({
        channel: target.id,
        text: chunk,
        ...(target.threadId !== undefined && { thread_ts: target.threadId }),
        ...(msg.replyToMessageId !== undefined && {
          thread_ts: msg.replyToMessageId,
        }),
      })
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }
}
