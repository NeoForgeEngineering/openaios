import { Bot, GrammyError, HttpError } from 'grammy'
import type { ChannelAdapter, ChannelTarget, InboundMessage, MessageHandler, OutboundMessage } from '@openaios/core'

const MAX_TELEGRAM_MESSAGE_LENGTH = 4096

export class TelegramAdapter implements ChannelAdapter {
  readonly channelType = 'telegram'
  private readonly bot: Bot
  private handler?: MessageHandler
  private running = false

  constructor(token: string) {
    this.bot = new Bot(token)
    this.setupHandlers()
  }

  private setupHandlers(): void {
    this.bot.on('message:text', async (ctx) => {
      if (!this.handler) return
      if (!ctx.message.text) return

      const msg: InboundMessage = {
        messageId: String(ctx.message.message_id),
        source: {
          id: String(ctx.chat.id),
          threadId: ctx.message.message_thread_id
            ? String(ctx.message.message_thread_id)
            : undefined,
        },
        userId: String(ctx.from?.id ?? ctx.chat.id),
        userName: ctx.from?.username ?? ctx.from?.first_name,
        text: ctx.message.text,
        timestamp: ctx.message.date,
      }

      await this.handler(msg)
    })

    this.bot.catch((err) => {
      if (err instanceof GrammyError) {
        console.error('[telegram] API error:', err.description)
      } else if (err instanceof HttpError) {
        console.error('[telegram] Network error:', err.message)
      } else {
        console.error('[telegram] Unknown error:', err)
      }
    })
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    // Start polling in the background — don't await (it runs indefinitely)
    this.bot.start({
      onStart: (info) => {
        console.log(`[telegram] Polling as @${info.username}`)
      },
    }).catch((err) => {
      console.error('[telegram] Bot crashed:', err)
      this.running = false
    })
  }

  async stop(): Promise<void> {
    if (!this.running) return
    await this.bot.stop()
    this.running = false
    console.log('[telegram] Stopped')
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    const chatId = Number(target.id)
    const text = truncate(msg.text, MAX_TELEGRAM_MESSAGE_LENGTH)

    const parseMode = msg.parseMode === 'markdown'
      ? 'Markdown'
      : msg.parseMode === 'html'
        ? 'HTML'
        : undefined

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: parseMode,
        reply_parameters: msg.replyToMessageId
          ? { message_id: Number(msg.replyToMessageId) }
          : undefined,
        message_thread_id: target.threadId ? Number(target.threadId) : undefined,
      })
    } catch (err) {
      // Retry without parse_mode if Markdown fails (e.g. malformed output from LLM)
      if (parseMode && err instanceof GrammyError && err.description.includes('parse')) {
        await this.bot.api.sendMessage(chatId, text, {
          reply_parameters: msg.replyToMessageId
            ? { message_id: Number(msg.replyToMessageId) }
            : undefined,
        })
      } else {
        throw err
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}
