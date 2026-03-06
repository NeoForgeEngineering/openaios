# openAIOS Deployment

## Overview

- **Dev machine**: MacBook Air (develop + build)
- **Production**: forge-smith (mini PC, Ubuntu 24.04, systemd)
- **Transport**: Tailscale SSH
- **Process manager**: systemd

## First-Time Setup (forge-smith)

Run once on the server as root:

```bash
git clone https://github.com/NeoForgeEngineering/openaios /tmp/openaios-setup
sudo bash /tmp/openaios-setup/scripts/setup-systemd.sh
```

This creates:
- `aios` system user at `/home/aios/`
- Directory structure: `/home/aios/openaios/`, `/home/aios/workspaces/`, `/home/aios/data/`
- Env file: `/home/aios/.env` (edit with your secrets)
- Systemd unit: `/etc/systemd/system/openaios.service`
- Sudo rule: `aios` can restart its own service

## Deploying from Mac

```bash
# Build
pnpm install && pnpm build

# Deploy (rsync + SSH restart)
REMOTE_HOST=forge-smith ./scripts/deploy.sh

# Dry run first
./scripts/deploy.sh --dry-run
```

### What deploy.sh does

1. Verifies Tailscale SSH connectivity
2. `rsync` built files to forge-smith (excludes `.env`, `openAIOS.yml`, `data/`, `workspaces/`)
3. `pnpm install --prod` on the remote
4. `sudo systemctl restart openaios`
5. Verifies the service is running

## Configuration

On forge-smith, the config lives at `/home/aios/openaios/openAIOS.yml` (not in git). Secrets are in `/home/aios/.env` (chmod 600).

```bash
# Edit config
nano /home/aios/openaios/openAIOS.yml

# Edit secrets
nano /home/aios/.env

# Restart after config change
sudo systemctl restart openaios
```

## Dashboard

Once running, the dashboard is available at `http://{tailscale-ip}:3000` (or `http://localhost:3000` if bound to localhost). It shows:

- Agent health, session counts, and budget usage
- Live log stream (SSE)
- All active sessions
- Latest security audit findings

## Logs

The runtime emits structured JSON logs to stdout (captured by journald):

```bash
# Follow logs
sudo journalctl -u openaios -f

# Last 100 lines
sudo journalctl -u openaios -n 100 --no-pager

# Filter by level (jq required)
sudo journalctl -u openaios -f -o cat | jq 'select(.level == "error")'
```

## Security Audit

Run a one-shot security audit against the current config:

```bash
cd /home/aios/openaios
openaios audit
```

Exits 0 if no ERROR findings, exits 1 otherwise. Suitable for CI gates.

## GitHub Actions CI/CD

Push to `main` triggers automatic deploy via `.github/workflows/deploy-forge-smith.yml`.

Required GitHub secrets (in the `forge-smith` environment):
- `FORGE_SMITH_HOST` — Tailscale hostname or IP
- `FORGE_SMITH_SSH_KEY` — Private SSH key for `aios@forge-smith`
- `TAILSCALE_OAUTH_CLIENT_ID` — For GitHub Actions Tailscale connection
- `TAILSCALE_OAUTH_SECRET`

## Node.js on forge-smith

Node.js 22 is managed via nvm for the `aios` user. The systemd unit includes the nvm path:

```
Environment=PATH=/home/aios/.nvm/versions/node/v22.22.0/bin:...
```

To update Node.js: install the new version via nvm as the `aios` user, then update the path in the systemd unit.
