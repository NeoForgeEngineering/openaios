import type {
  ChannelAdapter,
  ChannelTarget,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'
import { Bot, GrammyError, HttpError } from 'grammy'

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
          ...(ctx.message.message_thread_id !== undefined && {
            threadId: String(ctx.message.message_thread_id),
          }),
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
        logger.error('[telegram]', `API error: ${err.description}`)
      } else if (err instanceof HttpError) {
        logger.error('[telegram]', `Network error: ${err.message}`)
      } else {
        logger.error('[telegram]', 'Unknown error', err)
      }
    })
  }

  async start(): Promise<void> {
    if (this.running) return
    this.running = true
    // Start polling in the background — don't await (it runs indefinitely)
    this.bot
      .start({
        onStart: (info) => {
          logger.info('[telegram]', `Polling as @${info.username}`)
        },
      })
      .catch((err) => {
        logger.error('[telegram]', 'Bot crashed', err)
        this.running = false
      })
  }

  async stop(): Promise<void> {
    if (!this.running) return
    await this.bot.stop()
    this.running = false
    logger.info('[telegram]', 'Stopped')
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    const chatId = Number(target.id)
    const text = truncate(msg.text, MAX_TELEGRAM_MESSAGE_LENGTH)

    const parseMode =
      msg.parseMode === 'markdown'
        ? 'Markdown'
        : msg.parseMode === 'html'
          ? 'HTML'
          : undefined

    try {
      await this.bot.api.sendMessage(chatId, text, {
        ...(parseMode && { parse_mode: parseMode }),
        ...(msg.replyToMessageId && {
          reply_parameters: { message_id: Number(msg.replyToMessageId) },
        }),
        ...(target.threadId && { message_thread_id: Number(target.threadId) }),
      })
    } catch (err) {
      // Retry without parse_mode if Markdown fails (e.g. malformed output from LLM)
      if (
        parseMode &&
        err instanceof GrammyError &&
        err.description.includes('parse')
      ) {
        await this.bot.api.sendMessage(chatId, text, {
          ...(msg.replyToMessageId && {
            reply_parameters: { message_id: Number(msg.replyToMessageId) },
          }),
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
  return `${text.slice(0, maxLength - 3)}...`
}
