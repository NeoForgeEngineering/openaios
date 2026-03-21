export interface TtsProvider {
  /** Synthesize text to audio. Returns raw audio bytes. */
  synthesize(text: string, opts?: { voice?: string }): Promise<Buffer>
  /** Audio format produced (e.g. 'mp3', 'opus', 'wav') */
  readonly format: string
  /** Provider name */
  readonly name: string
}

export type TtsProviderName =
  | 'elevenlabs'
  | 'edge-tts'
  | 'openai-tts'
  | 'system'

export function createTtsProvider(
  provider: TtsProviderName,
  opts?: { apiKey?: string; voice?: string; baseUrl?: string },
): TtsProvider {
  switch (provider) {
    case 'elevenlabs':
      return new ElevenLabsTts(opts)
    case 'openai-tts':
      return new OpenAiTts(opts)
    case 'edge-tts':
      return new EdgeTts(opts)
    case 'system':
      return new SystemTts(opts)
  }
}

// ---------------------------------------------------------------------------
// ElevenLabs
// ---------------------------------------------------------------------------

class ElevenLabsTts implements TtsProvider {
  readonly format = 'mp3'
  readonly name = 'elevenlabs'
  private apiKey?: string
  private voice: string
  private baseUrl: string

  constructor(opts?: { apiKey?: string; voice?: string; baseUrl?: string }) {
    const apiKey = opts?.apiKey ?? process.env.ELEVENLABS_API_KEY
    if (apiKey !== undefined) this.apiKey = apiKey
    this.voice = opts?.voice ?? 'Rachel'
    this.baseUrl = opts?.baseUrl ?? 'https://api.elevenlabs.io/v1'
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<Buffer> {
    if (!this.apiKey) throw new Error('ElevenLabs API key required')

    const voice = opts?.voice ?? this.voice
    const res = await fetch(
      `${this.baseUrl}/text-to-speech/${encodeURIComponent(voice)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({ text, model_id: 'eleven_monolingual_v1' }),
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!res.ok) throw new Error(`ElevenLabs TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}

// ---------------------------------------------------------------------------
// OpenAI TTS
// ---------------------------------------------------------------------------

class OpenAiTts implements TtsProvider {
  readonly format = 'mp3'
  readonly name = 'openai-tts'
  private apiKey?: string
  private voice: string
  private baseUrl: string

  constructor(opts?: { apiKey?: string; voice?: string; baseUrl?: string }) {
    const apiKey = opts?.apiKey ?? process.env.OPENAI_API_KEY
    if (apiKey !== undefined) this.apiKey = apiKey
    this.voice = opts?.voice ?? 'alloy'
    this.baseUrl = opts?.baseUrl ?? 'https://api.openai.com/v1'
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<Buffer> {
    if (!this.apiKey) throw new Error('OpenAI API key required')

    const res = await fetch(`${this.baseUrl}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: opts?.voice ?? this.voice,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) throw new Error(`OpenAI TTS error: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
}

// ---------------------------------------------------------------------------
// Edge TTS (Microsoft, free, subprocess)
// ---------------------------------------------------------------------------

class EdgeTts implements TtsProvider {
  readonly format = 'mp3'
  readonly name = 'edge-tts'
  private voice: string

  constructor(opts?: { voice?: string }) {
    this.voice = opts?.voice ?? 'en-US-AriaNeural'
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<Buffer> {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { readFile, unlink } = await import('node:fs/promises')
    const { randomUUID } = await import('node:crypto')

    const execFileAsync = promisify(execFile)
    const outPath = join(tmpdir(), `edge-tts-${randomUUID()}.mp3`)
    const voice = opts?.voice ?? this.voice

    try {
      await execFileAsync(
        'edge-tts',
        ['--voice', voice, '--text', text, '--write-media', outPath],
        { timeout: 30_000 },
      )

      return await readFile(outPath)
    } finally {
      await unlink(outPath).catch(() => {})
    }
  }
}

// ---------------------------------------------------------------------------
// System TTS (macOS say, espeak)
// ---------------------------------------------------------------------------

class SystemTts implements TtsProvider {
  readonly format = 'wav'
  readonly name = 'system'
  private voice?: string

  constructor(opts?: { voice?: string }) {
    if (opts?.voice !== undefined) this.voice = opts.voice
  }

  async synthesize(text: string, opts?: { voice?: string }): Promise<Buffer> {
    const { execFile } = await import('node:child_process')
    const { promisify } = await import('node:util')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { readFile, unlink } = await import('node:fs/promises')
    const { randomUUID } = await import('node:crypto')

    const execFileAsync = promisify(execFile)
    const outPath = join(tmpdir(), `system-tts-${randomUUID()}.wav`)
    const voice = opts?.voice ?? this.voice

    try {
      if (process.platform === 'darwin') {
        const args = [text, '-o', outPath, '--data-format=LEI16@22050']
        if (voice) args.push('-v', voice)
        await execFileAsync('say', args, { timeout: 30_000 })
      } else {
        const args = [text, '-w', outPath]
        if (voice) args.push('-v', voice)
        await execFileAsync('espeak', args, { timeout: 30_000 })
      }
      return await readFile(outPath)
    } finally {
      await unlink(outPath).catch(() => {})
    }
  }
}
