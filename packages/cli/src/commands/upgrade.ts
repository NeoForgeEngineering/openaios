import { execSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { logger } from '@openaios/core'

const PLIST_PATH = resolve(
  homedir(),
  'Library/LaunchAgents/dev.openaios.agent.plist',
)
const SYSTEMD_USER_UNIT = resolve(
  homedir(),
  '.config/systemd/user/openaios.service',
)

function getInstallDir(): string {
  // dist/commands/ → dist/ → cli/ → packages/ → monorepo root
  const dir = dirname(fileURLToPath(import.meta.url))
  return resolve(dir, '../../../../')
}

function step(msg: string): void {
  logger.info('[openaios]', msg)
}
function ok(msg: string): void {
  logger.info('[openaios]', `✓ ${msg}`)
}
function exec(cmd: string, cwd?: string): void {
  execSync(cmd, { stdio: 'inherit', ...(cwd ? { cwd } : {}) })
}

export async function upgradeCommand(): Promise<void> {
  const installDir = getInstallDir()

  if (!existsSync(resolve(installDir, '.git'))) {
    logger.error(
      '[openaios]',
      `Install directory ${installDir} is not a git repository.`,
    )
    logger.error(
      '[openaios]',
      'If you installed via install.sh, try re-running the installer.',
    )
    process.exit(1)
  }

  step(`Upgrading openAIOS at ${installDir}`)

  step('Pulling latest from origin/main...')
  exec('git fetch --quiet origin', installDir)
  exec('git reset --hard origin/main --quiet', installDir)
  ok(
    `Updated to ${execSync('git rev-parse --short HEAD', { cwd: installDir }).toString().trim()}`,
  )

  step('Installing dependencies...')
  exec('pnpm install --frozen-lockfile --silent', installDir)
  ok('Dependencies updated')

  step('Building...')
  exec('pnpm build', installDir)
  ok('Build complete')

  // Rebuild native modules
  step('Rebuilding native modules...')
  try {
    const sqliteDir = execSync(
      `ls -d node_modules/.pnpm/better-sqlite3*/node_modules/better-sqlite3 2>/dev/null | head -1`,
      { cwd: installDir, encoding: 'utf-8' },
    ).trim()
    if (sqliteDir) {
      exec('npx node-gyp rebuild', resolve(installDir, sqliteDir))
      ok('Native modules rebuilt')
    }
  } catch {
    logger.warn(
      '[openaios]',
      'Native module rebuild skipped (run manually if needed)',
    )
  }

  // Restart service if running
  restartService()

  logger.info('[openaios]', '✓ Upgrade complete!')
}

function restartService(): void {
  const os = platform()
  if (os === 'linux') {
    if (existsSync(SYSTEMD_USER_UNIT)) {
      try {
        execSync('systemctl --user is-active --quiet openaios.service')
        exec('systemctl --user restart openaios.service')
        ok('Service restarted')
      } catch {
        /* not running — fine */
      }
    } else {
      try {
        execSync('systemctl is-active --quiet openaios.service')
        exec('sudo systemctl restart openaios.service')
        ok('Service restarted')
      } catch {
        /* not running — fine */
      }
    }
  } else if (os === 'darwin') {
    if (existsSync(PLIST_PATH)) {
      spawnSync('launchctl', ['unload', PLIST_PATH])
      try {
        exec(`launchctl load -w "${PLIST_PATH}"`)
        ok('Service restarted')
      } catch {
        /* fine */
      }
    }
  }
}
