#!/usr/bin/env bash
# setup-systemd.sh — First-time setup of openAIOS on forge-smith
# Run as root (or with sudo) on the target server.
# Usage: sudo ./scripts/setup-systemd.sh
set -euo pipefail

SERVICE_USER="${SERVICE_USER:-aios}"
SERVICE_DIR="${SERVICE_DIR:-/home/aios/openaios}"
ENV_FILE="${ENV_FILE:-/home/aios/.env}"
SERVICE_NAME="${SERVICE_NAME:-openaios}"
NODE_BIN="${NODE_BIN:-$(which node 2>/dev/null || echo /usr/local/bin/node)}"
PNPM_BIN="${PNPM_BIN:-$(which pnpm 2>/dev/null || echo /usr/local/bin/pnpm)}"

echo "=== openAIOS System Setup ==="
echo "Service user:  ${SERVICE_USER}"
echo "Service dir:   ${SERVICE_DIR}"
echo "Node binary:   ${NODE_BIN}"
echo ""

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (use sudo)"
  exit 1
fi

# Create service user if needed
if ! id "${SERVICE_USER}" &>/dev/null; then
  useradd --system --create-home --shell /usr/sbin/nologin "${SERVICE_USER}"
  echo "✓ Created user: ${SERVICE_USER}"
else
  echo "✓ User already exists: ${SERVICE_USER}"
fi

# Create required directories
mkdir -p "${SERVICE_DIR}"
mkdir -p "/home/${SERVICE_USER}/workspaces"
mkdir -p "/home/${SERVICE_USER}/data"
chown -R "${SERVICE_USER}:${SERVICE_USER}" "/home/${SERVICE_USER}"
echo "✓ Directories created"

# Create env file with placeholder if it doesn't exist
if [[ ! -f "${ENV_FILE}" ]]; then
  cat > "${ENV_FILE}" <<'EOF'
# openAIOS environment — edit with your actual values
# chmod 600 /home/aios/.env — NEVER commit this file

# Telegram bot tokens (one per agent)
TELEGRAM_TOKEN_ASSISTANT=

# Cloud model API keys (optional)
# ANTHROPIC_API_KEY=
# GROQ_API_KEY=
# OPENROUTER_API_KEY=

# Bot Resources (optional — omit for standalone)
# BR_URL=
# BR_TOKEN=
EOF
  chmod 600 "${ENV_FILE}"
  chown "${SERVICE_USER}:${SERVICE_USER}" "${ENV_FILE}"
  echo "✓ Created env file: ${ENV_FILE} (edit before starting service)"
else
  echo "✓ Env file already exists: ${ENV_FILE}"
fi

# Write systemd unit
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=openAIOS — AI agent runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${SERVICE_DIR}
EnvironmentFile=/home/${SERVICE_USER}/.env
Environment=PATH=/home/${SERVICE_USER}/.nvm/versions/node/v22.22.0/bin:/home/${SERVICE_USER}/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=${NODE_BIN} packages/cli/dist/bin/openaios.js start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

# Security hardening
# Note: agents run as this user — blast radius is /home/${SERVICE_USER}
NoNewPrivileges=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
echo "✓ Systemd unit installed: ${SERVICE_NAME}.service"

# Allow aios user to restart its own service without password
if ! grep -q "${SERVICE_USER}.*systemctl.*${SERVICE_NAME}" /etc/sudoers 2>/dev/null; then
  echo "${SERVICE_USER} ALL=(ALL) NOPASSWD: /bin/systemctl restart ${SERVICE_NAME}.service, /bin/systemctl stop ${SERVICE_NAME}.service, /bin/systemctl start ${SERVICE_NAME}.service" \
    >> /etc/sudoers.d/openaios
  chmod 440 /etc/sudoers.d/openaios
  echo "✓ Sudo rule added for service management"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Deploy the application:  ./scripts/deploy.sh"
echo "  2. Edit the env file:       sudo nano ${ENV_FILE}"
echo "  3. Enable and start:        sudo systemctl enable --now ${SERVICE_NAME}"
echo "  4. Check logs:              sudo journalctl -u ${SERVICE_NAME} -f"
