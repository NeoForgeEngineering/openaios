import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
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

export interface SignalAdapterOptions {
  /** Phone number registered with signal-cli */
  phoneNumber: string
  /** Path to signal-cli binary */
  bin?: string
}

/**
 * Signal adapter using signal-cli in JSON-RPC mode.
 * Requires signal-cli installed and registered.
 */
export class SignalAdapter implements ChannelAdapter {
  readonly channelType = 'signal'
  private handler?: MessageHandler
  private options: SignalAdapterOptions
  private process: ReturnType<typeof spawn> | undefined

  constructor(options: SignalAdapterOptions) {
    this.options = options
  }

  async start(): Promise<void> {
    const bin = this.options.bin ?? 'signal-cli'

    this.process = spawn(bin, ['-u', this.options.phoneNumber, 'jsonRpc'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const rl = createInterface({ input: this.process.stdout! })

    rl.on('line', (line: string) => {
      try {
        const data = JSON.parse(line) as Record<string, unknown>
        if (data.method === 'receive') {
          void this.handleReceive(data.params as Record<string, unknown>)
        }
      } catch {
        // Ignore non-JSON lines
      }
    })

    this.process.on('error', (err) => {
      logger.error('[signal]', `signal-cli error: ${err.message}`)
    })

    logger.info(
      '[signal]',
      `Signal adapter started for ${this.options.phoneNumber}`,
    )
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM')
      this.process = undefined
    }
  }

  async send(target: ChannelTarget, msg: OutboundMessage): Promise<void> {
    if (!this.process?.stdin) return

    const chunks = chunkMessage(msg.text, MAX_MESSAGE_LENGTH)
    for (const chunk of chunks) {
      const rpc = JSON.stringify({
        jsonrpc: '2.0',
        method: 'send',
        params: {
          recipient: [target.id],
          message: chunk,
        },
      })
      this.process.stdin.write(`${rpc}\n`)
    }
  }

  onMessage(handler: MessageHandler): void {
    this.handler = handler
  }

  private async handleReceive(params: Record<string, unknown>): Promise<void> {
    if (!this.handler) return

    const envelope = params.envelope as Record<string, unknown> | undefined
    if (!envelope) return

    const dataMessage = envelope.dataMessage as
      | Record<string, unknown>
      | undefined
    if (!dataMessage?.message) return

    const source = String(envelope.source ?? '')
    const groupInfo = dataMessage.groupInfo as
      | Record<string, unknown>
      | undefined

    const inbound: InboundMessage = {
      messageId: String(dataMessage.timestamp ?? Date.now()),
      source: {
        id: groupInfo ? String(groupInfo.groupId ?? '') : source,
      },
      userId: source,
      text: String(dataMessage.message),
      timestamp: Number(dataMessage.timestamp ?? Date.now()) / 1000,
      ...(groupInfo !== undefined && { isGroup: true }),
    }

    try {
      await this.handler(inbound)
    } catch (err) {
      logger.error(
        '[signal]',
        `Handler error: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
}
