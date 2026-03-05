#!/usr/bin/env bash
# install.sh — Install openAIOS on macOS or Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/NeoForgeEngineering/openaios/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/NeoForgeEngineering/openaios.git"
INSTALL_DIR="${OPENAIOS_DIR:-$HOME/.openaios}"
BIN_DIR="${BIN_DIR:-$HOME/.local/bin}"
MIN_NODE=22

# ── Colours ──────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
  CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; BOLD=''; NC=''
fi

ok()   { echo -e "  ${GREEN}✓${NC} $*"; }
info() { echo -e "  ${CYAN}→${NC} $*"; }
warn() { echo -e "  ${YELLOW}!${NC} $*"; }
fail() { echo -e "\n  ${RED}✗ $*${NC}\n"; exit 1; }

# ── Header ────────────────────────────────────────────────────────────────────
echo -e "\n${BOLD}${CYAN}openAIOS${NC} — AI agent orchestration OS"
echo -e "${CYAN}─────────────────────────────────────────${NC}\n"

# ── OS check ─────────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Darwin) ok "macOS detected" ;;
  Linux)  ok "Linux detected" ;;
  *)      fail "Unsupported OS: $OS (macOS and Linux only)" ;;
esac

# ── Node.js ───────────────────────────────────────────────────────────────────
ensure_node() {
  if command -v node &>/dev/null; then
    NODE_VER=$(node -e 'process.stdout.write(process.versions.node.split(".")[0])')
    if (( NODE_VER >= MIN_NODE )); then
      ok "Node.js $(node --version)"
      return 0
    fi
    warn "Node.js $(node --version) found — need $MIN_NODE+"
  fi

  info "Installing Node.js $MIN_NODE via nvm..."
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  source "$NVM_DIR/nvm.sh"
  nvm install "$MIN_NODE" --no-progress
  nvm alias default "$MIN_NODE"
  ok "Node.js $(node --version) installed via nvm"

  # Persist nvm in shell profile if not already there
  PROFILE="${BASH_PROFILE:-${HOME}/.bashrc}"
  [[ "$OS" == "Darwin" ]] && PROFILE="${HOME}/.zshrc"
  if ! grep -q 'NVM_DIR' "$PROFILE" 2>/dev/null; then
    {
      echo ''
      echo '# nvm (added by openAIOS installer)'
      echo "export NVM_DIR=\"\$HOME/.nvm\""
      echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"'
    } >> "$PROFILE"
    warn "nvm added to $PROFILE — reload shell after install: source $PROFILE"
  fi
}

# ── pnpm ──────────────────────────────────────────────────────────────────────
ensure_pnpm() {
  if command -v pnpm &>/dev/null; then
    ok "pnpm $(pnpm --version)"
    return
  fi
  info "Installing pnpm..."
  npm install -g pnpm --quiet
  ok "pnpm $(pnpm --version)"
}

# ── Repo ──────────────────────────────────────────────────────────────────────
setup_repo() {
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Updating existing install at ${CYAN}$INSTALL_DIR${NC}..."
    git -C "$INSTALL_DIR" fetch --quiet origin
    git -C "$INSTALL_DIR" reset --hard origin/main --quiet
    ok "Repository updated to $(git -C "$INSTALL_DIR" rev-parse --short HEAD)"
  else
    info "Cloning openAIOS into ${CYAN}$INSTALL_DIR${NC}..."
    git clone --quiet "$REPO" "$INSTALL_DIR"
    ok "Repository cloned ($(git -C "$INSTALL_DIR" rev-parse --short HEAD))"
  fi
}

# ── Build ─────────────────────────────────────────────────────────────────────
build() {
  info "Installing dependencies..."
  (cd "$INSTALL_DIR" && pnpm install --frozen-lockfile --silent 2>&1 | tail -2) || \
    fail "pnpm install failed"
  ok "Dependencies installed"

  info "Building all packages..."
  (cd "$INSTALL_DIR" && pnpm build 2>&1 | tail -3) || fail "pnpm build failed"
  ok "Build complete"

  # Rebuild native modules for the running Node version
  info "Rebuilding native modules..."
  local sqlite_dir
  sqlite_dir=$(ls -d "$INSTALL_DIR/node_modules/.pnpm/better-sqlite3"*/node_modules/better-sqlite3 2>/dev/null | head -1 || true)
  if [[ -n "$sqlite_dir" ]]; then
    (cd "$sqlite_dir" && npx node-gyp rebuild 2>/dev/null && ok "Native modules rebuilt") || \
      warn "Native module rebuild failed — run manually if you see binding errors: cd $sqlite_dir && npx node-gyp rebuild"
  fi
}

# ── Binary wrapper ────────────────────────────────────────────────────────────
link_bin() {
  local entry="$INSTALL_DIR/packages/cli/dist/bin/openaios.js"
  local bin="$BIN_DIR/openaios"

  mkdir -p "$BIN_DIR"

  cat > "$bin" <<WRAPPER
#!/usr/bin/env bash
export OPENAIOS_DIR="${INSTALL_DIR}"
exec node "${entry}" "\$@"
WRAPPER
  chmod +x "$bin"
  ok "Binary installed: ${CYAN}$bin${NC}"

  # PATH advisory
  if ! echo ":$PATH:" | grep -q ":$BIN_DIR:"; then
    warn "${BIN_DIR} is not in PATH."
    PROFILE="${HOME}/.bashrc"
    [[ "$OS" == "Darwin" ]] && PROFILE="${HOME}/.zshrc"
    echo ""
    echo "  Add to ${BOLD}$PROFILE${NC}:"
    echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
    echo ""
    echo "  Then reload:  source $PROFILE"
    echo "  Or run now:   export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
}

# ── Run ───────────────────────────────────────────────────────────────────────
ensure_node
ensure_pnpm
setup_repo
build
link_bin

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}openAIOS installed!${NC}"
echo ""
echo "  Get started:"
echo "    openaios init              # scaffold openAIOS.yml"
echo "    \$EDITOR openAIOS.yml      # configure your agents"
echo "    openaios start             # run in the foreground"
echo "    openaios service install   # register as a background daemon"
echo ""
echo "  Update later:"
echo "    openaios upgrade           # pull latest + rebuild"
echo ""
echo -e "  Docs: ${CYAN}https://github.com/NeoForgeEngineering/openaios${NC}"
echo ""
