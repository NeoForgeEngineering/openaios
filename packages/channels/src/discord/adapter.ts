import type { ChannelAdapter, ChannelTarget, MessageHandler, OutboundMessage } from '@openaios/core'

/**
 * DiscordAdapter — Phase 7 (not yet implemented).
 * Stub that throws on start() to prevent accidental use.
 */
export class DiscordAdapter implements ChannelAdapter {
  readonly channelType = 'discord'

  async start(): Promise<void> {
    throw new Error('DiscordAdapter is not yet implemented (Phase 7)')
  }

  async stop(): Promise<void> {}

  async send(_target: ChannelTarget, _msg: OutboundMessage): Promise<void> {
    throw new Error('DiscordAdapter is not yet implemented (Phase 7)')
  }

  onMessage(_handler: MessageHandler): void {}
}
