import { execSync, spawnSync } from 'node:child_process'
import { writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { platform, homedir } from 'node:os'

const PLIST_LABEL = 'dev.openaios.agent'
const PLIST_PATH = resolve(homedir(), 'Library/LaunchAgents', `${PLIST_LABEL}.plist`)
const SYSTEMD_USER_UNIT = resolve(homedir(), '.config/systemd/user/openaios.service')
const SYSTEMD_SYSTEM_UNIT = '/etc/systemd/system/openaios.service'
const SERVICE_NAME = 'openaios'

function getEntryPoint(): string {
  const dir = dirname(fileURLToPath(import.meta.url))
  return resolve(dir, '../bin/openaios.js')
}

function getOS(): 'linux' | 'darwin' | 'other' {
  const p = platform()
  if (p === 'linux') return 'linux'
  if (p === 'darwin') return 'darwin'
  return 'other'
}

function isUserUnit(): boolean {
  return existsSync(SYSTEMD_USER_UNIT)
}

function isSystemUnit(): boolean {
  return existsSync(SYSTEMD_SYSTEM_UNIT)
}

function isMacInstalled(): boolean {
  return existsSync(PLIST_PATH)
}

// ── Install ──────────────────────────────────────────────────────────────────

export async function serviceInstallCommand(opts: { configDir?: string; userLevel?: boolean }): Promise<void> {
  const configDir = resolve(opts.configDir ?? process.cwd())
  const entry = getEntryPoint()
  const nodeBin = process.execPath
  const os = getOS()

  if (!existsSync(resolve(configDir, 'openAIOS.yml'))) {
    console.error(`[openaios] No openAIOS.yml found in ${configDir}`)
    console.error(`[openaios] Run 'openaios init' first, then re-run 'openaios service install'`)
    process.exit(1)
  }

  if (os === 'linux') {
    installLinux(nodeBin, entry, configDir, opts.userLevel ?? true)
  } else if (os === 'darwin') {
    installMac(nodeBin, entry, configDir)
  } else {
    console.error('[openaios] Service install supports Linux and macOS.')
    console.error('[openaios] On Windows: run openaios start, or set up Task Scheduler manually.')
    process.exit(1)
  }
}

function installLinux(nodeBin: string, entry: string, configDir: string, userLevel: boolean): void {
  const unit = `[Unit]
Description=openAIOS — AI agent runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${configDir}
ExecStart=${nodeBin} ${entry} start
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}
NoNewPrivileges=yes
PrivateTmp=yes

[Install]
WantedBy=${userLevel ? 'default.target' : 'multi-user.target'}
`

  if (userLevel) {
    mkdirSync(dirname(SYSTEMD_USER_UNIT), { recursive: true })
    writeFileSync(SYSTEMD_USER_UNIT, unit)
    exec('systemctl --user daemon-reload')
    exec('systemctl --user enable --now openaios.service')
    console.log('[openaios] ✓ Service installed (user systemd)')
    console.log('[openaios]   Manage:  systemctl --user start|stop|restart|status openaios')
    console.log('[openaios]   Logs:    journalctl --user -u openaios -f')
  } else {
    // Try writing directly, fall back to sudo
    try {
      writeFileSync(SYSTEMD_SYSTEM_UNIT, unit)
    } catch {
      const tmp = '/tmp/openaios.service'
      writeFileSync(tmp, unit)
      exec(`sudo mv ${tmp} ${SYSTEMD_SYSTEM_UNIT}`)
    }
    exec('sudo systemctl daemon-reload')
    exec(`sudo systemctl enable --now ${SERVICE_NAME}.service`)
    console.log('[openaios] ✓ Service installed (system systemd)')
    console.log('[openaios]   Manage:  sudo systemctl start|stop|restart|status openaios')
    console.log('[openaios]   Logs:    sudo journalctl -u openaios -f')
  }
}

function installMac(nodeBin: string, entry: string, configDir: string): void {
  const logDir = resolve(homedir(), '.openaios', 'logs')
  mkdirSync(logDir, { recursive: true })
  mkdirSync(dirname(PLIST_PATH), { recursive: true })

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodeBin}</string>
    <string>${entry}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${configDir}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${logDir}/openaios.log</string>
  <key>StandardErrorPath</key>
  <string>${logDir}/openaios.error.log</string>
</dict>
</plist>
`
  writeFileSync(PLIST_PATH, plist)
  // Unload silently if already loaded
  spawnSync('launchctl', ['unload', PLIST_PATH])
  exec(`launchctl load -w "${PLIST_PATH}"`)
  console.log('[openaios] ✓ Service installed (macOS LaunchAgent)')
  console.log(`[openaios]   Logs:   tail -f ${logDir}/openaios.log`)
  console.log(`[openaios]   Stop:   launchctl unload "${PLIST_PATH}"`)
  console.log(`[openaios]   Start:  launchctl load -w "${PLIST_PATH}"`)
}

// ── Uninstall ────────────────────────────────────────────────────────────────

export async function serviceUninstallCommand(): Promise<void> {
  const os = getOS()

  if (os === 'linux') {
    if (isUserUnit()) {
      try { exec('systemctl --user disable --now openaios.service') } catch { /* already stopped */ }
      unlinkSync(SYSTEMD_USER_UNIT)
      exec('systemctl --user daemon-reload')
      console.log('[openaios] ✓ Service removed (user systemd)')
    } else if (isSystemUnit()) {
      try { exec(`sudo systemctl disable --now ${SERVICE_NAME}.service`) } catch { /* already stopped */ }
      exec(`sudo rm -f ${SYSTEMD_SYSTEM_UNIT}`)
      exec('sudo systemctl daemon-reload')
      console.log('[openaios] ✓ Service removed (system systemd)')
    } else {
      console.log('[openaios] No installed service found.')
    }
  } else if (os === 'darwin') {
    if (isMacInstalled()) {
      try { exec(`launchctl unload "${PLIST_PATH}"`) } catch { /* already unloaded */ }
      unlinkSync(PLIST_PATH)
      console.log('[openaios] ✓ Service removed (macOS LaunchAgent)')
    } else {
      console.log('[openaios] No installed service found.')
    }
  }
}

// ── Start / Stop ─────────────────────────────────────────────────────────────

export async function serviceStartCommand(): Promise<void> {
  const os = getOS()
  if (os === 'linux') {
    const flag = isUserUnit() ? '--user' : ''
    exec(`systemctl ${flag} start ${SERVICE_NAME}.service`)
    console.log('[openaios] ✓ Service started')
  } else if (os === 'darwin') {
    exec(`launchctl load -w "${PLIST_PATH}"`)
    console.log('[openaios] ✓ Service started')
  }
}

export async function serviceStopCommand(): Promise<void> {
  const os = getOS()
  if (os === 'linux') {
    const flag = isUserUnit() ? '--user' : ''
    exec(`systemctl ${flag} stop ${SERVICE_NAME}.service`)
    console.log('[openaios] ✓ Service stopped')
  } else if (os === 'darwin') {
    exec(`launchctl unload "${PLIST_PATH}"`)
    console.log('[openaios] ✓ Service stopped')
  }
}

export async function serviceRestartCommand(): Promise<void> {
  const os = getOS()
  if (os === 'linux') {
    const flag = isUserUnit() ? '--user' : ''
    exec(`systemctl ${flag} restart ${SERVICE_NAME}.service`)
    console.log('[openaios] ✓ Service restarted')
  } else if (os === 'darwin') {
    spawnSync('launchctl', ['unload', PLIST_PATH])
    exec(`launchctl load -w "${PLIST_PATH}"`)
    console.log('[openaios] ✓ Service restarted')
  }
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function serviceStatusCommand(): Promise<void> {
  const os = getOS()
  if (os === 'linux') {
    const flag = isUserUnit() ? '--user' : ''
    spawnSync(`systemctl`, [flag, 'status', `${SERVICE_NAME}.service`].filter(Boolean), { stdio: 'inherit' })
  } else if (os === 'darwin') {
    const result = spawnSync('launchctl', ['list', PLIST_LABEL], { encoding: 'utf-8' })
    if (result.status === 0) {
      console.log(result.stdout)
    } else {
      console.log('[openaios] Service not running (or not installed)')
    }
  }
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export async function serviceLogsCommand(opts: { lines?: number }): Promise<void> {
  const lines = opts.lines ?? 50
  const os = getOS()
  if (os === 'linux') {
    const flag = isUserUnit() ? '--user' : ''
    spawnSync('journalctl', [flag, '-u', SERVICE_NAME, '-n', String(lines), '--no-pager'].filter(Boolean), { stdio: 'inherit' })
  } else if (os === 'darwin') {
    const logFile = resolve(homedir(), '.openaios', 'logs', 'openaios.log')
    if (existsSync(logFile)) {
      spawnSync('tail', ['-n', String(lines), logFile], { stdio: 'inherit' })
    } else {
      console.log(`[openaios] No log file found at ${logFile}`)
    }
  }
}

// ── Util ──────────────────────────────────────────────────────────────────────

function exec(cmd: string): void {
  execSync(cmd, { stdio: 'inherit' })
}
