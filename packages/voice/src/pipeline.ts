import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Convert audio between formats using ffmpeg.
 */
export async function convertAudio(
  input: Buffer,
  opts: { from: string; to: string; sampleRate?: number },
): Promise<Buffer> {
  const args = [
    '-i',
    'pipe:0',
    '-f',
    opts.to,
    ...(opts.sampleRate !== undefined ? ['-ar', String(opts.sampleRate)] : []),
    'pipe:1',
  ]

  return new Promise((resolve, reject) => {
    const child = execFile(
      'ffmpeg',
      args,
      {
        encoding: 'buffer' as never,
        maxBuffer: 50 * 1024 * 1024,
        timeout: 30_000,
      },
      (err, stdout) => {
        if (err) {
          reject(new Error(`ffmpeg conversion failed: ${err.message}`))
          return
        }
        resolve(stdout as unknown as Buffer)
      },
    )

    child.stdin?.write(input)
    child.stdin?.end()
  })
}

/**
 * Check if ffmpeg is available.
 */
export async function isFfmpegAvailable(): Promise<boolean> {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}
