import type { IncomingMessage, Server, ServerResponse } from 'node:http'
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

export interface GoogleChatAdapterOptions {
  /** HTTP server to register the webhook handler on */
  server: Server
  /** Path for the Google Chat webhook */
  path?: string
  /** Project ID for Google API (for sending messages) */
  projectId?: string
  /** Service account credentials JSON path */
  credentialsPath?: string
}

/**
 * Google Chat adapter using webhook push model.
 * Google Chat sends events to a configured webhook URL.
 */
export class GoogleChatAdapter implements ChannelAdapter {
  readonly channelType = 'google-chat'
  private handler?: MessageHandler
  private options: GoogleChatAdapterOptions
  private path: string

  constructor(options: GoogleChatAdapterOptions) {
    this.options = options
    this.path = options.path ?? '/google-chat'
  }

  async start(): Promise<void> {
    this.options.server.on(
      'request',
      (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST' || req.url !== this.path) return

        let body = ''
        req.setEncoding('utf-8')
        req.on('data', (chunk: string) => {
          body += chunk
        })
        req.on('end', () => {
          void this.handleWebhook(body, res)
        })
      },
    )

    logger.info('[google-chat]', `Google Chat adapter started on ${this.path}`)
  }

  async stop(): Promise<void> {
    // Server lifecycle managed externally
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    // Google Chat API requires OAuth2 or service account auth
    // For webhook-based spaces, responses are sent inline in handleWebhook
    // For proactive messages, would use chat.googleapis.com/v1/spaces/{space}/messages
    const chunks = chunkMessage(msg.text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      try {
        const response = await fetch(
          `https://chat.googleapis.com/v1/${target.id}/messages`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: chunk }),
            signal: AbortSignal.timeout(10_000),
          },
        )
        if (!response.ok) {
          logger.error('[google-chat]', `Send failed: ${response.status}`)
        }
      } catch (err) {
        logger.error(
          '[google-chat]',
          `Send failed: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  private async handleWebhook(
    body: string,
    res: ServerResponse,
  ): Promise<void> {
    if (!this.handler) {
      res.writeHead(200).end('{}')
      return
    }

    try {
      const event = JSON.parse(body) as Record<string, unknown>
      const message = event.message as Record<string, unknown> | undefined

      if (!message?.text) {
        res.writeHead(200).end('{}')
        return
      }

      const sender = message.sender as Record<string, unknown> | undefined
      const space = event.space as Record<string, unknown> | undefined
      const isGroup = (space?.type ?? '') === 'ROOM'

      const inbound: InboundMessage = {
        messageId: String(message.name ?? Date.now()),
        source: { id: String(space?.name ?? '') },
        userId: String(sender?.name ?? ''),
        ...(sender?.displayName !== undefined && {
          userName: String(sender.displayName),
        }),
        text: String(message.text),
        timestamp: Date.now() / 1000,
        ...(isGroup && { isGroup: true }),
      }

      await this.handler(inbound)
      res.writeHead(200).end('{}')
    } catch (err) {
      logger.error(
        '[google-chat]',
        `Webhook error: ${err instanceof Error ? err.message : String(err)}`,
      )
      res.writeHead(500).end('{}')
    }
  }
}
