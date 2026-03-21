---
title: Channels
description: Connect agents to Telegram, Slack, WhatsApp, Signal, iMessage, Google Chat, Discord, and webhooks.
sidebar:
  order: 6
---

The `@openaios/channels` package connects agents to messaging platforms. Each channel adapter implements the same `ChannelAdapter` interface — start, stop, send, onMessage.

## Supported Channels

| Channel | SDK / Method | Status |
|---------|-------------|--------|
| **Telegram** | grammy (polling) | Production |
| **Webhook** | Built-in HTTP (synchronous) | Production |
| **Slack** | @slack/bolt (Socket Mode) | Ready |
| **WhatsApp** | @whiskeysockets/baileys | Ready |
| **Signal** | signal-cli (JSON-RPC) | Ready |
| **iMessage** | AppleScript (macOS only) | Ready |
| **Google Chat** | Webhook push | Ready |
| **Discord** | Planned | Stub |

## Configuration

```yaml
agents:
  - name: assistant
    channels:
      telegram:
        token: ${TELEGRAM_TOKEN}

      webhook:
        path: /webhook
        secret: ${WEBHOOK_SECRET}

      slack:
        token: ${SLACK_BOT_TOKEN}
        app_token: ${SLACK_APP_TOKEN}
        # signing_secret: ${SLACK_SIGNING_SECRET}

      whatsapp:
        session_name: default    # multi-device session name

      signal:
        phone_number: "+1234567890"
        # bin: /usr/local/bin/signal-cli

      imessage:
        poll_interval_ms: 5000   # macOS only

      google_chat:
        path: /google-chat       # webhook endpoint path

      # Group and DM settings (apply to all channels)
      group_routing:
        require_mention: true    # only respond when @mentioned in groups

      dm_allowlist:
        user_ids:                # empty = allow all
          - "user-123"
          - "user-456"
```

## Shared Utilities

### Message Chunker

Long responses are automatically split at paragraph boundaries to fit channel-specific limits (e.g. 4096 chars for Telegram, 4000 for Slack).

### Group Router

In group chats, agents only respond when mentioned (configurable via `group_routing.require_mention`). DMs always pass through.

### DM Allowlist

Restrict which users can DM an agent. When the allowlist is empty, all users are allowed.

### Reply Threader

Tracks conversation threads so responses are sent as replies to the original message, maintaining context in threaded channels.

### Media Limits

Filter inbound attachments by type and size per channel:
- Type filtering: allow only images and audio
- Size filtering: reject files over a threshold

## Adding a new channel

Implement the `ChannelAdapter` interface from `@openaios/core`:

```typescript
interface ChannelAdapter {
  start(): Promise<void>
  stop(): Promise<void>
  send(target: ChannelTarget, msg: OutboundMessage): Promise<void>
  onMessage(handler: MessageHandler): void
  readonly channelType: string
}
```

Messages now include optional fields for group routing and media:

```typescript
interface InboundMessage {
  // ... existing fields ...
  isGroup?: boolean           // group chat flag
  mentionsBot?: boolean       // bot was @mentioned
  attachments?: Attachment[]  // images, audio, video, files
}
```
