import type {
  ChannelAdapter,
  ChannelTarget,
  InboundMessage,
  MessageHandler,
  OutboundMessage,
} from '@openaios/core'
import { logger } from '@openaios/core'
import { chunkMessage } from '../shared/message-chunker.js'

const MAX_MESSAGE_LENGTH = 4096

export interface WhatsAppAdapterOptions {
  sessionName?: string
}

/**
 * WhatsApp adapter using @whiskeysockets/baileys.
 * Requires @whiskeysockets/baileys as a peer dependency.
 */
export class WhatsAppAdapter implements ChannelAdapter {
  readonly channelType = 'whatsapp'
  private handler?: MessageHandler
  private options: WhatsAppAdapterOptions
  // biome-ignore lint/suspicious/noExplicitAny: dynamic SDK
  private socket: any

  constructor(options?: WhatsAppAdapterOptions) {
    this.options = options ?? {}
  }

  async start(): Promise<void> {
    // biome-ignore lint/suspicious/noExplicitAny: dynamic import
    let baileys: any
    try {
      baileys = await (Function(
        'return import("@whiskeysockets/baileys")',
      )() as Promise<unknown>)
    } catch {
      throw new Error(
        'WhatsApp adapter requires @whiskeysockets/baileys. Run: pnpm add @whiskeysockets/baileys',
      )
    }

    const makeWASocket = baileys.default ?? baileys.makeWASocket
    const useMultiFileAuthState = baileys.useMultiFileAuthState

    const authDir = `.whatsapp-auth/${this.options.sessionName ?? 'default'}`
    const { state, saveCreds } = await useMultiFileAuthState(authDir)

    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: true,
    })

    sock.ev.on('creds.update', saveCreds)
    sock.ev.on(
      'messages.upsert',
      async ({ messages }: { messages: Array<Record<string, unknown>> }) => {
        if (!this.handler) return
        for (const msg of messages) {
          const key = msg.key as Record<string, unknown> | undefined
          if (key?.fromMe) continue

          const msgContent = msg.message as
            | Record<string, Record<string, string>>
            | undefined
          const text =
            msgContent?.conversation ??
            msgContent?.extendedTextMessage?.text ??
            ''

          if (!text) continue

          const jid = String(key?.remoteJid ?? '')
          const isGroup = jid.endsWith('@g.us')

          const inbound: InboundMessage = {
            messageId: String(key?.id ?? ''),
            source: { id: jid },
            userId: isGroup ? String(key?.participant ?? jid) : jid,
            text: String(text),
            timestamp: Number(msg.messageTimestamp ?? Date.now() / 1000),
            ...(isGroup && { isGroup: true }),
          }

          try {
            await this.handler(inbound)
          } catch (err) {
            logger.error(
              '[whatsapp]',
              `Handler error: ${err instanceof Error ? err.message : String(err)}`,
            )
          }
        }
      },
    )

    this.socket = sock
    logger.info('[whatsapp]', 'WhatsApp adapter started')
  }

  async stop(): Promise<void> {
    if (this.socket) {
      this.socket.end?.()
    }
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    if (!this.socket) return

    const chunks = chunkMessage(msg.text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      await this.socket.sendMessage(target.id, { text: chunk })
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }
}
