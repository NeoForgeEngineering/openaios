#!/usr/bin/env bash
# deploy.sh — Deploy openAIOS to forge-smith via Tailscale SSH
# Usage: ./scripts/deploy.sh [--dry-run]
set -euo pipefail

REMOTE_HOST="${REMOTE_HOST:-forge-smith}"
REMOTE_USER="${REMOTE_USER:-aios}"
REMOTE_DIR="${REMOTE_DIR:-/home/aios/openaios}"
SERVICE_NAME="${SERVICE_NAME:-openaios}"
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    *) echo "Unknown argument: $arg" && exit 1 ;;
  esac
done

echo "=== openAIOS Deploy ==="
echo "Target: ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}"
echo "Service: ${SERVICE_NAME}"
echo ""

# Verify Tailscale connectivity
if ! ssh -o ConnectTimeout=5 "${REMOTE_USER}@${REMOTE_HOST}" "echo ok" &>/dev/null; then
  echo "ERROR: Cannot reach ${REMOTE_HOST} via SSH. Is Tailscale connected?"
  exit 1
fi
echo "✓ SSH connectivity confirmed"

if $DRY_RUN; then
  echo "(dry-run) Would rsync to ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"
  echo "(dry-run) Would restart ${SERVICE_NAME}.service"
  exit 0
fi

# Sync — exclude secrets, runtime data, and dev artefacts
rsync -avz --delete \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude 'openAIOS.yml' \
  --exclude 'data/' \
  --exclude 'workspaces/' \
  --exclude 'node_modules/' \
  --exclude '.git/' \
  --exclude '.turbo/' \
  --exclude '*.tsbuildinfo' \
  --filter='+ packages/*/dist/' \
  --filter='+ packages/*/package.json' \
  --filter='+ package.json' \
  --filter='+ pnpm-workspace.yaml' \
  --filter='+ pnpm-lock.yaml' \
  . "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/"

echo "✓ Files synced"

# Install production deps and restart
ssh "${REMOTE_USER}@${REMOTE_HOST}" bash <<REMOTE
  set -euo pipefail
  cd "${REMOTE_DIR}"

  # Install production dependencies only
  pnpm install --prod --frozen-lockfile 2>&1 | tail -5
  echo "✓ Dependencies installed"

  # Restart service (requires aios user to have sudo for systemctl)
  sudo systemctl restart "${SERVICE_NAME}.service"
  sleep 2
  systemctl is-active --quiet "${SERVICE_NAME}.service" && echo "✓ Service restarted and running" || {
    echo "ERROR: Service failed to start"
    sudo journalctl -u "${SERVICE_NAME}.service" -n 30 --no-pager
    exit 1
  }
REMOTE

echo ""
echo "=== Deploy complete ==="
