---
title: Deployment
description: Deploy openAIOS to production with systemd, Tailscale, and automated CI/CD.
sidebar:
  order: 2
---

openAIOS runs as a single Node.js process managed by systemd (Linux) or launchd (macOS).

## Quick deploy

```bash
# Install on target machine
curl -fsSL https://raw.githubusercontent.com/NeoForgeEngineering/openaios/main/install.sh | bash

# Create config
openaios init

# Install as system service
sudo openaios service install
openaios service start
```

## Production setup (Linux)

### 1. System user

```bash
sudo bash scripts/setup-systemd.sh
```

This creates:
- System user `aios` at `/home/aios/`
- Systemd unit `openaios.service`
- Sudoers rule for restart without password
- Correct directory permissions

### 2. Secrets

```bash
sudo -u aios tee /home/aios/.env << 'EOF'
TELEGRAM_TOKEN=your-bot-token
ANTHROPIC_API_KEY=sk-ant-...
EOF
sudo chmod 600 /home/aios/.env
```

### 3. Config

Place `openAIOS.yml` at `/home/aios/openaios/openAIOS.yml` (not in git).

### 4. Service management

```bash
openaios service start
openaios service stop
openaios service restart
openaios service status
openaios service logs        # follows journald
```

## Systemd unit

```ini
[Unit]
Description=openAIOS Agent Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=aios
WorkingDirectory=/home/aios/openaios
EnvironmentFile=/home/aios/.env
ExecStart=node packages/cli/dist/bin/openaios.js start
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=/home/aios

[Install]
WantedBy=multi-user.target
```

## Networking

openAIOS defaults to **Tailscale** binding — no public ports exposed. Options:

| `network.bind` | Behavior |
|----------------|----------|
| `tailscale` | Binds to Tailscale interface (default, most secure) |
| `localhost` | Binds to 127.0.0.1 (local dev) |
| `0.0.0.0` | Binds to all interfaces (use with caution) |
| IP address | Binds to specific interface |

## CI/CD with GitHub Actions

The included workflow auto-deploys on push to `main`:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tailscale/github-action@v2
        with:
          oauth-client-id: ${{ secrets.TS_CLIENT_ID }}
          oauth-secret: ${{ secrets.TS_SECRET }}
      - run: |
          rsync -az --delete \
            --exclude node_modules --exclude .git --exclude data \
            ./ aios@forge-smith:~/openaios/
          ssh aios@forge-smith 'cd ~/openaios && pnpm install && pnpm build && sudo systemctl restart openaios'
```

## Monitoring

After deployment, the dashboard is available at `http://{bind}:{port}`:

- **Agent status** — health checks, session counts
- **Live logs** — SSE-streamed structured logs
- **Budget tracking** — per-agent spend vs limits
- **Security audit** — last audit results with findings

Logs are also available via journald:

```bash
sudo journalctl -u openaios -f
```

## Upgrades

```bash
openaios upgrade    # git pull, pnpm install, pnpm build, restart service
```
